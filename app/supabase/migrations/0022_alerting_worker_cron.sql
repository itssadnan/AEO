-- Module 5.8 — schedule the alerting-worker Edge Function via pg_cron/pg_net,
-- same pattern as migrations 0010/0014/0017 (engine/extraction/scoring
-- workers). Cadence: weekly, Monday 09:00 UTC -- matches the spec's "weekly
-- email digest" cadence; threshold alerts piggyback on the same invocation
-- rather than getting their own schedule, since both are cheap, side-effect-
-- light reads plus (at most) a handful of Resend API calls.
--
-- Deliberately does NOT insert the actual secret value here -- same
-- reasoning as 0010/0014/0017's header comments: this file is permanent
-- migration history, not where a secret belongs. The Vault secret
-- (`alerting_worker_secret`) was created out-of-band via a one-off
-- execute_sql call, matching the ALERTING_WORKER_SECRET Edge Function
-- secret's value -- see progress/modules/5.8-alerting-and-reporting.md
-- Blockers for the outstanding step of actually setting that Edge Function
-- secret (no available tool can do this; same gap as ENGINE_WORKER_SECRET
-- originally was for Module 5.3).

select cron.schedule(
  'alerting-worker-invoke',
  '0 9 * * 1',
  $$
  select net.http_post(
    url := 'https://vloradmcvozmhvvxiyvd.supabase.co/functions/v1/alerting-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alerting-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'alerting_worker_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
