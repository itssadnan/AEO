-- Module 5.1 — Auth & Account
-- Creates: user_profiles, workspaces, workspace_members, rate_limit_events
-- Plus: normalize_email(), handle_new_user() trigger, create_workspace() RPC.
-- See progress/modules/5.1-auth-and-account.md for acceptance criteria and
-- docs/architecture/entity-relationship-diagram.md for the schema this implements.

-- ============================================================================
-- normalize_email: dedupes email aliases (Gmail dot/plus tricks) so the
-- "one Free workspace per person" rule can't be trivially bypassed.
-- Mirrored in TypeScript at app/src/modules/auth/email.ts — keep both in sync;
-- this SQL copy is the actual source of truth since it's what the unique
-- index and create_workspace() below enforce against.
-- ============================================================================
create or replace function public.normalize_email(p_email text)
returns text
language plpgsql
immutable
as $$
declare
  local_part text;
  domain_part text;
  at_pos int;
  plus_pos int;
begin
  p_email := lower(trim(p_email));
  at_pos := position('@' in p_email);
  if at_pos = 0 then
    return p_email;
  end if;

  local_part := substring(p_email from 1 for at_pos - 1);
  domain_part := substring(p_email from at_pos + 1);

  plus_pos := position('+' in local_part);
  if plus_pos > 0 then
    local_part := substring(local_part from 1 for plus_pos - 1);
  end if;

  if domain_part in ('gmail.com', 'googlemail.com') then
    local_part := replace(local_part, '.', '');
    domain_part := 'gmail.com';
  end if;

  return local_part || '@' || domain_part;
end;
$$;

-- ============================================================================
-- user_profiles: one row per auth.users row, adds normalized_email.
-- ============================================================================
create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  raw_email text not null,
  normalized_email text not null,
  created_at timestamptz not null default now()
);

-- Enforces "at most one identity per real inbox": a+free@gmail.com and
-- a@gmail.com normalize to the same value and must not both get a profile.
create unique index user_profiles_normalized_email_key on public.user_profiles (normalized_email);

alter table public.user_profiles enable row level security;

create policy "user_profiles_select_own"
  on public.user_profiles for select
  using (id = auth.uid());

-- No insert/update/delete policy for the authenticated/anon roles: rows are
-- written exclusively by the handle_new_user trigger (SECURITY DEFINER)
-- below, never directly by client code.

-- ============================================================================
-- handle_new_user: populates user_profiles the moment Supabase Auth creates a
-- user, so normalized_email exists before create_workspace() ever runs.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, raw_email, normalized_email)
  values (new.id, new.email, public.normalize_email(new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- workspaces
-- ============================================================================
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan_tier text not null default 'free' check (plan_tier in ('free', 'starter', 'growth', 'agency')),
  razorpay_customer_id text,
  -- Lifetime counter for the Free plan's 3-experiment cap (never resets — see
  -- ERD "Why experiments_used is a plain counter" design note). Cap
  -- enforcement itself lives in 5.3/5.5/5.6/5.9, not here.
  experiments_used int not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- workspace_members
-- Created here, immediately after `workspaces` and before either table's RLS
-- policies are added, because `workspaces`' own policies below reference
-- `workspace_members` — the table must exist first or Postgres errors with
-- "relation public.workspace_members does not exist".
-- ============================================================================
create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

alter table public.workspaces enable row level security;

create policy "workspaces_select_member"
  on public.workspaces for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = auth.uid()
    )
  );

create policy "workspaces_update_owner"
  on public.workspaces for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );

-- No insert/delete policy for authenticated/anon roles: workspaces are only
-- ever created through create_workspace() below, which enforces the
-- one-Free-workspace-per-normalized-email rule atomically. There is no
-- delete flow yet (see ERD "no soft-delete columns yet" decision).

-- ============================================================================
-- workspace_members RLS (table itself created above, alongside `workspaces`)
-- ============================================================================
alter table public.workspace_members enable row level security;

