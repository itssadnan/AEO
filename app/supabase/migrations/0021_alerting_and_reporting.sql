-- Module 5.8 — Alerting & Reporting.
--
-- Two responsibilities per spec Section 5.8: a weekly email digest (score
-- change, new/lost mentions, new crawl issues) and threshold alerts (a named
-- competitor newly cited where the brand wasn't -- Growth+ plans only).
--
-- Architecture: exactly like 5.5's scoring cycle, all of the *data*
-- computation is pure, synchronous SQL with zero external dependency --
-- there is nothing to queue or retry about reading already-computed rows.
-- The only genuinely external step is the actual email send (Resend API),
-- which lives entirely in the alerting-worker Edge Function. This mirrors
-- the ERD's own design note ("What's deliberately not here": no
-- notifications table -- 5.8 sends email directly and logs to alert_logs,
-- it doesn't need a queue at this scale).
--
-- alert_logs doubles as both the audit trail and the idempotency/dedupe
-- guard: a (brand_id, type, dedupe_key) unique index means a retried worker
-- invocation (or a second overlapping pg_cron tick) can never double-send.
-- dedupe_key's meaning depends on type:
--   - weekly_digest: the period's start date (one digest per brand per week)
--   - threshold_alert: the competitor's name (one alert per brand+competitor,
--     ever -- see get_new_threshold_alerts()'s comment for why this is a
--     deliberate "first time only" policy, not a cooldown window)

create table public.alert_logs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  type text not null check (type in ('weekly_digest', 'threshold_alert')),
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index alert_logs_brand_type_dedupe_key_key
  on public.alert_logs (brand_id, type, dedupe_key);
create index alert_logs_brand_id_created_at_idx
  on public.alert_logs (brand_id, created_at desc);

alter table public.alert_logs enable row level security;

create policy "alert_logs_select_member"
  on public.alert_logs for select
  using (private.is_workspace_member(private.brand_workspace_id(brand_id), auth.uid()));

-- No insert/update/delete policy for client roles -- alert_logs is written
-- only by the alerting-worker (service_role, via record_alert_sent below),
-- same immutable-append-only-log pattern as crawl_audits/visibility_snapshots.

