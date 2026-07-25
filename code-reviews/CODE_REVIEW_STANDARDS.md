# Production-Grade Code Review Standards & QA Evaluation Guidelines

**Role:** QA Lead  
**Project:** AEO Visibility Platform  
**Target:** Production-Grade Quality, Zero-Trust Security, Multi-Tenant Isolation & Maximum Operational Resilience

---

## 1. Executive Summary & Purpose

As QA Lead, every code submission in this repository must undergo rigorous review against production-grade criteria before being marked `done` or merged into production. These standards enforce technical excellence, security, type safety, modular isolation, and adherence to project conventions outlined in `docs/CONVENTIONS.md` and `CLAUDE.md`.

---

## 2. The 7 Core Quality Pillars (Review Checklist)

Every module review checks the codebase against these 7 mandatory pillars.

```
       +-------------------------------------------------------+
       |             7 CORE QUALITY PILLARS                    |
       +-------------------------------------------------------+
       | 1. Architecture & Module Encapsulation                |
       | 2. TypeScript & Zod Input Validation                  |
       | 3. Security, Multi-Tenancy & RLS Isolation            |
       | 4. Caching Strategy & Quota Efficiency               |
       | 5. Operational Resilience & Error Recovery            |
       | 6. Automated Testing & Verification                   |
       | 7. Tracker & Documentation Lockstep Synchronization   |
       +-------------------------------------------------------+
```

---

### Pillar 1: Architecture & Module Encapsulation

- [ ] **Strict Barrel Exports (`src/modules/<name>/index.ts`)**: Business logic is strictly contained inside its module folder (`src/modules/<name>/`). Code outside the module MUST ONLY import via the barrel export (`index.ts`). No deep internal file imports.
- [ ] **UI vs Logic Separation**: Next.js App Router routes (`src/app/`) contain UI components, layout, and route handling ONLY. Zero business logic in `app/`.
- [ ] **AIProvider Abstraction**: All AI interactions must implement the shared `AIProvider` interface (`src/lib/ai-providers/`). No raw provider calls scattered across business logic.
- [ ] **Dependency Hygiene**: Module dependencies follow the clean DAG defined in `progress/progress.json`. No circular or out-of-order module dependencies.

---

### Pillar 2: TypeScript & Strict Zod Input Validation

- [ ] **Strict TypeScript Compliance**: `tsconfig.json` has `strict: true`. Zero compilation warnings or errors.
- [ ] **No Unjustified `any`**: Zero `any` types allowed without an explicit inline comment explaining why it is strictly unavoidable. Prefer `unknown`, generics, or concrete interfaces.
- [ ] **Zod Schema Enforcement**: 100% of external inputs must be validated with Zod schemas before being processed or written to DB:
  - API request bodies and query params
  - Webhook payloads (e.g., Razorpay, Stripe, third-party hooks)
  - AI model outputs (JSON responses from Gemini or NVIDIA NIM)
- [ ] **Type Coercion & Safety**: No unsafe type assertions (`as MyType`) without prior Zod parsing/guard verification.

---

### Pillar 3: Security, Multi-Tenancy & RLS Isolation

