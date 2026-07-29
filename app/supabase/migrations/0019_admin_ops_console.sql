-- Module 5.10: add key_slot so quota consumption can be broken down per
-- key (primary/secondary/tertiary), not just per provider. Nullable --
-- historical rows and any future failure where no key was ever attempted
-- (e.g. every key missing) legitimately have no slot to record.
alter table public.check_runs add column key_slot text
  check (key_slot is null or key_slot = any (array['primary','secondary','tertiary']));

-- Extend both RPCs with a new, default-null parameter -- create or replace
-- with an added optional param is signature-compatible and safe here, same
-- pattern already used by migration 0009 to add p_provider to
-- retry_or_fail_check_job. Do NOT create a second overload (migration 0011
-- exists specifically because an earlier round of this mistake left a
-- stale duplicate function live and callable -- see 0011's own comment).
create or replace function public.complete_check_job(
  p_job_id uuid, p_provider text, p_model text, p_raw_answer text,
  p_citations jsonb, p_grounding_metadata jsonb, p_key_slot text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare j public.check_jobs;
begin
  select * into j from public.check_jobs where id=p_job_id and status='processing' for update;
  if not found then raise exception 'JOB_NOT_PROCESSING' using errcode = 'P0001'; end if;
  insert into public.check_runs(workspace_id,brand_id,prompt_id,provider,model,raw_answer,citations,grounding_metadata,status,key_slot)
  values(j.workspace_id,j.brand_id,j.prompt_id,p_provider,p_model,p_raw_answer,p_citations,p_grounding_metadata,'success',p_key_slot);
  update public.check_jobs set status='completed',completed_at=now(),locked_at=null,last_error_code=null where id=p_job_id;
end; $$;

create or replace function public.retry_or_fail_check_job(
  p_job_id uuid, p_error_code text, p_retry_after_seconds integer default 60,
  p_provider text default 'gemini', p_key_slot text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare j public.check_jobs; v_retry boolean;
begin
  select * into j from public.check_jobs where id=p_job_id and status='processing' for update;
  if not found then return; end if; v_retry := j.attempts < 5;
  update public.check_jobs set status=case when v_retry then 'retry' else 'failed' end, available_at=case when v_retry then now()+make_interval(secs=>greatest(30,least(p_retry_after_seconds,3600))) else available_at end, locked_at=null, completed_at=case when v_retry then null else now() end,last_error_code=p_error_code where id=p_job_id;
  insert into public.check_runs(workspace_id,brand_id,prompt_id,provider,model,status,error_code,key_slot) values(j.workspace_id,j.brand_id,j.prompt_id,p_provider,'unknown',case when p_error_code='rate_limited' then 'rate_limited' else 'error' end,p_error_code,p_key_slot);
  insert into public.engine_error_logs(provider,job_id,error_code,retryable,key_slot) values(p_provider,p_job_id,p_error_code,v_retry,p_key_slot);
end; $$;

-- Re-grant exactly as migration 0009 did (create or replace does not change
-- existing grants, but the exact signature in the revoke/grant statements
-- must match this new signature or the statement is a no-op against the
-- wrong overload).
revoke all on function public.complete_check_job(uuid,text,text,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.complete_check_job(uuid,text,text,text,jsonb,jsonb,text) to service_role;
revoke all on function public.retry_or_fail_check_job(uuid,text,integer,text,text) from public, anon, authenticated;
grant execute on function public.retry_or_fail_check_job(uuid,text,integer,text,text) to service_role;