-- ============================================================================
-- get_weekly_digest_candidates: one row per brand that has fresh data to
-- report and hasn't already gotten a digest for this exact period.
-- ============================================================================
create or replace function public.get_weekly_digest_candidates(
  p_period_start date,
  p_period_end date,
  p_prior_period_start date,
  p_prior_period_end date
)
returns table(
  brand_id uuid,
  workspace_id uuid,
  brand_name text,
  current_score integer,
  prior_score integer,
  score_change integer,
  new_mentions jsonb,
  lost_mentions jsonb,
  crawl_issues jsonb,
  recipient_emails text[]
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with current_snap as (
    select distinct on (vs.brand_id) vs.brand_id, vs.score
    from public.visibility_snapshots vs
    where vs.period_start >= p_period_start and vs.period_end <= p_period_end
    order by vs.brand_id, vs.generated_at desc
  ),
  prior_snap as (
    select distinct on (vs.brand_id) vs.brand_id, vs.score
    from public.visibility_snapshots vs
    where vs.period_start >= p_prior_period_start and vs.period_end <= p_prior_period_end
    order by vs.brand_id, vs.generated_at desc
  ),
  current_mentions as (
    select ce.brand_id, p.id as prompt_id, p.text as prompt_text
    from public.check_extractions ce
    join public.prompts p on p.id = ce.prompt_id
    where ce.status = 'completed' and ce.brand_mentioned
      and ce.extracted_at::date between p_period_start and p_period_end
  ),
  prior_mentions as (
    select ce.brand_id, p.id as prompt_id
    from public.check_extractions ce
    join public.prompts p on p.id = ce.prompt_id
    where ce.status = 'completed' and ce.brand_mentioned
      and ce.extracted_at::date between p_prior_period_start and p_prior_period_end
  ),
  new_mentions_agg as (
    select cm.brand_id,
      jsonb_agg(jsonb_build_object('prompt_id', cm.prompt_id, 'prompt_text', cm.prompt_text)) as new_mentions
    from current_mentions cm
    where not exists (
      select 1 from prior_mentions pm where pm.brand_id = cm.brand_id and pm.prompt_id = cm.prompt_id
    )
    group by cm.brand_id
  ),
  lost_mentions_agg as (
    select pm.brand_id,
      jsonb_agg(jsonb_build_object('prompt_id', pm.prompt_id, 'prompt_text', p.text)) as lost_mentions
    from prior_mentions pm
    join public.prompts p on p.id = pm.prompt_id
    where not exists (
      select 1 from current_mentions cm where cm.brand_id = pm.brand_id and cm.prompt_id = pm.prompt_id
    )
    group by pm.brand_id
  ),
  latest_audit as (
    select distinct on (ca.brand_id)
      ca.brand_id, ca.robots_txt_result, ca.schema_present, ca.heading_structure
    from public.crawl_audits ca
    where ca.checked_at::date <= p_period_end
    order by ca.brand_id, ca.checked_at desc
  ),
  prior_audit as (
    select distinct on (ca.brand_id)
      ca.brand_id, ca.robots_txt_result, ca.schema_present, ca.heading_structure
    from public.crawl_audits ca
    where ca.checked_at::date < p_period_start
    order by ca.brand_id, ca.checked_at desc
  ),
  -- "New crawl issue" = present in the latest audit and either wasn't present
  -- in the audit immediately before this period, or there is no prior audit
  -- at all (a brand's first-ever audit surfaces all of its findings as new,
  -- since the customer has never seen them before). Interpretive call --
  -- the spec just says "new crawl issues" without defining "new" precisely.
  crawl_issues_agg as (
    select la.brand_id,
      (
        (case when not la.schema_present and (pa.brand_id is null or pa.schema_present) then
          jsonb_build_array(jsonb_build_object('issue', 'missing_schema_markup'))
        else '[]'::jsonb end)
        ||
        (case when (la.heading_structure->>'h1_count')::int = 0
               and (pa.brand_id is null or coalesce((pa.heading_structure->>'h1_count')::int, 0) > 0) then
          jsonb_build_array(jsonb_build_object('issue', 'missing_h1'))
        else '[]'::jsonb end)
        ||
        coalesce((
          select jsonb_agg(jsonb_build_object('issue', 'bot_disallowed', 'bot', cur.bot_key))
          from jsonb_each(la.robots_txt_result->'bots') as cur(bot_key, bot_val)
          where (cur.bot_val->>'allowed')::boolean = false
            and (
              pa.brand_id is null
              or coalesce((pa.robots_txt_result->'bots'->cur.bot_key->>'allowed')::boolean, true) = true
            )
        ), '[]'::jsonb)
      ) as crawl_issues
    from latest_audit la
    left join prior_audit pa on pa.brand_id = la.brand_id
  ),
  recipients as (
    select b.id as brand_id, array_agg(distinct up.raw_email) as recipient_emails
    from public.brands b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    join public.user_profiles up on up.id = wm.user_id
    group by b.id
  )
  select
    b.id,
    b.workspace_id,
    b.name,
    cs.score,
    ps.score,
    -- score_change defaults to 0 (not "current minus zero") when there's no
    -- prior-period snapshot to compare against -- a brand's first-ever week
    -- has no meaningful "change" to report.
    coalesce(cs.score, 0) - coalesce(ps.score, cs.score, 0),
    coalesce(nm.new_mentions, '[]'::jsonb),
    coalesce(lm.lost_mentions, '[]'::jsonb),
    coalesce(ci.crawl_issues, '[]'::jsonb),
    coalesce(r.recipient_emails, '{}')
  from public.brands b
  join current_snap cs on cs.brand_id = b.id
  left join prior_snap ps on ps.brand_id = b.id
  left join new_mentions_agg nm on nm.brand_id = b.id
  left join lost_mentions_agg lm on lm.brand_id = b.id
  left join crawl_issues_agg ci on ci.brand_id = b.id
  left join recipients r on r.brand_id = b.id
  where not exists (
    select 1 from public.alert_logs al
    where al.brand_id = b.id and al.type = 'weekly_digest' and al.dedupe_key = p_period_start::text
  );
end; $$;

-- ============================================================================
-- get_new_threshold_alerts: Growth+ plans only, per spec. Deliberately a
-- "first time only" policy, not a cooldown -- once alert_logs has a row for
-- (brand, 'threshold_alert', competitor_name), that exact competitor is never
-- re-alerted for that brand again, even if the situation recurs later. This
-- matches "newly cited" read as a one-time discovery event rather than a
-- recurring nag, and keeps the dedupe logic identical in shape to the
-- weekly-digest guard above (a unique index is the single source of truth for
-- "already alerted," not a time-window comparison). Revisit if product
-- feedback wants a cooldown-based re-alert instead of a permanent one.
-- ============================================================================
create or replace function public.get_new_threshold_alerts(p_limit integer default 50)
returns table(
  brand_id uuid,
  workspace_id uuid,
  brand_name text,
  competitor_name text,
  prompt_id uuid,
  prompt_text text,
  checked_at timestamptz,
  recipient_emails text[]
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with candidates as (
    select distinct on (ce.brand_id, comp.competitor_name)
      ce.brand_id, b.workspace_id, b.name as brand_name, comp.competitor_name,
      ce.prompt_id, p.text as prompt_text, ce.extracted_at
    from public.check_extractions ce
    join public.prompts p on p.id = ce.prompt_id
    join public.brands b on b.id = ce.brand_id
    join public.workspaces w on w.id = b.workspace_id
    cross join lateral unnest(ce.competitor_names_found) as comp(competitor_name)
    where ce.status = 'completed'
      and ce.brand_mentioned = false
      and w.plan_tier in ('growth', 'agency')
      and not exists (
        select 1 from public.alert_logs al
        where al.brand_id = ce.brand_id and al.type = 'threshold_alert' and al.dedupe_key = comp.competitor_name
      )
    order by ce.brand_id, comp.competitor_name, ce.extracted_at asc
  )
  select
    c.brand_id, c.workspace_id, c.brand_name, c.competitor_name, c.prompt_id, c.prompt_text, c.extracted_at,
    coalesce((
      select array_agg(distinct up.raw_email)
      from public.workspace_members wm
      join public.user_profiles up on up.id = wm.user_id
      where wm.workspace_id = c.workspace_id
    ), '{}')
  from candidates c
  order by c.extracted_at asc
  limit greatest(1, least(p_limit, 200));
end; $$;

-- ============================================================================
-- record_alert_sent: the idempotency guard. Returns false (not an error) when
-- the (brand, type, dedupe_key) tuple was already logged -- the worker treats
-- that as "someone else already sent this," not a failure.
-- ============================================================================
create or replace function public.record_alert_sent(
  p_brand_id uuid, p_type text, p_dedupe_key text, p_payload jsonb, p_recipient_count integer
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_inserted uuid;
begin
  insert into public.alert_logs (brand_id, type, dedupe_key, payload, recipient_count, sent_at)
  values (p_brand_id, p_type, p_dedupe_key, p_payload, p_recipient_count, now())
  on conflict (brand_id, type, dedupe_key) do nothing
  returning id into v_inserted;
  return v_inserted is not null;
end; $$;

-- These functions read email addresses (user_profiles.raw_email) and
-- cross-brand data for the purpose of sending mail -- exactly the class of
-- table/function this project's convention (docs/CONVENTIONS.md Section 5,
-- ai_task_configs) reserves for server-side/service-role-only access, never
-- exposed to anon/authenticated via PostgREST.
revoke all on function public.get_weekly_digest_candidates(date, date, date, date),
  public.get_new_threshold_alerts(integer),
  public.record_alert_sent(uuid, text, text, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.get_weekly_digest_candidates(date, date, date, date),
  public.get_new_threshold_alerts(integer),
  public.record_alert_sent(uuid, text, text, jsonb, integer)
  to service_role;