-- A user can see every membership row of any workspace they themselves
-- belong to (so teammates are visible to each other, regardless of role).
create policy "workspace_members_select_same_workspace"
  on public.workspace_members for select
  using (
    exists (
      select 1 from public.workspace_members self
      where self.workspace_id = workspace_members.workspace_id
        and self.user_id = auth.uid()
    )
  );

-- Invite-permission hierarchy enforced at the RLS layer, not just in app code
-- (see progress/modules/5.1-auth-and-account.md decisions log): Owner can add
-- a member row of any role; Member can add a Viewer row only; Viewer can add
-- no one.
create policy "workspace_members_insert_by_role"
  on public.workspace_members for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
    or (
      workspace_members.role = 'viewer'
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = workspace_members.workspace_id
          and wm.user_id = auth.uid()
          and wm.role = 'member'
      )
    )
  );

-- Only an Owner can change a member's role or remove a member. (Preventing
-- removal of the *last* Owner is a check that needs a row count across the
-- whole table, which RLS's per-row `using` clause can't express cleanly —
-- enforce that specific invariant in application code, in whichever module
-- ships the "remove member" UI.)
create policy "workspace_members_update_owner_only"
  on public.workspace_members for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );

create policy "workspace_members_delete_owner_only"
  on public.workspace_members for delete
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );

-- ============================================================================
-- create_workspace: atomically creates a workspace + the caller's owner
-- membership, enforcing "at most one Free-plan workspace per normalized
-- email as Owner" inside a single transaction (Module 5.1 acceptance
-- criteria). SECURITY DEFINER so it can write both tables without requiring
-- a client-facing INSERT policy on `workspaces`.
--
-- NOTE for Module 5.9: this same free-plan-uniqueness check must also run
-- when an *existing* paid workspace is downgraded to free (the acceptance
-- criteria explicitly calls this out — "not just at signup"). This function
-- only covers workspace *creation*; 5.9's plan-change logic needs its own
-- call to an equivalent check before flipping plan_tier to 'free' on an
-- UPDATE. Don't assume this function alone covers the downgrade path.
-- ============================================================================
create or replace function public.create_workspace(p_name text, p_plan_tier text default 'free')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_normalized_email text;
  v_existing_free_workspace uuid;
  v_workspace_id uuid;
begin
  if v_user_id is null then
    raise exception 'create_workspace: no authenticated user';
  end if;

  if p_plan_tier = 'free' then
    select normalized_email into v_normalized_email
    from public.user_profiles
    where id = v_user_id;

    -- Lock every profile sharing this normalized email so two concurrent
    -- signups/requests for the same inbox can't both pass this check.
    perform 1 from public.user_profiles
    where normalized_email = v_normalized_email
    for update;

    select w.id into v_existing_free_workspace
    from public.workspaces w
    join public.workspace_members wm on wm.workspace_id = w.id
    join public.user_profiles up on up.id = wm.user_id
    where wm.role = 'owner'
      and w.plan_tier = 'free'
      and up.normalized_email = v_normalized_email
    limit 1;

    if v_existing_free_workspace is not null then
      raise exception 'FREE_WORKSPACE_EXISTS: this email already has a free workspace — upgrade it or log in';
    end if;
  end if;

  insert into public.workspaces (name, plan_tier)
  values (p_name, p_plan_tier)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_user_id, 'owner');

  return v_workspace_id;
end;
$$;

-- ============================================================================
-- rate_limit_events: shared Postgres-backed sliding-window rate limiter
-- (docs/CONVENTIONS.md Section 4 — no Redis at this scale). Used by this
-- module's signup endpoint; Module 5.11's free-check tool reuses the same
-- table/pattern rather than building its own.
-- ============================================================================
create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  rate_key text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_key_created_idx on public.rate_limit_events (rate_key, created_at);

-- RLS enabled with zero policies: holds no tenant data (same category as
-- free_check_cache/leads per the ERD), but enabling RLS with no policy means
-- anon/authenticated roles get zero access by default — only the service
-- role (used server-side in checkRateLimit()) can read/write this table.
alter table public.rate_limit_events enable row level security;
