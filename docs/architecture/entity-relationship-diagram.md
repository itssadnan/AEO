# Entity-Relationship Diagram

Postgres schema (Supabase) for the MVP. Scoped to exactly what modules 5.1-5.12 need — nothing added speculatively for Phase-2 engines (6.0) beyond the `provider` column already being a free-text field, which is what makes it extensible without a migration.

## Diagram

```mermaid
erDiagram
  WORKSPACES ||--o{ WORKSPACE_MEMBERS : has
  WORKSPACES ||--o{ BRANDS : owns
  WORKSPACES ||--|| SUBSCRIPTIONS : has
  WORKSPACES ||--o{ USAGE_COUNTERS : tracks
  BRANDS ||--o{ COMPETITORS : tracks
  BRANDS ||--o{ PROMPTS : has
  BRANDS ||--o{ CRAWL_AUDITS : has
  BRANDS ||--o{ ALERT_LOGS : receives
  BRANDS ||--o{ VISIBILITY_SNAPSHOTS : generates
  BRANDS ||--o{ CHECK_EXTRACTIONS : produces
  PROMPTS ||--o{ CHECK_RUNS : produces
  LEADS |o--o| WORKSPACES : converts_to
  WORKSPACES |o--o{ AI_TASK_CONFIGS : overrides
  ENGINE_ERROR_LOGS }o--o| CHECK_JOBS : logs_error_for

  WORKSPACES {
    uuid id PK
    string name
    string plan_tier
    string razorpay_customer_id
    int experiments_used "lifetime counter, Free plan only; capped at 3 in application logic, never reset"
  }
  WORKSPACE_MEMBERS {
    uuid id PK
    uuid workspace_id FK
    uuid user_id FK "references auth.users, Supabase-managed"
    string role "owner, member, viewer"
  }
  BRANDS {
    uuid id PK
    uuid workspace_id FK
    string name
    string website
  }
  COMPETITORS {
    uuid id PK
    uuid brand_id FK
    string name
  }
  PROMPTS {
    uuid id PK
    uuid brand_id FK
    string text
    string frequency "weekly, daily"
  }
  CHECK_RUNS {
    uuid id PK
    uuid prompt_id FK
    string provider "gemini, nvidia_nim, openai, perplexity, copilot"
    string key_slot "primary, secondary, tertiary (null for historical rows)"
    bool brand_mentioned
    int position
    string sentiment
    jsonb citations
  }
  VISIBILITY_SNAPSHOTS {
    uuid id PK
    uuid brand_id FK
    int score
    jsonb share_of_voice
    jsonb recommended_actions
  }
  CRAWL_AUDITS {
    uuid id PK
    uuid brand_id FK
    string domain
    bool llms_txt_present
  }
  ALERT_LOGS {
    uuid id PK
    uuid brand_id FK
    string type "weekly_digest, threshold_alert"
    string dedupe_key "weekly_digest: period_start date; threshold_alert: competitor name"
    timestamp sent_at
  }
  SUBSCRIPTIONS {
    uuid id PK
    uuid workspace_id FK
    string razorpay_subscription_id
    string status
  }
  USAGE_COUNTERS {
    uuid id PK
    uuid workspace_id FK
    string period
    int checks_used
  }
  FREE_CHECK_CACHE {
    uuid id PK
    string input_hash
    jsonb result
  }
  LEADS {
    uuid id PK
    string domain
    string status
    uuid converted_workspace_id FK
  }
  AI_TASK_CONFIGS {
    uuid id PK
    string task_key "grounded_search, extraction, ..."
    uuid workspace_id FK "null = global default"
    string provider
    string model
    bool enabled
  }
  AI_PROVIDER_KEY_HEALTH {
    string provider PK
    string key_slot PK "primary, secondary, tertiary"
    bool is_dead
    timestamptz dead_at
    string last_error_code
  }
  AI_PROVIDER_SETTINGS {
    string provider PK "gemini, nvidia_nim"
    string failover_mode "shared, emergency-only"
    uuid updated_by FK "auth.users"
    timestamptz updated_at
  }
  ENGINE_ERROR_LOGS {
    bigint id PK
    string provider
    string key_slot "primary, secondary, tertiary"
    uuid job_id FK → check_jobs
    string error_code
    bool retryable
    timestamptz created_at
  }
```

