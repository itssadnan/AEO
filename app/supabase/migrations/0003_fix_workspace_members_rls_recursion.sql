-- Module 5.1 Auth & Account: Fix RLS Policy Infinite Recursion on workspace_members
--
-- Problem: Migration 0001 created RLS policies on `workspace_members` (and `workspaces`)
-- that executed subqueries directly selecting from `workspace_members`. When evaluating
-- RLS on `workspace_members`, Postgres re-evaluates the policy recursively, triggering
-- error 42P17: infinite recursion detected in policy for relation "workspace_members".
--
-- Fix: Define SECURITY DEFINER helper functions `is_workspace_member` and `is_workspace_role`
-- with fixed search_path = public. When invoked inside RLS policies, these functions read
-- `workspace_members` with RLS bypassed internally, breaking the recursion loop.

-- 1. Helper function: check if user is any member of workspace
create or replace function public.is_workspace_member(p_workspace_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = p_user_id
  );
$$;

-- 2. Helper function: check if user has specific role in workspace
create or replace function public.is_workspace_role(p_workspace_id uuid, p_user_id uuid, p_role text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = p_user_id
      and role = p_role
  );
$$;

-- Grant EXECUTE to authenticated and anon roles
grant execute on function public.is_workspace_member(uuid, uuid) to authenticated, anon;
grant execute on function public.is_workspace_role(uuid, uuid, text) to authenticated, anon;

-- 3. Drop existing recursive policies on workspaces
drop policy if exists "workspaces_select_member" on public.workspaces;
drop policy if exists "workspaces_update_owner" on public.workspaces;

-- Re-create non-recursive policies on workspaces
create policy "workspaces_select_member"
  on public.workspaces for select
  using (
    public.is_workspace_member(id, auth.uid())
  );

create policy "workspaces_update_owner"
  on public.workspaces for update
  using (
    public.is_workspace_role(id, auth.uid(), 'owner')
  );

-- 4. Drop existing recursive policies on workspace_members
drop policy if exists "workspace_members_select_same_workspace" on public.workspace_members;
drop policy if exists "workspace_members_insert_by_role" on public.workspace_members;
drop policy if exists "workspace_members_update_owner_only" on public.workspace_members;
drop policy if exists "workspace_members_delete_owner_only" on public.workspace_members;

-- Re-create non-recursive policies on workspace_members
create policy "workspace_members_select_same_workspace"
  on public.workspace_members for select
  using (
    public.is_workspace_member(workspace_id, auth.uid())
  );

create policy "workspace_members_insert_by_role"
  on public.workspace_members for insert
  with check (
    public.is_workspace_role(workspace_id, auth.uid(), 'owner')
    or (
      role = 'viewer'
      and public.is_workspace_role(workspace_id, auth.uid(), 'member')
    )
  );

create policy "workspace_members_update_owner_only"
  on public.workspace_members for update
  using (
    public.is_workspace_role(workspace_id, auth.uid(), 'owner')
  );

create policy "workspace_members_delete_owner_only"
  on public.workspace_members for delete
  using (
    public.is_workspace_role(workspace_id, auth.uid(), 'owner')
  );
