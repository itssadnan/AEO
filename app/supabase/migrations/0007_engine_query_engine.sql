-- Module 5.3 — Engine Query Engine
-- Durable queue + raw grounded results. The Edge Function uses the service-role
-- key; customer access is read-only and always constrained by workspace membership.

create table public.ai_task_configs (
  id uuid primary key default gen_random_uuid(),
  task_key text not null check (task_key in ('grounded_search', 'extraction', 'explanation_generation', 'prompt_suggestion', 'outreach_email_drafting')),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('gemini', 'nvidia_nim')),
  model text not null check (char_length(model) between 1 and 200),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique nulls not distinct (task_key, workspace_id)
);

alter table public.ai_task_configs enable row level security;
-- Deliberately no customer policies. Only the server-side Admin Console (5.10)
-- and worker use this routing/cost-sensitive table through the service role.

insert into public.ai_task_configs (task_key, provider, model) values
  ('grounded_search', 'gemini', 'gemini-2.5-flash-lite'),
  ('extraction', 'nvidia_nim', 'meta/llama-3.1-8b-instruct'),
  ('explanation_generation', 'nvidia_nim', 'meta/llama-3.1-8b-instruct'),
  ('prompt_suggestion', 'gemini', 'gemini-2.5-flash-lite'),
  ('outreach_email_drafting', 'nvidia_nim', 'meta/llama-3.1-8b-instruct');

create table public.check_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  provider text not null,
  model text not null,
  raw_answer text,
  citations jsonb not null default '[]'::jsonb,
  grounding_metadata jsonb not null default '{}'::jsonb,
  status text not null check (status in ('success', 'error', 'rate_limited')),
  error_code text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index check_runs_prompt_checked_at_idx on public.check_runs(prompt_id, checked_at desc);
create index check_runs_brand_checked_at_idx on public.check_runs(brand_id, checked_at desc);
alter table public.check_runs enable row level security;
create policy "check_runs_select_member" on public.check_runs for select
  using (private.is_workspace_member(workspace_id, (select auth.uid())));

create table public.check_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  source text not null check (source in ('scheduled', 'free_on_demand', 'public_free_check', 'growth_automation')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'retry', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now()
);
create index check_jobs_available_idx on public.check_jobs(status, available_at) where status in ('queued', 'retry');
create unique index check_jobs_one_open_per_prompt_idx on public.check_jobs(prompt_id) where status in ('queued', 'processing', 'retry');
alter table public.check_jobs enable row level security;
-- A job can reveal a customer's prompt cadence, so it is never client-readable.

create table public.ai_provider_key_health (
  provider text not null check (provider in ('gemini', 'nvidia_nim')),
  key_slot text not null check (key_slot in ('primary', 'secondary', 'tertiary')),
  is_dead boolean not null default false,
  dead_at timestamptz,
  last_error_code text,
  updated_at timestamptz not null default now(),
  primary key (provider, key_slot)
);
insert into public.ai_provider_key_health(provider, key_slot)
select provider, key_slot from (values ('gemini'), ('nvidia_nim')) providers(provider)
cross join (values ('primary'), ('secondary'), ('tertiary')) slots(key_slot);
alter table public.ai_provider_key_health enable row level security;

