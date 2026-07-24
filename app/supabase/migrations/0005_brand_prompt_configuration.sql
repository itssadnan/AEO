-- Module 5.2: Brand / Prompt Configuration
--
-- brands, competitors, prompts tables. RLS follows the same pattern as
-- migrations 0003/0004: workspace membership checked via the
-- private.is_workspace_member()/private.has_workspace_role() SECURITY
-- DEFINER helpers (never a direct self-referencing join), so no table here
-- can hit the recursion bug 0003 fixed on workspace_members.
--
-- Design decisions worth recording (acceptance criteria left some of this
-- unspecified on purpose — see progress/modules/5.2-brand-prompt-configuration.md):
--   1. Prompt-count limits (spec Section 5.2: Starter 15-25, Growth 50-75,
--      Agency fair-use) are interpreted as PER-BRAND, not per-workspace —
--      each brand is "what a customer tracks", and a workspace can hold
--      multiple brands (the agency use case), so a workspace-wide cap would
--      punish agencies for having more clients rather than gating the thing
--      actually being limited (how many prompts get checked per brand).
--   2. Free-plan default count is fixed at 10 here (acceptance criteria says
--      "exact default count deferred to implementation, kept low relative
--      to Starter's floor" — 10 is meaningfully below Starter's 15-25 floor).
--   3. Enforcement is a BEFORE INSERT/UPDATE/DELETE trigger, not just an app
--      check or a single RPC's logic — mirrors create_workspace()'s
--      row-locked server-side enforcement in migration 0001. This means the
--      limit (and the free-plan immutability rule) holds no matter what
--      client code path tries to write to `prompts`, not just the one this
--      module's server actions use.

