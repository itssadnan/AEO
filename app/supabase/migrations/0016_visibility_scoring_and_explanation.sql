-- Module 5.5 — Visibility Scoring, Share-of-Voice & Explanation Engine.
-- Unlike 5.3/5.4's queue pattern, a visibility_snapshots row is inserted already
-- containing its real score/mention_count/avg_rank/share_of_voice/source_influence/
-- opportunity_gaps -- these are pure SQL, zero external dependency, computed
-- synchronously at insert time. `status` tracks ONLY the optional, paid-only,
-- NVIDIA NIM explanation prose sub-step -- a row with status='not_applicable' is
-- already complete and final. See progress/specs/5.5-*.md "Architecture decisions"
-- for the full reasoning.

create table public.visibility_snapshots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  score integer not null check (score between 0 and 100),
  mention_count integer not null default 0 check (mention_count >= 0),
  avg_rank numeric,
  share_of_voice jsonb not null default '{}'::jsonb,
  source_influence jsonb not null default '[]'::jsonb,
  -- Paid-only fields below; all null when explanation_skip_reason is set.
  explanation_breakdown jsonb,
  opportunity_gaps jsonb not null default '[]'::jsonb,
  recommended_actions jsonb,
  explanation_skip_reason text check (explanation_skip_reason in ('free_plan', 'no_competitor_ahead')),
  status text not null default 'not_applicable' check (status in ('not_applicable', 'queued', 'processing', 'retry', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  claimed_at timestamptz,
  last_error_code text,
  explanation_provider text,
  explanation_model text,
  explanation_completed_at timestamptz,
  generated_at timestamptz not null default now()
);

create index visibility_snapshots_brand_generated_idx on public.visibility_snapshots(brand_id, generated_at desc);
create index visibility_snapshots_claimable_idx on public.visibility_snapshots(status) where status in ('queued', 'retry');

alter table public.visibility_snapshots enable row level security;
create policy "visibility_snapshots_select_member" on public.visibility_snapshots for select
  using (private.is_workspace_member(workspace_id, (select auth.uid())));
-- No client insert/update/delete policy -- only the scoring cycle function and the
-- explanation worker (both service_role / SECURITY DEFINER) ever write this table.

-- ============================================================================
-- Deterministic scoring: computes and inserts one snapshot per brand with fresh
-- data since its last snapshot. Zero external calls -- safe to run synchronously.
-- ============================================================================
create or replace function public.run_visibility_scoring_cycle()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_created integer := 0;
  r_brand record;
  v_period_start date := current_date - 6;
  v_period_end date := current_date;
  v_total_checks integer;
  v_mention_count integer;
  v_avg_rank numeric;
  v_score integer;
  v_share_of_voice jsonb;
  v_source_influence jsonb;
  v_top_competitor_name text;
  v_top_competitor_mentions integer;
  v_status text;
  v_skip_reason text;
  v_opportunity_gaps jsonb;
  v_explanation_breakdown jsonb;
begin
  for r_brand in
    select b.id as brand_id, b.workspace_id, b.name as brand_name, w.plan_tier
    from public.brands b
    join public.workspaces w on w.id = b.workspace_id
    where exists (
      select 1 from public.check_extractions ce
      where ce.brand_id = b.id and ce.status = 'completed'
        and ce.extracted_at > coalesce(
          (select max(vs.generated_at) from public.visibility_snapshots vs where vs.brand_id = b.id),
          '-infinity'::timestamptz
        )
    )
  loop
    select count(*), count(*) filter (where ce.brand_mentioned),
      avg(ce.position_among_competitors) filter (where ce.brand_mentioned)
      into v_total_checks, v_mention_count, v_avg_rank
    from public.check_extractions ce
    where ce.brand_id = r_brand.brand_id and ce.status = 'completed'
      and ce.extracted_at::date between v_period_start and v_period_end;

    if v_total_checks = 0 then
      continue; -- guard against a divide-by-zero; shouldn't happen given the EXISTS check above
    end if;

    -- Position-weighted score: DCG-style discount (1 / log2(rank + 1)), 0 when not
    -- mentioned. Interpretive choice (the spec docx says "weighted, adjusted for
    -- position" without giving exact weights) -- being mentioned first is worth
    -- much more than being mentioned 5th, but any mention still counts for
    -- something, and this is a well-known, defensible discounting curve rather
    -- than an arbitrary lookup table. Document this choice in your report; do not
    -- silently pick a different formula.
    select round(100 * avg(
      case when ce.brand_mentioned
        then 1.0 / (ln(ce.position_among_competitors + 1) / ln(2))
        else 0 end
    ))::integer
    into v_score
    from public.check_extractions ce
    where ce.brand_id = r_brand.brand_id and ce.status = 'completed'
      and ce.extracted_at::date between v_period_start and v_period_end;

    select jsonb_build_object(
      'total_checks', v_total_checks,
      'brand', jsonb_build_object(
        'name', r_brand.brand_name, 'mention_count', v_mention_count,
        'share_pct', round(100.0 * v_mention_count / v_total_checks, 1)
      ),
      'competitors', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', comp.name,
          'mention_count', comp_counts.mention_count,
          'share_pct', round(100.0 * comp_counts.mention_count / v_total_checks, 1)
        ) order by comp_counts.mention_count desc)
        from public.competitors comp
        cross join lateral (
          select count(*) as mention_count
          from public.check_extractions ce
          where ce.brand_id = r_brand.brand_id and ce.status = 'completed'
            and ce.extracted_at::date between v_period_start and v_period_end
            and comp.name = any(ce.competitor_names_found)
        ) comp_counts
        where comp.brand_id = r_brand.brand_id
      ), '[]'::jsonb)
    ) into v_share_of_voice;

    -- The window function (sum(...) over ()) must be computed in its own
    -- subquery level before jsonb_agg() aggregates the result -- Postgres
    -- rejects a window function nested directly inside an aggregate call
    -- ("aggregate function calls cannot contain window function calls").
    -- Found live 2026-07-26: this exact bug was present, unnoticed, in both
    -- this block and the explanation_breakdown 'breakdown' block below --
    -- static review (types/lint/spec-diff) can't catch a Postgres runtime
    -- error; only actually executing the function against a live DB did.
    select coalesce(jsonb_agg(jsonb_build_object(
      'domain_type', t.domain_type, 'citation_count', t.citation_count, 'pct', t.pct
    ) order by t.citation_count desc), '[]'::jsonb)
    into v_source_influence
    from (
      select domain_type, citation_count,
        round(100.0 * citation_count / greatest(1, sum(citation_count) over ()), 1) as pct
      from (
        select (elem->>'type') as domain_type, count(*) as citation_count
        from public.check_extractions ce, jsonb_array_elements(ce.cited_domain_types) elem
        where ce.brand_id = r_brand.brand_id and ce.status = 'completed'
          and ce.extracted_at::date between v_period_start and v_period_end
        group by (elem->>'type')
      ) counts
    ) t;

    -- "Winning" competitor = highest mention_count among named competitors, only
    -- if it strictly beats the brand's own mention_count. share_of_voice's
    -- 'competitors' array is already sorted descending by mention_count above, so
    -- index 0 is the top competitor -- claim_visibility_explanation_jobs below
    -- relies on this same ordering; do not change the ORDER BY without updating it.
    select comp_row->>'name', (comp_row->>'mention_count')::integer
      into v_top_competitor_name, v_top_competitor_mentions
    from jsonb_array_elements(v_share_of_voice->'competitors') comp_row
    order by (comp_row->>'mention_count')::integer desc
    limit 1;

    v_opportunity_gaps := '[]'::jsonb;
    v_explanation_breakdown := null;

    if r_brand.plan_tier = 'free' then
      v_status := 'not_applicable'; v_skip_reason := 'free_plan';
    elsif v_top_competitor_name is null or v_top_competitor_mentions <= v_mention_count then
      v_status := 'not_applicable'; v_skip_reason := 'no_competitor_ahead';
    else
      v_status := 'queued'; v_skip_reason := null;

      -- Opportunity gaps: domain types the top competitor gets cited on that this
      -- brand has ZERO citations on at all, across the fixed 5-value taxonomy from
      -- Module 5.4 (app/src/modules/nlp-extraction/schemas.ts DOMAIN_TYPES). This
      -- literal list must stay in sync with that TS constant -- same class of
      -- duplicated-source-of-truth risk as the Deno/Node provider file pairs
      -- elsewhere in this project. Flag this in your report, don't just copy it
      -- silently.
      with domain_types(domain_type) as (
        values ('review_site'), ('comparison_page'), ('forum'), ('documentation'), ('other')
      ),
      brand_citations as (
        select (elem->>'type') as domain_type, count(*) as citation_count
        from public.check_extractions ce, jsonb_array_elements(ce.cited_domain_types) elem
        where ce.brand_id = r_brand.brand_id and ce.status = 'completed'
          and ce.extracted_at::date between v_period_start and v_period_end
        group by (elem->>'type')
      ),
      competitor_citations as (
        select (elem->>'type') as domain_type, count(*) as citation_count
        from public.check_extractions ce, jsonb_array_elements(ce.cited_domain_types) elem
        where ce.brand_id = r_brand.brand_id and ce.status = 'completed'
          and ce.extracted_at::date between v_period_start and v_period_end
          and v_top_competitor_name = any(ce.competitor_names_found)
        group by (elem->>'type')
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'domain_type', dt.domain_type,
        'competitor_citation_count', coalesce(cc.citation_count, 0),
        'competitor_pct', round(100.0 * coalesce(cc.citation_count, 0) / greatest(1, (select sum(citation_count) from competitor_citations)), 1),
        'brand_citation_count', 0
      ) order by coalesce(cc.citation_count, 0) desc), '[]'::jsonb)
      into v_opportunity_gaps
      from domain_types dt
      left join competitor_citations cc on cc.domain_type = dt.domain_type
      left join brand_citations bc on bc.domain_type = dt.domain_type
      where coalesce(bc.citation_count, 0) = 0 and coalesce(cc.citation_count, 0) > 0;

      -- Numeric skeleton for the Explanation Engine -- explanation_text is added
      -- later by complete_visibility_explanation(); everything numeric here is
      -- already final and correct, per the architecture decision above.
      with competitor_citations as (
        select (elem->>'type') as domain_type, count(*) as citation_count
        from public.check_extractions ce, jsonb_array_elements(ce.cited_domain_types) elem
        where ce.brand_id = r_brand.brand_id and ce.status = 'completed'
          and ce.extracted_at::date between v_period_start and v_period_end
          and v_top_competitor_name = any(ce.competitor_names_found)
        group by (elem->>'type')
      )
      select jsonb_build_object(
        'competitor_name', v_top_competitor_name,
        'citation_ratio', round(v_top_competitor_mentions::numeric / greatest(1, v_mention_count), 1),
        -- Same window-function-inside-aggregate fix as v_source_influence above.
        'breakdown', coalesce((
          select jsonb_agg(jsonb_build_object('domain_type', domain_type, 'pct', pct) order by citation_count desc)
          from (
            select domain_type, citation_count,
              round(100.0 * citation_count / greatest(1, sum(citation_count) over ()), 1) as pct
            from competitor_citations
          ) cc_pct
        ), '[]'::jsonb)
      ) into v_explanation_breakdown;
    end if;

    insert into public.visibility_snapshots (
      brand_id, workspace_id, period_start, period_end, score, mention_count, avg_rank,
      share_of_voice, source_influence, explanation_breakdown, opportunity_gaps,
      status, explanation_skip_reason
    ) values (
      r_brand.brand_id, r_brand.workspace_id, v_period_start, v_period_end, v_score, v_mention_count, v_avg_rank,
      v_share_of_voice, v_source_influence, v_explanation_breakdown, v_opportunity_gaps,
      v_status, v_skip_reason
    );
    v_created := v_created + 1;
  end loop;
  return v_created;
