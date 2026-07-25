-- Module 5.4 — schedule the extraction-worker Edge Function via pg_cron/pg_net,
-- per the same pattern as migration 0010 (engine-worker).
--
-- Deliberately does NOT insert the actual secret value here. This file is
-- migration history (tracked permanently in
-- supabase_migrations.schema_migrations), so anything written into it as a
-- literal SQL statement is retained in the database indefinitely, in
-- plaintext, in Postgres's own tracking table -- not somewhere a real
-- secret belongs even though that table isn't client-exposed. The Vault
-- secret itself (`extraction_worker_secret`) must be created out-of-band via a
-- one-off `select vault.create_secret(...)` call (not applied as a
-- migration) with the same value set as the EXTRACTION_WORKER_SECRET Edge
-- Function secret (Dashboard -> Edge Functions -> Secrets). The cron job
-- below only ever references it by name.

select cron.schedule(
  'extraction-worker-invoke',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://vloradmcvozmhvvxiyvd.supabase.co/functions/v1/extraction-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-extraction-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'extraction_worker_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);