-- ============================================================================
-- brands
-- ============================================================================
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  website text check (website is null or char_length(website) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index brands_workspace_id_idx on public.brands(workspace_id);

alter table public.brands enable row level security;

create policy "brands_select_member"
  on public.brands for select
  using (private.is_workspace_member(workspace_id, auth.uid()));

-- Viewers are read-only (spec 5.1: "agencies invite client-side viewers to
-- their own brand only") — brand creation/editing is Owner/Member only.
create policy "brands_insert_owner_or_member"
  on public.brands for insert
  with check (
    private.has_workspace_role(workspace_id, auth.uid(), 'owner')
    or private.has_workspace_role(workspace_id, auth.uid(), 'member')
  );

create policy "brands_update_owner_or_member"
  on public.brands for update
  using (
    private.has_workspace_role(workspace_id, auth.uid(), 'owner')
    or private.has_workspace_role(workspace_id, auth.uid(), 'member')
  );

create policy "brands_delete_owner_or_member"
  on public.brands for delete
  using (
    private.has_workspace_role(workspace_id, auth.uid(), 'owner')
    or private.has_workspace_role(workspace_id, auth.uid(), 'member')
  );

-- ============================================================================
-- Shared helper: resolve a brand's workspace_id, for competitors/prompts RLS.
-- SECURITY DEFINER + fixed search_path, same pattern as
-- private.is_workspace_member — lets policies below avoid repeating the
-- brands subquery, and (like the 0003 fix) keeps RLS evaluation from ever
-- needing a table to query itself.
-- ============================================================================
create or replace function private.brand_workspace_id(p_brand_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select workspace_id from public.brands where id = p_brand_id;
$$;

revoke all on function private.brand_workspace_id(uuid) from public, anon;
grant execute on function private.brand_workspace_id(uuid) to authenticated;

-- ============================================================================
-- competitors
-- ============================================================================
create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null default now()
);

create index competitors_brand_id_idx on public.competitors(brand_id);

alter table public.competitors enable row level security;

create policy "competitors_select_member"
  on public.competitors for select
  using (private.is_workspace_member(private.brand_workspace_id(brand_id), auth.uid()));

create policy "competitors_insert_owner_or_member"
  on public.competitors for insert
  with check (
    private.has_workspace_role(private.brand_workspace_id(brand_id), auth.uid(), 'owner')
    or private.has_workspace_role(private.brand_workspace_id(brand_id), auth.uid(), 'member')
  );

create policy "competitors_update_owner_or_member"
  on public.competitors for update
  using (
    private.has_workspace_role(private.brand_workspace_id(brand_id), auth.uid(), 'owner')
    or private.has_workspace_role(private.brand_workspace_id(brand_id), auth.uid(), 'member')
  );

create policy "competitors_delete_owner_or_member"
  on public.competitors for delete
  using (
    private.has_workspace_role(private.brand_workspace_id(brand_id), auth.uid(), 'owner')
    or private.has_workspace_role(private.brand_workspace_id(brand_id), auth.uid(), 'member')
  );

-- ============================================================================
-- prompts
-- ============================================================================
create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  is_ai_suggested boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index prompts_brand_id_idx on public.prompts(brand_id);

alter table public.prompts enable row level security;

create policy "prompts_select_member"
  on public.prompts for select
  using (private.is_workspace_member(private.brand_workspace_id(brand_id), auth.uid()));

create policy "prompts_insert_owner_or_member"
  on public.prompts for insert
  with check (
    private.has_workspace_role(private.brand_workspace_id(brand_id), auth.uid(), 'owner')
    or private.has_workspace_role(private.brand_workspace_id(brand_id), auth.uid(), 'member')
  );

create policy "prompts_update_owner_or_member"
  on public.prompts for update
  using (
    private.has_workspace_role(private.brand_workspace_id(brand_id), auth.uid(), 'owner')
    or private.has_workspace_role(private.brand_workspace_id(brand_id), auth.uid(), 'member')
  );

create policy "prompts_delete_owner_or_member"
  on public.prompts for delete
  using (
    private.has_workspace_role(private.brand_workspace_id(brand_id), auth.uid(), 'owner')
    or private.has_workspace_role(private.brand_workspace_id(brand_id), auth.uid(), 'member')
  );

-- ----------------------------------------------------------------------------
-- Server-side enforcement: plan-tier prompt-count limits (per-brand, see
-- design decision #1 above) and Free-plan immutability ("auto-selected from
-- the AI suggestions and fixed — not editable"). A BEFORE trigger on
-- INSERT/UPDATE/DELETE so it holds regardless of which code path writes to
-- this table, not just the server action this module ships today.
-- ----------------------------------------------------------------------------
create or replace function private.enforce_prompt_plan_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_plan_tier text;
  v_limit int;
  v_count int;
  v_brand_id uuid;
begin
  v_brand_id := coalesce(new.brand_id, old.brand_id);
  v_workspace_id := private.brand_workspace_id(v_brand_id);
  select plan_tier into v_plan_tier from public.workspaces where id = v_workspace_id;

  if v_plan_tier = 'free' then
    -- Free plan: prompts are only ever written once, by the AI-suggestion
    -- flow, and never touched again by the customer. Any UPDATE/DELETE is
    -- rejected outright; INSERT is only allowed for AI-suggested rows and
    -- only up to the fixed default count (design decision #2 above).
    if tg_op = 'UPDATE' or tg_op = 'DELETE' then
      raise exception 'prompt_immutable_on_free_plan: the Free plan''s prompt list is fixed and not editable'
        using errcode = 'P0001';
    end if;

    if tg_op = 'INSERT' then
      if new.is_ai_suggested is not true then
        raise exception 'prompt_must_be_ai_suggested_on_free_plan: Free-plan prompts must come from the AI-suggestion flow'
          using errcode = 'P0001';
      end if;

      select count(*) into v_count from public.prompts where brand_id = v_brand_id;
      if v_count >= 10 then
        raise exception 'prompt_limit_exceeded: the Free plan allows up to 10 prompts per brand'
          using errcode = 'P0001';
      end if;
    end if;

    return coalesce(new, old);
  end if;

  -- Paid plans: full edit/add/remove, capped server-side per design
  -- decision #1/#2 (per-brand, not per-workspace).
  if tg_op = 'INSERT' then
    v_limit := case v_plan_tier
      when 'starter' then 25
      when 'growth' then 75
      when 'agency' then 200 -- "fair-use", not a hard marketed number; generous soft cap
      else 10
    end;

    select count(*) into v_count from public.prompts where brand_id = v_brand_id;
    if v_count >= v_limit then
      raise exception 'prompt_limit_exceeded: plan % allows up to % prompts per brand', v_plan_tier, v_limit
        using errcode = 'P0001';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger trg_enforce_prompt_plan_rules
  before insert or update or delete on public.prompts
  for each row execute function private.enforce_prompt_plan_rules();
