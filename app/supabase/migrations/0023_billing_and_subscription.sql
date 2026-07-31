-- Module 5.9 — Billing & Subscription.
--
-- Scope decisions (full reasoning in progress/modules/5.9-billing-and-subscription.md):
--   1. `usage_counters` (present in the ERD as planned schema) is deliberately
--      NOT created here. Nothing in this module's real acceptance criteria
--      needs a period-based counter: prompt-count limits are already a
--      per-brand trigger (migration 0005), and check-frequency (weekly
--      Starter / daily Growth+) is already enforced by
--      enqueue_due_paid_checks()'s timestamp-window logic (migration 0007).
--      Revisit only if a real metered-billing use case appears.
--   2. `subscriptions` is a one-row-per-workspace *current state* table (the
--      ERD's own WORKSPACES ||--|| SUBSCRIPTIONS : has notation), not an
--      append-only log -- Razorpay's own Subscription entity already is the
--      historical record (fetchable by ID), so duplicating that history
--      here would just be a second, driftable source of truth.
--   3. `razorpay_webhook_events` is new versus the ERD, added for the
--      idempotency guard Razorpay's own docs require (a webhook can be
--      delivered more than once; dedupe via the `x-razorpay-event-id`
--      header, https://razorpay.com/docs/webhooks/validate-test/#idempotency).

-- ============================================================================
-- subscriptions
-- ============================================================================
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  razorpay_subscription_id text unique,
  razorpay_plan_id text,
  plan_tier text not null check (plan_tier in ('starter', 'growth', 'agency')),
  status text not null default 'created' check (
    status in ('created', 'authenticated', 'active', 'pending', 'halted', 'paused', 'cancelled', 'completed', 'expired')
  ),
  current_period_end timestamptz,
  cancel_at_cycle_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_razorpay_subscription_id_idx on public.subscriptions (razorpay_subscription_id);

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_member"
  on public.subscriptions for select
  using (private.is_workspace_member(workspace_id, (select auth.uid())));

-- No client insert/update/delete policy -- every write goes through
-- create_pending_subscription()/update_subscription_from_webhook() below,
-- both SECURITY DEFINER with their own explicit authorization checks.

-- ============================================================================
-- razorpay_webhook_events -- idempotency guard + audit log, service-role only
-- (same access pattern as ai_provider_key_health/engine_error_logs: RLS
-- enabled with zero policies, since this table has no legitimate client
-- reader at all, only the webhook route's service-role client).
-- ============================================================================
create table public.razorpay_webhook_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

alter table public.razorpay_webhook_events enable row level security;

-- ============================================================================
-- Brand-count-per-workspace limit, mirroring enforce_prompt_plan_rules's
-- shape exactly (migration 0005). Numbers per spec Section 3.4's pricing
-- table: Free/Starter = 1 brand, Growth = "up to 3 brands", Agency =
-- "unlimited within fair-use, multi-client" (same "generous soft cap, not a
-- literal unlimited" interpretation already used for Agency's prompt limit).
-- ============================================================================
create or replace function private.enforce_brand_plan_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_tier text;
  v_limit int;
  v_count int;
begin
  select plan_tier into v_plan_tier from public.workspaces where id = new.workspace_id;

  v_limit := case v_plan_tier
    when 'growth' then 3
    when 'agency' then 50 -- "fair-use", not a hard marketed number; generous soft cap, same pattern as the Agency prompt limit
    else 1 -- free, starter
  end;

  select count(*) into v_count from public.brands where workspace_id = new.workspace_id;
  if v_count >= v_limit then
    raise exception 'brand_limit_exceeded: plan % allows up to % brand(s) per workspace', coalesce(v_plan_tier, 'free'), v_limit
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_brand_plan_rules
  before insert on public.brands
  for each row execute function private.enforce_brand_plan_rules();

-- ============================================================================
-- create_pending_subscription: called by the checkout Server Action right
-- after Razorpay's Create Subscription API returns a real subscription id,
-- before the customer has completed authorization. Explicit auth check
-- (mirrors enqueue_free_check's pattern, migration 0007) since this is
-- callable by `authenticated`, not just service_role -- the Server Action
-- runs under the signed-in user's own session, not the service role.
-- ============================================================================
create or replace function public.create_pending_subscription(
  p_workspace_id uuid, p_razorpay_subscription_id text, p_razorpay_plan_id text, p_plan_tier text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null or not private.has_workspace_role(p_workspace_id, auth.uid(), 'owner') then
    raise exception 'FORBIDDEN: only a workspace owner can manage billing' using errcode = '42501';
  end if;

  insert into public.subscriptions (workspace_id, razorpay_subscription_id, razorpay_plan_id, plan_tier, status)
  values (p_workspace_id, p_razorpay_subscription_id, p_razorpay_plan_id, p_plan_tier, 'created')
  on conflict (workspace_id) do update set
    razorpay_subscription_id = excluded.razorpay_subscription_id,
    razorpay_plan_id = excluded.razorpay_plan_id,
    plan_tier = excluded.plan_tier,
    status = 'created',
    updated_at = now()
  returning id into v_id;

  return v_id;
end; $$;

revoke all on function public.create_pending_subscription(uuid, text, text, text) from public, anon;
grant execute on function public.create_pending_subscription(uuid, text, text, text) to authenticated;

-- ============================================================================
-- update_subscription_from_webhook: the only writer of subscriptions.status
-- after creation, and the only thing that ever changes workspaces.plan_tier
-- for a paid plan. SECURITY DEFINER, service_role only (the webhook route
-- has already verified the HMAC signature before calling this -- there is
-- no auth.uid() here, since Razorpay's webhook call carries no Supabase
-- session).
--
-- Deliberately conservative about *when* it downgrades plan_tier: only a
-- definitive terminal status (cancelled/expired/completed) resets the
-- workspace to 'free'. 'halted'/'pending' (payment retry states -- see
-- https://razorpay.com/docs/payments/subscriptions/states/) leave plan_tier
-- untouched, since the subscription may still recover on a later retry and
-- silently yanking paid features on the first missed payment would be a
-- worse customer experience than the spec asks for.
--
-- Per this module's explicit acceptance criterion, never touches
-- workspaces.experiments_used -- that counter is Free-plan-only and
-- irrelevant the moment plan_tier leaves 'free' (see migration 0001 and
-- Module 5.1/5.3's decisions logs).
-- ============================================================================
create or replace function public.update_subscription_from_webhook(
  p_razorpay_subscription_id text,
  p_workspace_id uuid,
  p_razorpay_plan_id text,
  p_plan_tier text,
  p_status text,
  p_current_period_end timestamptz
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.subscriptions (
    workspace_id, razorpay_subscription_id, razorpay_plan_id, plan_tier, status, current_period_end
  ) values (
    p_workspace_id, p_razorpay_subscription_id, p_razorpay_plan_id, p_plan_tier, p_status, p_current_period_end
  )
  on conflict (workspace_id) do update set
    razorpay_subscription_id = excluded.razorpay_subscription_id,
    razorpay_plan_id = excluded.razorpay_plan_id,
    plan_tier = excluded.plan_tier,
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    updated_at = now();

  if p_status in ('active', 'authenticated') then
    update public.workspaces set plan_tier = p_plan_tier where id = p_workspace_id;
  elsif p_status in ('cancelled', 'expired', 'completed') then
    update public.workspaces set plan_tier = 'free' where id = p_workspace_id;
  end if;
  -- 'created', 'pending', 'halted', 'paused' intentionally leave workspaces.plan_tier untouched.
end; $$;

revoke all on function public.update_subscription_from_webhook(text, uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.update_subscription_from_webhook(text, uuid, text, text, text, timestamptz) to service_role;

-- record_webhook_event: idempotency check + audit insert in one call, used
-- by the webhook route before it does anything else with a payload.
-- Returns false when the event_id was already processed (a duplicate
-- delivery, per Razorpay's own documented at-least-once guarantee).
create or replace function public.record_webhook_event(p_event_id text, p_event_type text, p_payload jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_inserted text;
begin
  insert into public.razorpay_webhook_events (event_id, event_type, payload)
  values (p_event_id, p_event_type, p_payload)
  on conflict (event_id) do nothing
  returning event_id into v_inserted;
  return v_inserted is not null;
end; $$;

revoke all on function public.record_webhook_event(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_webhook_event(text, text, jsonb) to service_role;
