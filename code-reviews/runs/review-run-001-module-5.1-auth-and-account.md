# QA Code Review Report — Run #001

**Module ID:** 5.1 (Auth & Account)  
**Review Run Number:** 001  
**Date:** 2026-07-24  
**QA Lead:** Antigravity (AI QA Lead)  
**Verdict:** 🟡 NEEDS_REVISION  

---

## 1. Executive Summary

Module 5.1 implements core authentication, multi-tenant workspace isolation, role-based authorization, rate limiting, and email normalization. The implementation demonstrates strong adherence to architecture boundaries, Zod schema validation, and SQL security hardening (`0002_auth_security_hardening.sql`).

However, live execution of the cross-tenant RLS integration suite (`tests/integration/auth-rls.test.ts`) against Supabase uncovered a critical Postgres infinite-recursion bug (`42P17`) in the `workspace_members` RLS policies. This report provides the exact SQL migration code and instructions required for Claude to apply the fix and complete Module 5.1.

---

## 2. Pillar Evaluation Matrix

| Pillar | Status | Findings / Comments |
|---|---|---|
| 1. Architecture & Module Encapsulation | 🟢 PASS | Clean separation: `src/modules/auth/` barrel export (`index.ts`), business logic isolated from UI routes in `src/app/(auth)/`. |
| 2. TypeScript & Zod Validation | 🟢 PASS | Zod schemas in `src/modules/auth/schemas.ts` for inputs; generated Supabase DB types swapped into `src/types/database.ts`. Strict mode clean. |
| 3. Security, Multi-Tenancy & RLS | 🔴 FAIL | RLS policies on `workspace_members` in Migration `0001` contain direct self-referential subqueries resulting in Postgres infinite recursion (`42P17`). |
| 4. Caching & Quota Strategy | 🟢 PASS | Auth session caching managed via Supabase Client SDK; rate-limit events stored in Postgres. |
| 5. Operational Resilience & Error Recovery | 🟢 PASS | `0002_auth_security_hardening.sql` pinned `search_path` on `normalize_email` and restricted RPC execution permissions on `handle_new_user` and `create_workspace`. |
| 6. Automated Testing | 🟡 WARN | Pure logic unit tests (`auth-email.test.ts`, `auth-permissions.test.ts`) pass (12/12). Integration test `auth-rls.test.ts` ran live but failed 3/4 tests due to RLS recursion; 4th test assertion is too weak. |
| 7. Tracker & Docs Synchronization | 🟢 PASS | `progress/progress.json` and `progress/modules/5.1-auth-and-account.md` accurately capture root cause, migration details, and decisions log. |

---

## 3. Detailed Findings & Action Items

### 🔴 Critical Blockers (Must Fix to Pass)

1. **`app/supabase/migrations/0001_auth_and_workspaces.sql` (Lines 159–218) — RLS Infinite Recursion Bug**:
   - **Issue**: RLS policies on `workspace_members` (`_select_same_workspace`, `_insert_by_role`, `_update_owner_only`, `_delete_owner_only`) query `workspace_members` within their `USING`/`WITH CHECK` clauses. This causes infinite recursion (`42P17`) on any query involving `workspace_members` or `workspaces`.
   - **Fix**: Apply Migration `0003_fix_workspace_members_rls_recursion.sql` below. It introduces two `SECURITY DEFINER` helper functions (`is_workspace_member` and `is_workspace_role`) with `search_path = public` that read membership with RLS bypassed internally, breaking the recursion loop.

#### Proposed SQL for `app/supabase/migrations/0003_fix_workspace_members_rls_recursion.sql`:
```sql
-- Module 5.1 Auth & Account: Fix RLS Policy Infinite Recursion on workspace_members

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
```

2. **`app/tests/integration/auth-rls.test.ts` (Subtest 4 Assertion)**:
   - **Issue**: Subtest "denies user B inserting into user A workspace" asserts `assert.notStrictEqual(error, null)`. It false-passed because the infinite recursion error was returned instead of a genuine RLS permission-denied error.
   - **Fix**: Tighten assertion to check specifically for RLS permission denial (Postgres error code `42501` / forbidden message) and non-recursion.

3. **Live RLS Integration Test Verification**:
   - **Issue**: Live integration test suite must execute cleanly with 4/4 passing tests against Supabase.
   - **Fix**: Apply Migration `0003` to the live Supabase project via MCP, run `get_advisors` security check, and run `node --env-file=.env.local --test tests/integration/auth-rls.test.ts` to confirm 4/4 subtests pass.

### 🟡 Warnings & Technical Debt (Recommended Fixes)
1. **Manual E2E Auth Click-Through**: Perform manual browser verification of sign-up → sign-in → Google OAuth flow once RLS recursion is resolved.

### 🟢 Compliments & Solid Practices
- Proactive use of `SECURITY DEFINER` for `create_workspace()` to prevent race conditions during free-plan workspace creation.
- Generic IP rate-limiter design in `src/lib/security/rate-limit.ts` ready for reuse in Module 5.11.

---

## 4. Action Plan for Claude Developer

To resolve Run #001 findings and request Run #002:
1. Create `app/supabase/migrations/0003_fix_workspace_members_rls_recursion.sql` with the SQL snippet above.
2. Apply Migration `0003` to the live Supabase project and check `get_advisors`.
3. Update `tests/integration/auth-rls.test.ts` assertion logic for Subtest 4.
4. Execute `node --env-file=.env.local --test tests/integration/auth-rls.test.ts` and verify 4/4 passing subtests.
5. Update `progress/progress.json` and `progress/modules/5.1-auth-and-account.md` status to `done`.