## Full column reference

Columns omitted from the diagram above for readability (every table also has `created_at timestamptz default now()` unless noted):

| Table                    | Additional columns                                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaces`             | `created_at`                                                                                                                                                                                               |
| `workspace_members`      | `created_at`                                                                                                                                                                                               |
| `brands`                 | `industry text`, `created_at`                                                                                                                                                                              |
| `competitors`            | `website text`                                                                                                                                                                                             |
| `prompts`                | `active bool default true`, `created_at`                                                                                                                                                                   |
| `check_runs`             | `key_slot text`, `model text`, `raw_answer text`, `reasoning text`, `competitor_names_found jsonb`, `cited_domains jsonb`, `cited_domain_types jsonb`, `status text` (success/error/rate_limited), `checked_at timestamptz` |
| `visibility_snapshots`   | `workspace_id uuid FK → workspaces` (denormalized, single-equality RLS), `mention_count int`, `avg_rank numeric`, `share_of_voice jsonb`, `source_influence jsonb`, `explanation_breakdown jsonb`, `opportunity_gaps jsonb`, `recommended_actions jsonb`, `explanation_skip_reason text` ('free_plan' \| 'no_competitor_ahead'), `status text` (not_applicable/queued/processing/retry/completed/failed — tracks only the async explanation sub-step, not the row as a whole), `attempts int`, `claimed_at timestamptz`, `last_error_code text`, `explanation_provider text`, `explanation_model text`, `explanation_completed_at timestamptz`, `period_start date`, `period_end date`, `generated_at timestamptz`                                       |
| `crawl_audits`           | `robots_txt_result jsonb`, `schema_present bool`, `heading_structure jsonb`, `checked_at timestamptz`                                                                                                                                 |
| `alert_logs`             | `payload jsonb`, `recipient_count int`, unique on `(brand_id, type, dedupe_key)` — the idempotency/dedupe guard (Module 5.8)                                                                              |
| `subscriptions`          | `plan_tier text`, `current_period_end timestamptz`                                                                                                                                                         |
| `usage_counters`         | `prompts_used int`                                                                                                                                                                                         |
| `free_check_cache`       | `brand_name_input text`, `prompt_input text`, `created_at` (TTL enforced in application logic — see caching note below)                                                                                    |
| `leads`                  | `company_name text`, `contact_email text`, `free_check_result jsonb`, `email_sent_at timestamptz`                                                                                                          |
| `ai_task_configs`        | `updated_by uuid FK → auth.users`, `updated_at timestamptz`, `created_at`                                                                                                                                  |
| `ai_provider_key_health` | `updated_at timestamptz`                                                                                                                                                                                   |
| `ai_provider_settings`   | `updated_at timestamptz`                                                                                                                                                                                   |
| `engine_error_logs`      | `created_at timestamptz`                                                                                                                                                                                   |

## Design decisions (read before modifying this schema)

**Why `check_runs` isn't split into a raw-answer table and a separate extracted-fields table.** They are always 1:1 (module 5.4 always processes exactly one 5.3 result) and always read together on the Prompt Explorer view. Splitting them would force a join on every read for no isolation benefit — the extraction fields are simply nullable until 5.4 finishes processing a row.

**Why `check_runs` records `key_slot` (added in Module 5.10).** To surface per-key quota consumption (primary/secondary/tertiary) in the Admin Console (5.10), worker calls capture which key slot executed each request via an `onAttempt` callback in `withKeyFailover` and record `p_key_slot` in `complete_check_job` and `retry_or_fail_check_job`. Historical rows prior to migration 0019 are nullable and display as an "unknown" slot bucket.

**Why `ai_provider_key_health`, `ai_provider_settings`, and `engine_error_logs` have service-role-only access.** Built in Module 5.3 and surfaced in Module 5.10, these tables track API key health, global failover mode settings (`shared` vs `emergency-only`), and detailed execution error logs. They have RLS enabled with zero policies (deny-all to PostgREST) and are accessed exclusively via server-side code using the Supabase service-role client.

**Why `visibility_snapshots` holds both the score/share-of-voice data and the Explanation Engine output.** Same reasoning: one snapshot per brand per period, computed together, always displayed together on the Competitor Explorer view (module 5.6).

**Why `visibility_snapshots` has a separate `source_influence` column from `share_of_voice` and `explanation_breakdown` (added in Module 5.5).** `source_influence` (citation domains by type across the whole brand) is its own acceptance criterion, distinct from `share_of_voice` (brand vs. named-competitor mention counts) and `explanation_breakdown` (the competitor-comparison-specific breakdown used only by the paid Explanation Engine) — folding it into either would conflate two different axes of data, so it gets its own column. Score, `mention_count`, `avg_rank`, `share_of_voice`, and `source_influence` are computed synchronously by pure SQL (`run_visibility_scoring_cycle()`) at row-insert time and are never deferred to a queue, since they have zero external dependency; only the Explanation Engine's prose (`explanation_breakdown.explanation_text` and `recommended_actions`) genuinely needs the async `status`/`claimed_at`/`attempts`/`last_error_code` queue-and-retry machinery, because it's the one sub-step that calls an external, rate-limited API — so a row with `status = 'not_applicable'` is already complete and final, not "pending."

**Why `free_check_cache` and `leads` aren't linked to `brands`/`workspaces` by a required foreign key.** Both are populated by anonymous, pre-customer activity — there is no workspace yet when a visitor runs the free tool or when a lead is sourced by the growth pipeline. `leads.converted_workspace_id` is a nullable FK, set only if and when that lead becomes a paying customer, so the growth pipeline's effectiveness stays traceable without forcing every anonymous row into the tenant model.

**`ai_task_configs` is the one table with no customer-facing RLS at all.** Every other table's RLS grants access to the owning workspace's members; this one grants access to nobody except server-side Admin Console routes running under the Supabase service role. A `unique` index on `(task_key) WHERE workspace_id IS NULL` guarantees exactly one global default per task, and `unique (task_key, workspace_id) WHERE workspace_id IS NOT NULL` guarantees at most one override per task per workspace. See `docs/CONVENTIONS.md` Section 5 for the full resolution logic (workspace override → global default → `enabled` check) and why this lives in the DB instead of code.

**Row Level Security.** Every table below `brands` (competitors, prompts, crawl_audits, alert_logs, visibility_snapshots) is scoped by joining up to `brands.workspace_id`, matching `docs/CONVENTIONS.md` Section 5. `check_runs` is one join deeper (check_runs → prompts → brands → workspace), which is the one place worth denormalizing: add a `workspace_id` column directly onto `check_runs` (kept in sync via a trigger or set at insert time from the parent prompt), so its RLS policy is a single equality check instead of a two-level join on every one of the highest-volume table's reads. `free_check_cache` and `leads` have no RLS — they hold no tenant data.

**Caching.** `free_check_cache` implements the 24-hour public free-check cache from `docs/CONVENTIONS.md` Section 4 — enforced by checking `created_at > now() - interval '24 hours'` in application code before a cache hit is used, not by a database TTL feature (Supabase's free tier has none). A `unique index` on `input_hash` prevents duplicate concurrent writes for the same (brand, prompt) pair.

**Why `experiments_used` is a plain counter on `workspaces`, not a row in `usage_counters`.** `usage_counters` is inherently period-shaped (`period`, `checks_used`, `prompts_used`) — it exists to support billing-cycle resets for paid plans. The Free plan's 3-check allowance is a one-time lifetime cap with no period to reset against, so it lives as a single column on the workspace itself instead of forcing a periodic table to represent a non-periodic value. The cap (3) is enforced in application logic (5.3, 5.9), not a second DB column — it's a fixed product rule, not a per-workspace variable.

**What's deliberately not here.** No `notifications` table (5.8 sends email directly and logs to `alert_logs`, it doesn't need a queue at this scale). No per-engine tables for the Phase-2 providers (6.0) — `check_runs.provider` is already a free-text column, so adding OpenAI/Perplexity/Copilot is a data change, not a schema change. No soft-delete columns anywhere yet — add them when there's an actual customer-deletion flow to support, not before.
