-- Module 5.3 follow-up: cover every new foreign key flagged by the
-- Supabase performance advisor after migration 0007 was applied.
create index ai_task_configs_workspace_id_idx on public.ai_task_configs(workspace_id);
create index ai_task_configs_updated_by_idx on public.ai_task_configs(updated_by);
create index ai_provider_settings_updated_by_idx on public.ai_provider_settings(updated_by);
create index check_jobs_workspace_id_idx on public.check_jobs(workspace_id);
create index check_jobs_brand_id_idx on public.check_jobs(brand_id);
create index check_runs_workspace_id_idx on public.check_runs(workspace_id);
create index engine_error_logs_job_id_idx on public.engine_error_logs(job_id);