create table public.ai_provider_settings (
  provider text primary key check (provider in ('gemini', 'nvidia_nim')),
  failover_mode text not null default 'shared' check (failover_mode in ('shared', 'emergency-only')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.ai_provider_settings(provider) values ('gemini'), ('nvidia_nim');
alter table public.ai_provider_settings enable row level security;

create table public.engine_error_logs (
  id bigint generated always as identity primary key,
  provider text not null,
  key_slot text,
  job_id uuid references public.check_jobs(id) on delete set null,
  error_code text not null,
  retryable boolean not null,
  created_at timestamptz not null default now()
);
create index engine_error_logs_created_at_idx on public.engine_error_logs(created_at desc);
alter table public.engine_error_logs enable row level security;

-- Free on-demand checks are atomically authorised, lifetime-capped and queued.
create or replace function public.enqueue_free_check(p_workspace_id uuid, p_brand_id uuid, p_prompt_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_job_id uuid; v_plan text; v_experiments integer; v_prompt_valid boolean;
begin
  if auth.uid() is null or not (private.has_workspace_role(p_workspace_id, auth.uid(), 'owner') or private.has_workspace_role(p_workspace_id, auth.uid(), 'member')) then
    raise exception 'FORBIDDEN: insufficient workspace permission' using errcode = '42501';
  end if;
  select plan_tier, experiments_used into v_plan, v_experiments from public.workspaces where id = p_workspace_id for update;
  if not found then raise exception 'WORKSPACE_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_plan <> 'free' then raise exception 'PAID_WORKSPACE: use scheduled checks' using errcode = 'P0001'; end if;
  if v_experiments >= 3 then raise exception 'FREE_EXPERIMENT_CAP_REACHED' using errcode = 'P0001'; end if;
  select exists(select 1 from public.prompts p join public.brands b on b.id = p.brand_id where p.id = p_prompt_id and p.brand_id = p_brand_id and b.workspace_id = p_workspace_id and p.is_active) into v_prompt_valid;
  if not v_prompt_valid then raise exception 'INVALID_BRAND_OR_PROMPT' using errcode = 'P0001'; end if;
  insert into public.check_jobs(workspace_id, brand_id, prompt_id, source) values(p_workspace_id, p_brand_id, p_prompt_id, 'free_on_demand') returning id into v_job_id;
  update public.workspaces set experiments_used = experiments_used + 1 where id = p_workspace_id;
  return v_job_id;
exception when unique_violation then raise exception 'CHECK_ALREADY_QUEUED' using errcode = 'P0001';
end; $$;
revoke all on function public.enqueue_free_check(uuid, uuid, uuid) from public, anon;
grant execute on function public.enqueue_free_check(uuid, uuid, uuid) to authenticated;

-- The scheduler invokes this as service_role. Intervals intentionally live here
-- (weekly Starter, daily Growth/Agency), so jobs spread by a stable hash minute.
create or replace function public.enqueue_due_paid_checks(p_limit integer default 100)
returns integer language plpgsql security definer set search_path = public as $$
declare v_inserted integer;
begin
  insert into public.check_jobs(workspace_id, brand_id, prompt_id, source, available_at)
  select b.workspace_id, b.id, p.id, 'scheduled', now() + make_interval(mins => mod(abs(hashtext(p.id::text)), 60))
  from public.prompts p join public.brands b on b.id = p.brand_id join public.workspaces w on w.id = b.workspace_id
  where p.is_active and w.plan_tier in ('starter','growth','agency')
    and not exists (select 1 from public.check_jobs open_job where open_job.prompt_id = p.id and open_job.status in ('queued','processing','retry'))
    and not exists (select 1 from public.check_runs r where r.prompt_id = p.id and r.status = 'success' and r.checked_at > now() - case when w.plan_tier = 'starter' then interval '7 days' else interval '1 day' end)
  order by coalesce((select max(r.checked_at) from public.check_runs r where r.prompt_id = p.id), 'epoch'::timestamptz)
  limit greatest(1, least(p_limit, 250)) on conflict do nothing;
  get diagnostics v_inserted = row_count; return v_inserted;
end; $$;
revoke all on function public.enqueue_due_paid_checks(integer) from public, anon, authenticated;
grant execute on function public.enqueue_due_paid_checks(integer) to service_role;

create or replace function public.claim_check_jobs(p_limit integer default 10)
returns table(job_id uuid, workspace_id uuid, brand_id uuid, prompt_id uuid, prompt_text text)
language plpgsql security definer set search_path = public as $$
begin
  return query with candidates as (
    select j.id from public.check_jobs j where j.status in ('queued','retry') and j.available_at <= now()
    order by j.available_at asc for update skip locked limit greatest(1, least(p_limit, 25))
  ), claimed as (
    update public.check_jobs j set status='processing', locked_at=now(), attempts=j.attempts+1 from candidates c where j.id=c.id
    returning j.id, j.workspace_id, j.brand_id, j.prompt_id
  ) select c.id, c.workspace_id, c.brand_id, c.prompt_id, p.text from claimed c join public.prompts p on p.id=c.prompt_id;
end; $$;
revoke all on function public.claim_check_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_check_jobs(integer) to service_role;

create or replace function public.complete_check_job(p_job_id uuid, p_provider text, p_model text, p_raw_answer text, p_citations jsonb, p_grounding_metadata jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare j public.check_jobs;
begin
  select * into j from public.check_jobs where id=p_job_id and status='processing' for update;
  if not found then raise exception 'JOB_NOT_PROCESSING' using errcode = 'P0001'; end if;
  insert into public.check_runs(workspace_id,brand_id,prompt_id,provider,model,raw_answer,citations,grounding_metadata,status)
  values(j.workspace_id,j.brand_id,j.prompt_id,p_provider,p_model,p_raw_answer,p_citations,p_grounding_metadata,'success');
  update public.check_jobs set status='completed',completed_at=now(),locked_at=null,last_error_code=null where id=p_job_id;
end; $$;

create or replace function public.retry_or_fail_check_job(p_job_id uuid, p_error_code text, p_retry_after_seconds integer default 60)
returns void language plpgsql security definer set search_path = public as $$
declare j public.check_jobs; v_retry boolean;
begin
  select * into j from public.check_jobs where id=p_job_id and status='processing' for update;
  if not found then return; end if; v_retry := j.attempts < 5;
  update public.check_jobs set status=case when v_retry then 'retry' else 'failed' end, available_at=case when v_retry then now()+make_interval(secs=>greatest(30,least(p_retry_after_seconds,3600))) else available_at end, locked_at=null, completed_at=case when v_retry then null else now() end,last_error_code=p_error_code where id=p_job_id;
  insert into public.check_runs(workspace_id,brand_id,prompt_id,provider,model,status,error_code) values(j.workspace_id,j.brand_id,j.prompt_id,'gemini','unknown',case when p_error_code='rate_limited' then 'rate_limited' else 'error' end,p_error_code);
  insert into public.engine_error_logs(provider,job_id,error_code,retryable) values('gemini',p_job_id,p_error_code,v_retry);
end; $$;

create or replace function public.mark_ai_key_dead(p_provider text, p_key_slot text, p_error_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.ai_provider_key_health set is_dead=true,dead_at=now(),last_error_code=p_error_code,updated_at=now() where provider=p_provider and key_slot=p_key_slot;
  insert into public.engine_error_logs(provider,key_slot,error_code,retryable) values(p_provider,p_key_slot,p_error_code,false);
end; $$;

revoke all on function public.complete_check_job(uuid,text,text,text,jsonb,jsonb), public.retry_or_fail_check_job(uuid,text,integer), public.mark_ai_key_dead(text,text,text) from public, anon, authenticated;
grant execute on function public.complete_check_job(uuid,text,text,text,jsonb,jsonb), public.retry_or_fail_check_job(uuid,text,integer), public.mark_ai_key_dead(text,text,text) to service_role;

-- Setup is intentionally separate from the migration because Vault secrets are
-- environment-specific. After deploying engine-worker, set project_url and
-- publishable_key in Vault, then create a per-minute pg_cron net.http_post job
-- following Supabase's documented Scheduling Edge Functions pattern.
