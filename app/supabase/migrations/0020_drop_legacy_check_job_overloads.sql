-- Migration 0019 added a p_key_slot parameter to complete_check_job and
-- retry_or_fail_check_job via `create or replace function`. Since that
-- changed each function's argument list (not just a trailing default on
-- the same signature), Postgres created a second overload instead of
-- replacing the original -- the exact same mistake migration 0011 already
-- found and fixed once for retry_or_fail_check_job's p_provider parameter
-- (see 0011's own comment), repeated here despite 0019's own comment
-- explicitly warning against it.
--
-- Found live in the database (not caught by reading 0019's SQL alone,
-- and not disclosed in the delegate's completion report) while
-- independently verifying Module 5.10's implementation, 2026-07-28.
-- Confirmed via: select proname, pg_get_function_identity_arguments(oid)
-- from pg_proc where proname in ('complete_check_job','retry_or_fail_check_job');
-- -- both functions had two overloads live, old (no key_slot) and new.
drop function if exists public.complete_check_job(uuid, text, text, text, jsonb, jsonb);
drop function if exists public.retry_or_fail_check_job(uuid, text, integer, text);
