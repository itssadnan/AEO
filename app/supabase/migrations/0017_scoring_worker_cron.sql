-- Module 5.5 — schedule the scoring-worker Edge Function via pg_cron/pg_net,
-- per the same pattern as migration 0014 (extraction-worker). Only change:
-- function name scoring-worker, header name x-scoring-worker-secret, Vault
-- secret name scoring_worker_secret, cron job name scoring-worker-invoke.
-- Cadence: */30 * * * * (every 30 minutes), not every 5 minutes -- this
-- module's underlying data doesn't need minute-level freshness the way 5.4's
-- per-check extraction does, and most invocations will find nothing to do (see
-- "Architecture decisions" in progress/specs/5.5-*.md), so the cadence choice
-- is about not over-polling, not about resource cost. Same URL host pattern
-- (https://vloradmcvozmhvvxiyvd.supabase.co/functions/v1/scoring-worker).

select cron.schedule(
  'scoring-worker-invoke',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://vloradmcvozmhvvxiyvd.supabase.co/functions/v1/scoring-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-scoring-worker-secret', vault.decrypt('scoring_worker_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);