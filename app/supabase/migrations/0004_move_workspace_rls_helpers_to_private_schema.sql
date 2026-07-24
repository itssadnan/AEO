-- get_advisors flagged is_workspace_member and has_workspace_role (added in
-- 0003_fix_workspace_members_rls_recursion.sql) as WARN
-- authenticated_security_definer_function_executable — both are directly
-- callable via /rest/v1/rpc/... by any signed-in user, which would let
-- anyone probe arbitrary (workspace_id, user_id) pairs for membership/role
-- existence — a minor info-disclosure oracle, and neither function is meant
-- to be called by clients at all; they only exist to be referenced inside
-- RLS policies.
--
-- Fix: move both into a `private` schema that PostgREST does not expose
-- (only `public` is in its exposed-schema list by default). RLS policy
-- evaluation happens inside Postgres itself, not through the PostgREST HTTP
-- layer, so a fully-qualified reference to private.* from a policy's
-- USING/WITH CHECK clause still works exactly as before — this only removes
-- the direct-HTTP-callable surface, nothing else changes.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_workspace_member(
  p_workspace_id uuid,
  p_user_id uuid
) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = p_user_id
  );
$$;

create or replace function private.has_workspace_role(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role text
) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = p_user_id
      and role = p_role
  );
$$;

revoke all on function private.is_workspace_member(uuid, uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid, uuid) to authenticated;

revoke all on function private.has_workspace_role(uuid, uuid, text) from public, anon;
grant execute on function private.has_workspace_role(uuid, uuid, text) to authenticated;

-- Repoint every policy at the private.* versions.
drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member"
  on public.workspaces for select
  using (private.is_workspace_member(id, auth.uid()));

drop policy if exists "workspaces_update_owner" on public.workspaces;
create policy "workspaces_update_owner"
  on public.workspaces for update
  using (private.has_workspace_role(id, auth.uid(), 'owner'));

drop policy if exists "workspace_members_select_same_workspace" on public.workspace_members;
create policy "workspace_members_select_same_workspace"
  on public.workspace_members for select
  using (private.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workspace_members_insert_by_role" on public.workspace_members;
create policy "workspace_members_insert_by_role"
  on public.workspace_members for insert
  with check (
    private.has_workspace_role(workspace_id, auth.uid(), 'owner')
    or (
      role = 'viewer'
      and private.has_workspace_role(workspace_id, auth.uid(), 'member')
    )
  );

drop policy if exists "workspace_members_update_owner_only" on public.workspace_members;
create policy "workspace_members_update_owner_only"
  on public.workspace_members for update
  using (private.has_workspace_role(workspace_id, auth.uid(), 'owner'));

drop policy if exists "workspace_members_delete_owner_only" on public.workspace_members;
create policy "workspace_members_delete_owner_only"
  on public.workspace_members for delete
  using (private.has_workspace_role(workspace_id, auth.uid(), 'owner'));

-- The public.* versions from 0003 are no longer referenced by any policy;
-- drop them so there isn't a duplicate, unused, still-exposed copy left
-- behind.
drop function if exists public.is_workspace_member(uuid, uuid);
drop function if exists public.has_workspace_role(uuid, uuid, text);
