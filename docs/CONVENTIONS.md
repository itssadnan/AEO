# Engineering Conventions — AEO Visibility Platform

This is the standing engineering standard for this repo. It applies to every module, for every contributor — human or LLM. Nothing here is optional; it is what "production quality" and "done" mean on this project. If a module's tracker entry (`progress/modules/*.md`) says something more specific than this file for its own domain (e.g. its own caching TTL), the module file wins — but it still must satisfy everything below.

## 1. Folder structure

```
AEO/
  docs/
    spec/                         Source-of-truth product spec (AEO_Visibility_Platform_Spec_v1.1.docx)
    CONVENTIONS.md                 This file
    architecture/                  System architecture + ER diagrams (next deliverable)
  progress/
    progress.json                  Machine-readable master tracker — read this first, every session
    README.md                      How to read/update the tracker
    modules/                       One file per module, mirrors spec Section 5 numbering
  app/
    src/
      app/                         Next.js App Router routes/pages only — no business logic here
      modules/                     One folder per business module, matching progress tracker IDs 1:1
        auth/
        brand-config/
        engine-query/
        nlp-extraction/
        scoring-explanation/
        crawl-audit/
        alerting/
        billing/
        admin/
        free-check/
        growth-automation/
      lib/
        ai-providers/               AIProvider interface + GeminiProvider, NvidiaNimProvider, (later) OpenAIProvider etc.
        cache/                      Cache helpers (Postgres-TTL based at MVP scale — see Section 4)
        db/                         Supabase client, typed query helpers
        security/                   Validation schemas, rate-limit middleware, webhook verification
      types/                        Shared TypeScript types / zod schemas, imported by both server and client code
    tests/
      unit/
      integration/
    supabase/
      migrations/                   Every schema change is a migration file, never a manual dashboard edit
    .env.example                    Every env var the app needs, with a placeholder value and a comment on where to get it
```

Rule: a module's business logic lives only inside its own `src/modules/<name>/` folder and is exported through a single `index.ts`. Nothing outside that folder imports from inside it directly — only through the barrel export. This is what makes "modify any existing flow" safe: the blast radius of a change is contained to one folder unless the public interface itself changes.

## 2. Code quality

- TypeScript `strict: true`. No `any` without an inline comment explaining why it's unavoidable.
- ESLint + Prettier enforced; a GitHub Action runs lint + typecheck + tests on every push. Keep this one workflow file — no heavyweight CI pipeline at this stage.
- All external input — API request bodies, Stripe webhook payloads, and AI-model JSON output — is validated with a `zod` schema before use. This is both a code-quality rule and a security rule (Section 5).
- Naming: kebab-case filenames, PascalCase components/types, camelCase functions/variables.
- Every module folder's public interface is documented by its `progress/modules/<id>-*.md` file, not by a second, duplicate README inside the code folder — one source of truth per module.

## 3. Commits & branches

- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`), scoped to a module where possible (`feat(engine-query): add retry backoff`).
- One module = one feature branch = one PR, sized so a single LLM session can review the whole diff at once.
- A PR cannot merge without updating that module's `progress/modules/*.md` and `progress/progress.json` entry in the same PR — the tracker update is part of the change, not a follow-up.

## 4. Caching strategy

The rule of thumb: **cache anything whose backing data changes less often than it's read, especially anything that costs AI-API quota.** At this scale (free-tier AI, low customer count), Postgres-based caching (a timestamp check or a small cache table with a TTL column) is sufficient — do not add Redis/Upstash until the Admin Console (5.10) shows it's actually needed (see the spec's Section 9 scalability triggers).

Concrete rules, by module:

| What                                                      | Where    | Rule                                                                                                                                                                                                         |
| --------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gemini/AI-provider grounded checks — paid plans           | 5.3, 6.0 | Never re-run the same (brand, prompt) pair faster than the plan's check interval — a `last_checked_at` guard, not a full cache layer                                                                         |
| Gemini/AI-provider grounded checks — Free plan            | 5.3, 5.9 | No time-based guard — Free plan has no recurring cadence. Gated instead by the lifetime `workspaces.experiments_used` counter (cap: 3, never resets); a 4th on-demand attempt is blocked outright            |
| Public free-check results                                 | 5.11     | Cache identical (brand, prompt) results for 24h, keyed by a hash of normalized input — this is the highest-priority cache in the system, since it's the one endpoint an anonymous visitor can hit repeatedly |
| Dashboard aggregates (score, share-of-voice, explanation) | 5.5, 5.6 | Computed once when a new check result lands, cached, invalidated by tag when new data arrives — never recomputed on every page view                                                                          |
| Crawl-readiness audit                                     | 5.7      | Cache per-domain result, 24h TTL                                                                                                                                                                             |
| NVIDIA NIM extraction                                     | 5.4      | Not cached — each raw answer is unique per check; kept cheap via free-tier RPM instead                                                                                                                       |
| Billing/plan state                                        | 5.9      | Never cached — must always read as current                                                                                                                                                                   |

Every module's Definition-of-Done includes an explicit caching line item (`progress/progress.json` → `definitionOfDone` → `caching`) — "not cached" is an acceptable answer, but it must be a stated decision, not an omission.

## 5. AI task/model configuration

Every place in the product that calls an AI model is registered as a named **task**, and which `(provider, model)` handles that task is resolved at runtime from the `ai_task_configs` table (see the entity-relationship diagram) — never hardcoded in a module, never in a code constant. No module ever calls `NvidiaProvider.call(...)` or references a model string directly; it calls a single resolver: `resolveTaskModel(taskKey, workspaceId)`.

**Two-row resolution, override pattern:**

- A **global default** row per task (`workspace_id IS NULL`) — what every customer gets unless overridden.
- An optional **per-workspace override** row per task (`workspace_id = <that workspace>`) — set only for custom-plan customers who need a specific model.
- `resolveTaskModel` checks for a workspace override first, falls back to the global default, and only uses a row where `enabled = true`.

Task keys today: `grounded_search`, `extraction`, `explanation_generation`, `prompt_suggestion`, `outreach_email_drafting`. Global defaults are seeded by a Supabase migration on first deploy (Gemini 2.5 Flash-Lite for grounded search, NVIDIA NIM Llama 3.1 8B-Instruct for extraction/explanation) — the seed values are the same defaults documented in the spec's Section 6, just living in a migration file instead of application code.

This is what makes every capability you asked for possible without extra machinery: **enable/disable a model for a flow globally** = flip `enabled` on the global-default row from the Admin Console (5.10). **A custom-plan customer on a different model** = the Admin Console inserts one override row scoped to their `workspace_id`. **Compare two models for a task** = point one customer's override at model A, another's at model B, read the results from `visibility_snapshots` — no separate experimentation framework needed for this level of comparison. (True randomized A/B splitting across anonymous traffic is a different, more complex thing — not built now, and not needed for what you described.)

**This table is admin-only — it is the one exception to the standard RLS pattern.** Every other table in this schema is scoped so a workspace's own members can read their own data. `ai_task_configs` is not: a customer, including on their own workspace's row, has no read or write access to it at all. Only server-side Admin Console routes (using the Supabase service role, which bypasses RLS) touch this table. This matters because the table indirectly reveals internal cost/routing decisions and, if a customer could edit their own override, they could silently degrade or upgrade their own service.

**Caching:** the resolved `(provider, model)` per task is looked up on every AI call, so it is cached in-app (a short in-memory TTL, e.g. 60s, is enough) rather than hitting Postgres on every request — and explicitly invalidated the moment an admin edits a row, so a config change takes effect immediately rather than waiting out the TTL.

Rule: if you find yourself typing a model name anywhere outside a migration seed file or the Admin Console's write path, stop — resolve it through `resolveTaskModel` instead.

### Multi-key failover pool (temporary, free-tier period only)

During the free-tier period, Gemini and NVIDIA NIM are each backed by up to three API keys (primary, secondary, tertiary) instead of one, to reduce how often a single account's rate limit blocks a check.

**This is a deliberate, informed business decision, not a default recommendation.** Pooling multiple free-tier accounts to multiply quota is a pattern both providers' abuse-monitoring watches for, and because all three keys are called from the same backend for the same product, detection is likely to affect all three together, not one at a time — see Module 5.3's decisions log (2026-07-23) for the full reasoning that was weighed before this was decided. It was decided to proceed anyway on the basis that: the secondary/tertiary accounts belong to real team members, not fabricated identities; those team members were explicitly told their own account carries the suspension risk, not just the company; and this is scoped to disappear the moment the product moves to a paid tier — never a permanent architecture.

Two things are required, not optional, given that decision:

1. Whoever owns the secondary/tertiary account has been told, explicitly, that this carries real risk to _their_ account.
2. The system fails **loudly**, not silently, when a key dies — see the design below.

**Design:** each provider (`GeminiProvider`, `NvidiaNimProvider`) wraps a small key pool instead of a single key. Env vars: `GEMINI_API_KEY_PRIMARY` / `_SECONDARY` / `_TERTIARY`, same pattern for `NVIDIA_NIM_API_KEY_*`. On a 429 (rate limited), the pool tries the next key for that request — a soft, per-request failover. On a 401/403 (unauthorized/forbidden — the signal an account may have been suspended), the key is marked dead in memory immediately, logged to the Admin Console's error log with an alert, and skipped on every subsequent call until an admin manually clears it — a dead key is never silently retried. If every key in a provider's pool is unavailable, the request falls back to Module 5.3's existing retry/requeue path rather than failing the check outright.

This pool is a separate mechanism from `ai_task_configs` above — that decides _which model_ handles a task; this decides _which credential_ is used to call whichever provider was already selected. They don't overlap.

**Two failover modes, tied to the existing paid-tier upgrade trigger (spec Section 6.4/9).** Before the primary key's account has billing enabled: `failoverMode: "shared"` — secondary/tertiary absorb load on ordinary 429s, as designed above. The moment primary is upgraded (billing enabled for Gemini; the free 200 RPM increase for NVIDIA NIM, which doesn't even require payment), flip to `failoverMode: "emergency-only"` — secondary/tertiary are no longer called for a plain 429, only for a hard failure on primary (401/403/5xx/timeout). A paid or upgraded primary shouldn't be hitting ordinary rate limits at early-customer volume, so there's no reason to keep routing normal load through a teammate's account once that's true. This alone drops secondary/tertiary usage close to zero without removing the resilience benefit.

**Target end state:** the secondary/tertiary accounts belonging to teammates are a bridge for the pre-revenue period, not a permanent fixture. Once there's paying revenue, replace them with a second key of your own (also paid) — true redundancy against an outage shouldn't depend on someone else's account once the cost of not depending on it is a few dollars a month. Retiring the teammate-owned keys at that point is the completion of this decision, not an optional cleanup.

## 6. Security mechanisms (baseline, every module)

These are non-negotiable, restated from the spec's Section 8 as enforceable rules rather than prose:

1. **Row Level Security** on every table, scoped to workspace membership, with a test proving cross-tenant access is denied — not just filtered in application code.
2. **Secrets** live only in the hosting platform's encrypted env store. Server-only keys are never prefixed `NEXT_PUBLIC_`; that prefix is reserved exclusively for values safe to ship to the browser.
3. **Webhook verification**: every Stripe webhook's signature is checked (constant-time compare) before the payload is trusted.
4. **Public endpoints** (the free-check tool, and only that, at MVP) are rate-limited by IP and protected by a CAPTCHA/honeypot.
5. **Untrusted content**: AI-generated answer text and any user-entered text are output-encoded before rendering, never interpolated into a prompt as an instruction, never rendered via `dangerouslySetInnerHTML`.
6. **Dependency hygiene**: Dependabot enabled from the first commit.
7. **Backups**: a scheduled `pg_dump` job exists before any real customer data is stored — Supabase's free tier ships with none.
8. **Never** scrape a competitor AI product's consumer web interface. Only the official APIs listed in the spec's Section 6.

A module cannot move to `done` in the tracker until its applicable Definition-of-Done security items are checked off.
