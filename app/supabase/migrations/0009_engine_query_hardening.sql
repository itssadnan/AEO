-- Module 5.3 follow-up (code review, 2026-07-24): two real gaps found in
-- migration 0007 that weren't caught until an independent audit of the
-- Codex/NVIDIA-authored implementation.

-- 1. retry_or_fail_check_job() hardcoded provider='gemini' in its
--    check_runs insert regardless of which provider actually failed. Give
--    it a p_provider parameter so the worker (which already knows
--    task.provider at the point it calls this) can pass the real value.
--    create or replace is safe here -- same signature-compatible function,
--    no data migration needed, matches this project's established pattern
--    of fixing an already-applied function via a new migration rather than
--    editing history (see 0003 fixing 0001's RLS recursion bug).
create or replace function public.retry_or_fail_check_job(
  p_job_id uuid,
  p_error_code text,
  p_retry_after_seconds integer default 60,
  p_provider text default 'gemini'
)
returns void language plpgsql security definer set search_path = public as $$
declare j public.check_jobs; v_retry boolean;
begin
  select * into j from public.check_jobs where id=p_job_id and status='processing' for update;
  if not found then return; end if; v_retry := j.attempts < 5;
  update public.check_jobs set status=case when v_retry then 'retry' else 'failed' end, available_at=case when v_retry then now()+make_interval(secs=>greatest(30,least(p_retry_after_seconds,3600))) else available_at end, locked_at=null, completed_at=case when v_retry then null else now() end,last_error_code=p_error_code where id=p_job_id;
  insert into public.check_runs(workspace_id,brand_id,prompt_id,provider,model,status,error_code) values(j.workspace_id,j.brand_id,j.prompt_id,p_provider,'unknown',case when p_error_code='rate_limited' then 'rate_limited' else 'error' end,p_error_code);
  insert into public.engine_error_logs(provider,job_id,error_code,retryable) values(p_provider,p_job_id,p_error_code,v_retry);
end; $$;
revoke all on function public.retry_or_fail_check_job(uuid,text,integer,text) from public, anon, authenticated;
grant execute on function public.retry_or_fail_check_job(uuid,text,integer,text) to service_role;

-- 2. Nothing recovered a job left stuck in 'processing' if the Edge
--    Function crashed or hit its execution timeout mid-batch --
--    claim_check_jobs() flips all claimed jobs to 'processing' up front,
--    so any job the worker never reached in that invocation would sit
--    there forever. Directly contradicts this module's own acceptance
--    criterion ("failed checks are requeued, never silently dropped").
--    Called at the start of every worker invocation, before claiming new
--    work, so a crashed prior invocation's jobs get reclaimed before the
--    next batch starts.
create or replace function public.reclaim_stale_check_jobs(p_stale_after_minutes integer default 5)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  with stale as (
    select id from public.check_jobs
    where status = 'processing' and locked_at < now() - make_interval(mins => greatest(1, p_stale_after_minutes))
    for update skip locked
  ),
  reclaimed as (
    update public.check_jobs j set
      status = case when j.attempts < 5 then 'retry' else 'failed' end,
      available_at = case when j.attempts < 5 then now() else j.available_at end,
      locked_at = null,
      completed_at = case when j.attempts < 5 then null else now() end,
      last_error_code = 'worker_timeout_or_crash'
    from stale where j.id = stale.id
    returning j.id
  )
  insert into public.engine_error_logs(provider, job_id, error_code, retryable)
  select 'unknown', id, 'worker_timeout_or_crash', true from reclaimed;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;
revoke all on function public.reclaim_stale_check_jobs(integer) from public, anon, authenticated;
grant execute on function public.reclaim_stale_check_jobs(integer) to service_role;