- [ ] **Supabase Row Level Security (RLS)**:
  - RLS is explicitly enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`) on EVERY newly introduced Postgres table.
  - Policies scope access strictly to tenant membership (`workspace_id`).
  - High-volume tables like `check_runs` include denormalized `workspace_id` indexed for fast single-equality RLS policy evaluations.
- [ ] **Multi-Tenant Security Test**: At least one automated integration test MUST exist proving tenant A cannot read, update, or delete tenant B's data under any condition.
- [ ] **Secrets Management**:
  - Zero sensitive keys or tokens in client bundles.
  - Server-only environment variables are NEVER prefixed with `NEXT_PUBLIC_`.
  - Keys stored exclusively in platform encrypted env stores or `.env.local` (never committed to git).
- [ ] **Webhook Verification**: Webhooks (e.g., Razorpay) verify HMAC-SHA256 signatures using constant-time comparison before trusting payload data.
- [ ] **Public Surface Hardening**:
  - Public/unauthenticated endpoints (e.g., Module 5.11 Public Free Check) enforce IP-based rate limiting + abuse mitigation (CAPTCHA/Honeypot).
- [ ] **Untrusted Output Escaping & XSS Defense**:
  - User input and AI-generated outputs (answers, explanations) are HTML/output-encoded.
  - Zero usage of `dangerouslySetInnerHTML`.
- [ ] **Legal & Ethical Compliance**:
  - ZERO web scraping of competitor AI product consumer UIs (ChatGPT, Perplexity, Copilot, Gemini web apps). Strictly official APIs only.

---

### Pillar 4: Caching Strategy & Quota Efficiency

- [ ] **Postgres-TTL & Timestamp Guards**:
  - Grounded AI engine queries enforce `last_checked_at` timestamp guards to prevent redundant quota usage.
  - Anonymous free check (5.11) and Crawl-Readiness audit (5.7) enforce a 24-hour TTL cache keyed by normalized input hash.
- [ ] **Dashboard Aggregate Caching**:
  - Visibility scores, share-of-voice, and explanation breakdowns are cached upon computation and invalidated via tag on new check runs—never recomputed on page reloads.
- [ ] **Explicit Caching Decision**: Every module explicitly documents its caching strategy (or states why it is un-cached) in code and module tracker docs.

---

### Pillar 5: Operational Resilience & Error Recovery

- [ ] **Robust Fault Handling**:
  - API rate limits (HTTP 429), timeouts, model availability errors, and malformed AI outputs are caught and handled gracefully.
  - Retry logic implements exponential backoff with random jitter.
  - Failed worker checks are requeued with error status—never silently swallowed or dropped.
- [ ] **No Symptom Masking**: No empty fallback masks (e.g., returning dummy zeroed data on error) that conceal underlying operational failures.
- [ ] **Logging & Observability**: Errors logged with actionable context (module name, operation, error code) while strictly redacting PII, tenant content, or secrets.

---

### Pillar 6: Automated Testing & Verification

- [ ] **Unit Testing**: Core utility functions, Zod schemas, scoring algorithms, and data transformers have unit test coverage.
- [ ] **Integration Testing**: End-to-end success paths and critical failure paths (API downtime, rate limit retries, invalid input rejection) are covered by automated tests.
- [ ] **Clean Test Execution**: `npm run test` (or equivalent test runner) completes with 0 failures and 0 skipped critical suites.

---

### Pillar 7: Tracker & Documentation Lockstep Synchronization

- [ ] **Master Tracker (`progress/progress.json`)**:
  - `status` and `percentComplete` accurately reflect code state.
  - `filesTouched` accurately lists all created/modified files.
  - Applicable `definitionOfDone` items are checked off.
- [ ] **Module Detail Doc (`progress/modules/<id>-*.md`)**:
  - Acceptance criteria checkboxes updated accurately.
  - Decisions Log updated with append-only entries (date, decision rationale, implementation details).
  - Caching and security notes kept in sync.

---

## 3. QA Review Status & Verdict Classifications

When reviewing a module, the QA Lead assigns one of three verdicts:

| Verdict                 | Meaning                                                                                                                   | Required Action                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 🟢 **`PASSED`**         | Code meets all 7 Pillars with production-grade quality. Zero blocking issues.                                             | Module ready to move to `done` status.                                   |
| 🟡 **`NEEDS_REVISION`** | Minor architectural, testing, type, or documentation gaps identified.                                                     | Developer resolves highlighted issues and submits for Nth+1 review pass. |
| 🔴 **`REJECTED`**       | Critical security vulnerability (e.g. missing RLS, leaked key), legal violation (e.g. scraping), or broken core contract. | Implementation paused until fundamental refactoring is completed.        |

---

## 4. Standard Report Template for Nth Review Runs

When performing a code review run, the QA Lead generates a report in `code-reviews/runs/` following this structure:

```markdown
# QA Code Review Report — Run #<NNN>

**Module ID:** <Module-ID> (e.g., 5.1 Auth & Account)  
**Review Run Number:** <NNN>  
**Date:** <YYYY-MM-DD>  
**QA Lead:** Antigravity (AI QA Lead)  
**Verdict:** 🟢 PASSED | 🟡 NEEDS_REVISION | 🔴 REJECTED

---

## 1. Executive Summary

Brief summary of the submission scope, key additions, and overall code quality observed during this review pass.

---

## 2. Pillar Evaluation Matrix

| Pillar                                     | Status             | Findings / Comments |
| ------------------------------------------ | ------------------ | ------------------- |
| 1. Architecture & Module Encapsulation     | PASS / FAIL / WARN | ...                 |
| 2. TypeScript & Zod Validation             | PASS / FAIL / WARN | ...                 |
| 3. Security, Multi-Tenancy & RLS           | PASS / FAIL / WARN | ...                 |
| 4. Caching & Quota Strategy                | PASS / FAIL / WARN | ...                 |
| 5. Operational Resilience & Error Recovery | PASS / FAIL / WARN | ...                 |
| 6. Automated Testing                       | PASS / FAIL / WARN | ...                 |
| 7. Tracker & Docs Synchronization          | PASS / FAIL / WARN | ...                 |

---

## 3. Detailed Findings & Action Items

### 🔴 Critical Blockers (Must Fix to Pass)

1. **[File Path / Line Number]**: Issue description & exact fix requirement.

### 🟡 Warnings & Technical Debt (Recommended Fixes)

1. **[File Path / Line Number]**: Optimization or cleanup recommendation.

### 🟢 Compliments & Solid Practices

1. Well-implemented patterns or clean test suites observed.

---

## 4. Next Steps & Re-Review Instructions

Instructions for the developer (Claude) on what to address before requesting Run #<NNN+1>.
```