end; $$;

-- ============================================================================
-- Explanation queue: mirrors claim_extraction_jobs / complete_extraction /
-- retry_or_fail_extraction / reclaim_stale_extractions from migration 0013,
-- deliberately, for consistency -- this is the ONE sub-step that needs it.
-- ============================================================================
create or replace function public.claim_visibility_explanation_jobs(p_limit integer default 10)
returns table(
  snapshot_id uuid, workspace_id uuid, brand_id uuid, brand_name text,
  competitor_name text, brand_mention_count integer, competitor_mention_count integer,
  -- citation_ratio is read straight from explanation_breakdown, where
  -- run_visibility_scoring_cycle() already computed it (rounded to 1 decimal) --
  -- the explanation worker/prompt must never re-derive this via division itself,
  -- per the "every number computed once, in SQL" architecture decision. See
  -- progress/specs/5.5-*.md and the 2026-07-26 decisions-log entry in
  -- progress/modules/5.5-*.md for why this was added after the initial delegation.
  citation_ratio numeric,
  brand_citation_profile jsonb, competitor_citation_profile jsonb, opportunity_gaps jsonb
)
language plpgsql security definer set search_path = public as $$
begin
  return query with candidates as (
    select vs.id from public.visibility_snapshots vs
    where vs.status in ('queued', 'retry')
    order by vs.generated_at asc
    for update skip locked
    limit greatest(1, least(p_limit, 25))
  ), claimed as (
    update public.visibility_snapshots vs
    set status = 'processing', claimed_at = now(), attempts = vs.attempts + 1
    from candidates c where vs.id = c.id
    returning vs.id, vs.workspace_id, vs.brand_id, vs.share_of_voice, vs.opportunity_gaps,
      vs.explanation_breakdown, vs.period_start, vs.period_end
  )
  select
    c.id, c.workspace_id, c.brand_id, b.name,
    (c.share_of_voice->'competitors'->0->>'name'),
    ((c.share_of_voice->'brand'->>'mention_count')::integer),
    ((c.share_of_voice->'competitors'->0->>'mention_count')::integer),
    (c.explanation_breakdown->>'citation_ratio')::numeric,
    (select coalesce(jsonb_agg(jsonb_build_object('domain_type', x.domain_type, 'pct', x.pct)), '[]'::jsonb)
       from (
         select (elem->>'type') as domain_type,
           round(100.0 * count(*) / greatest(1, sum(count(*)) over ()), 1) as pct
         from public.check_extractions ce, jsonb_array_elements(ce.cited_domain_types) elem
         where ce.brand_id = c.brand_id and ce.status = 'completed'
           and ce.extracted_at::date between c.period_start and c.period_end
         group by (elem->>'type')
       ) x),
    (select coalesce(jsonb_agg(jsonb_build_object('domain_type', x.domain_type, 'pct', x.pct)), '[]'::jsonb)
       from (
         select (elem->>'type') as domain_type,
           round(100.0 * count(*) / greatest(1, sum(count(*)) over ()), 1) as pct
         from public.check_extractions ce, jsonb_array_elements(ce.cited_domain_types) elem
         where ce.brand_id = c.brand_id and ce.status = 'completed'
           and ce.extracted_at::date between c.period_start and c.period_end
           and (c.share_of_voice->'competitors'->0->>'name') = any(ce.competitor_names_found)
         group by (elem->>'type')
       ) x),
    c.opportunity_gaps
  from claimed c
  join public.brands b on b.id = c.brand_id;
