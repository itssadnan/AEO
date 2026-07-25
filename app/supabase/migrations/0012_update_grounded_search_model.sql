-- Module 5.3 live-verification fix (2026-07-25): migration 0007 seeded
-- ai_task_configs.grounded_search with model 'gemini-2.5-flash-lite'. As of
-- this date that model 404s ("no longer available to new users") -- Google
-- deprecated the 2.5 family ahead of its stated shutdown date. Confirmed via
-- Google's own docs (ai.google.dev/gemini-api/docs/generate-content/latest-model,
-- which still documents the legacy generateContent REST endpoint this
-- worker uses) that 'gemini-3.5-flash-lite' is the current GA replacement:
-- same generateContent endpoint shape, cheapest model in the 3.5 family
-- (fits this project's free-tier-first cost profile), and live-smoke-tested
-- against the real endpoint via this project's own engine-worker (confirmed
-- past the model-404, reaching real 429 rate-limit responses from Google's
-- API instead -- proof the model id itself is valid).
--
-- Applied first as a live UPDATE via execute_sql during the smoke test
-- (not tracked in migration history at the time); this migration makes the
-- same change reproducible for a fresh deploy from migration history alone.
update public.ai_task_configs
set model = 'gemini-3.5-flash-lite', updated_at = now()
where task_key = 'grounded_search' and workspace_id is null and model = 'gemini-2.5-flash-lite';
