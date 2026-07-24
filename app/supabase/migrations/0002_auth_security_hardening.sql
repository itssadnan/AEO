-- Module 5.1 — security hardening follow-up
-- Fixes 3 warnings raised by Supabase's security advisor (get_advisors) right
-- after 0001_auth_and_workspaces.sql was applied to the live project:
--
-- 1. WARN function_search_path_mutable — normalize_email had no pinned
--    search_path. Low risk in practice (it touches no tables), but pin it
--    for consistency with the other two functions and to clear the warning.
-- 2. WARN anon/authenticated_security_definer_function_executable —
--    handle_new_user was callable directly via /rest/v1/rpc/handle_new_user
--    by anyone. It must only ever run via the on_auth_user_created trigger;
--    direct calls would let anyone insert arbitrary user_profiles rows.
--    Revoking PUBLIC execute doesn't break the trigger — trigger firing
--    runs under the function owner's privileges, not the invoking role's
--    grants.
-- 3. WARN anon_security_definer_function_executable — create_workspace was
--    callable by the anon (unauthenticated) role. It already no-ops safely
--    for anon (auth.uid() is null -> raises an exception), but revoking
--    anon's EXECUTE closes the exposed surface per the advisor's own
--    recommendation rather than relying on an in-body check alone.

create or replace function public.normalize_email(p_email text)
returns text
language plpgsql
immutable
set search_path = public
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

-- handle_new_user: trigger-only, never a public RPC.
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

-- create_workspace: authenticated users only, never anon.
revoke all on function public.create_workspace(text, text) from public;
revoke all on function public.create_workspace(text, text) from anon;
grant execute on function public.create_workspace(text, text) to authenticated;
