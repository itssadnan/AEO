-- Module 5.4 — NLP Extraction & Structuring.
-- One check_extractions row per successful check_runs row, enqueued by a
-- trigger (not a scan) the instant complete_check_job() (owned by 5.3, not
-- touched here) inserts a status='success' check_runs row. Queue lifecycle
-- mirrors check_jobs from migration 0007 deliberately, for consistency:
-- queued -> processing -> (completed | retry -> processing... | failed).

create table public.check_extractions (
  id uuid primary key default gen_random_uuid(),
  check_run_id uuid not null unique references public.check_runs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  provider text,
  model text,
  brand_mentioned boolean,
  position_among_competitors integer,
  reasoning text,
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  competitor_names_found text[] not null default '{}',
  cited_domains text[] not null default '{}',
  -- Array of {"domain": string, "type": "review_site"|"comparison_page"|"forum"|"documentation"|"other"}.
  -- No DB check constraint on the jsonb shape -- same precedent as check_runs.citations
  -- (migration 0007), which also relies on zod validation before insert rather than a
  -- DB-level constraint on jsonb contents.
  cited_domain_types jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'processing', 'retry', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  claimed_at timestamptz,
  last_error_code text,
  extracted_at timestamptz,
  created_at timestamptz not null default now()
);

create index check_extractions_claimable_idx on public.check_extractions(status) where status in ('queued', 'retry');
create index check_extractions_brand_extracted_at_idx on public.check_extractions(brand_id, extracted_at desc);

alter table public.check_extractions enable row level security;
create policy "check_extractions_select_member" on public.check_extractions for select
  using (private.is_workspace_member(workspace_id, (select auth.uid())));
-- No client insert/update/delete policy, same reasoning as check_jobs: only the
-- extraction-worker (service_role) ever writes this table.

-- Enqueue on success, event-driven -- no scan needed, no race with the worker.
create or replace function public.enqueue_extraction_for_check_run()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'success' then
    insert into public.check_extractions(check_run_id, workspace_id, brand_id, prompt_id)
    values (new.id, new.workspace_id, new.brand_id, new.prompt_id)
    on conflict (check_run_id) do nothing;
  end if;
  return new;
end; $$;

create trigger check_runs_enqueue_extraction
  after insert on public.check_runs
  for each row execute function public.enqueue_extraction_for_check_run();

-- Claim + join brand name/competitor names/raw answer in one round trip, so
-- the worker doesn't need N extra REST calls per job.
create or replace function public.claim_extraction_jobs(p_limit integer default 10)
returns table(
  extraction_id uuid, check_run_id uuid, workspace_id uuid, brand_id uuid, prompt_id uuid,
  raw_answer text, citations jsonb, brand_name text, competitor_names text[]
)
language plpgsql security definer set search_path = public as $$
begin
  return query with candidates as (
    select e.id from public.check_extractions e
    where e.status in ('queued', 'retry')
    order by e.created_at asc
    for update skip locked
    limit greatest(1, least(p_limit, 25))
  ), claimed as (
    update public.check_extractions e
    set status = 'processing', claimed_at = now(), attempts = e.attempts + 1
    from candidates c where e.id = c.id
    returning e.id, e.check_run_id, e.workspace_id, e.brand_id, e.prompt_id
  )
  select c.id, c.check_run_id, c.workspace_id, c.brand_id, c.prompt_id,
    r.raw_answer, r.citations, b.name,
    coalesce(array_agg(comp.name) filter (where comp.name is not null), '{}')
  from claimed c
  join public.check_runs r on r.id = c.check_run_id
  join public.brands b on b.id = c.brand_id
  left join public.competitors comp on comp.brand_id = c.brand_id
  group by c.id, c.check_run_id, c.workspace_id, c.brand_id, c.prompt_id, r.raw_answer, r.citations, b.name;
end; $$;

create or replace function public.complete_extraction(
  p_extraction_id uuid, p_provider text, p_model text, p_brand_mentioned boolean,
  p_position_among_competitors integer, p_reasoning text, p_sentiment text,
  p_competitor_names_found text[], p_cited_domains text[], p_cited_domain_types jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.check_extractions set
    status = 'completed', provider = p_provider, model = p_model,
    brand_mentioned = p_brand_mentioned, position_among_competitors = p_position_among_competitors,
    reasoning = p_reasoning, sentiment = p_sentiment,
    competitor_names_found = p_competitor_names_found, cited_domains = p_cited_domains,
    cited_domain_types = p_cited_domain_types, extracted_at = now(), claimed_at = null, last_error_code = null
  where id = p_extraction_id and status = 'processing';
  if not found then raise exception 'EXTRACTION_NOT_PROCESSING' using errcode = 'P0001'; end if;
end; $$;

-- Mirrors retry_or_fail_check_job's shape (migration 0007/0009): same 5-attempt
-- cap, same queued/processing/retry/failed vocabulary, for consistency.
create or replace function public.retry_or_fail_extraction(p_extraction_id uuid, p_error_code text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.check_extractions; v_retry boolean;
begin
  select * into e from public.check_extractions where id = p_extraction_id and status = 'processing' for update;
  if not found then return; end if;
  v_retry := e.attempts < 5;
  update public.check_extractions
  set status = case when v_retry then 'retry' else 'failed' end, claimed_at = null, last_error_code = p_error_code
  where id = p_extraction_id;
end; $$;

-- Mirrors reclaim_stale_check_jobs (migration 0009) -- a crashed/timed-out
-- worker invocation shouldn't leave a row stuck in 'processing' forever.
create or replace function public.reclaim_stale_extractions(p_stale_after_minutes integer default 5)
returns integer language plpgsql security definer set search_path = public as $$
declare v_reclaimed integer;
begin
  with stale as (
    select id from public.check_extractions
    where status = 'processing' and claimed_at < now() - make_interval(mins => greatest(1, p_stale_after_minutes))
  )
  update public.check_extractions e set status = 'retry', claimed_at = null
  from stale s where e.id = s.id;
  get diagnostics v_reclaimed = row_count;
  return v_reclaimed;
end; $$;

revoke all on function public.claim_extraction_jobs(integer),
  public.complete_extraction(uuid,text,text,boolean,integer,text,text,text[],text[],jsonb),
  public.retry_or_fail_extraction(uuid,text),
  public.reclaim_stale_extractions(integer)
  from public, anon, authenticated;
grant execute on function public.claim_extraction_jobs(integer),
  public.complete_extraction(uuid,text,text,boolean,integer,text,text,text[],text[],jsonb),
  public.retry_or_fail_extraction(uuid,text),
  public.reclaim_stale_extractions(integer)
  to service_role;