end; $$;

create or replace function public.complete_visibility_explanation(
  p_snapshot_id uuid, p_provider text, p_model text, p_explanation_text text, p_recommended_actions jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.visibility_snapshots set
    status = 'completed', explanation_provider = p_provider, explanation_model = p_model,
    explanation_breakdown = explanation_breakdown || jsonb_build_object('explanation_text', p_explanation_text),
    recommended_actions = p_recommended_actions,
    explanation_completed_at = now(), claimed_at = null, last_error_code = null
  where id = p_snapshot_id and status = 'processing';
  if not found then raise exception 'VISIBILITY_EXPLANATION_NOT_PROCESSING' using errcode = 'P0001'; end if;
end; $$;

-- Mirrors retry_or_fail_extraction's shape (migration 0013): same 5-attempt cap.
create or replace function public.retry_or_fail_visibility_explanation(p_snapshot_id uuid, p_error_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.visibility_snapshots; v_retry boolean;
begin
  select * into v from public.visibility_snapshots where id = p_snapshot_id and status = 'processing' for update;
  if not found then return; end if;
  v_retry := v.attempts < 5;
  update public.visibility_snapshots
  set status = case when v_retry then 'retry' else 'failed' end, claimed_at = null, last_error_code = p_error_code
  where id = p_snapshot_id;
end; $$;

-- Mirrors reclaim_stale_extractions (migration 0013).
create or replace function public.reclaim_stale_visibility_explanations(p_stale_after_minutes integer default 5)
returns integer language plpgsql security definer set search_path = public as $$
declare v_reclaimed integer;
begin
  with stale as (
    select id from public.visibility_snapshots
    where status = 'processing' and claimed_at < now() - make_interval(mins => greatest(1, p_stale_after_minutes))
  )
  update public.visibility_snapshots vs set status = 'retry', claimed_at = null
  from stale s where vs.id = s.id;
  get diagnostics v_reclaimed = row_count;
  return v_reclaimed;
end; $$;

revoke all on function public.run_visibility_scoring_cycle(),
  public.claim_visibility_explanation_jobs(integer),
  public.complete_visibility_explanation(uuid,text,text,text,jsonb),
  public.retry_or_fail_visibility_explanation(uuid,text),
  public.reclaim_stale_visibility_explanations(integer)
  from public, anon, authenticated;
grant execute on function public.run_visibility_scoring_cycle(),
  public.claim_visibility_explanation_jobs(integer),
  public.complete_visibility_explanation(uuid,text,text,text,jsonb),
  public.retry_or_fail_visibility_explanation(uuid,text),
  public.reclaim_stale_visibility_explanations(integer)
  to service_role;