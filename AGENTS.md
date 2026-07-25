# AEO Visibility Platform — Start Here

If you are an LLM (any model, any tool — Codex, Cursor, ChatGPT with repo access, etc.) opening this repository for the first time, read this file fully before doing anything else. It is the map; it is not the plan or the status — those live in the files this points to.

## What this project is

A subscription SaaS that tracks whether AI answer engines (starting with Google's Gemini-grounded search) mention and recommend a customer's brand versus their named competitors, explains _why_ a competitor is winning, and reports what to fix. Full product rationale, market research, and business plan: `docs/spec/AEO_Visibility_Platform_Spec_v1.1.docx`.

## Read in this order

1. **`docs/spec/AEO_Visibility_Platform_Spec_v1.1.docx`** — the full product spec: market research, all 12 modules, AI strategy, security, scalability, roadmap, go-to-market. This is _why_ the project exists and _what_ it must do. Read this once, fully, before touching code, if you haven't already.
2. **`docs/CONVENTIONS.md`** — the standing engineering rules: folder structure, code quality, caching strategy, security baseline. This is _how_ everything gets built. Non-negotiable, applies to every module.
3. **`progress/progress.json`** — the current state of the build: which modules are done, in progress, or blocked, and what depends on what. This is _where things stand right now_. Read this every session, not just once.
4. **`progress/modules/<id>-*.md`** — the detail file for whichever module you're about to work on: acceptance criteria, caching/security notes specific to that module, and the decisions log explaining choices already made.
5. **`docs/architecture/`** — system architecture and entity-relationship diagrams (added as the next step after this tracker; if this folder is empty, that step hasn't happened yet — don't start writing application code until it has).

## The one rule that matters most

**Update the tracker in the same session you change code.** This entire system exists so that any LLM — including a future instance of you with no memory of this conversation — can resume work correctly. That only works if `progress/progress.json` and the relevant `progress/modules/*.md` file are always an accurate reflection of reality. An out-of-date tracker is worse than no tracker, because it actively misleads the next session. See `progress/README.md` for the exact start-of-session and end-of-session protocol.

## Stack, in one line

TypeScript end-to-end — Next.js (frontend + API routes) on Vercel, Supabase (Postgres + Auth + RLS), a small Node worker for scheduled AI-provider calls, Razorpay for billing (switched from Stripe on 2026-07-23 — see `progress/modules/5.9-billing-and-subscription.md` decisions log), Google Gemini API + NVIDIA NIM (both free-tier) as the AI backends, with paid engines (OpenAI/Perplexity/Copilot) added later behind the same provider interface once revenue funds them. Full reasoning for every one of these choices is in the spec.

## What NOT to do

- Do not add a second language/runtime (e.g. a JVM backend) — see the spec and this project's chat history for why TypeScript-only was chosen deliberately for a two-person, free-tier-first build.
- Do not scrape a competitor AI product's consumer web interface (ChatGPT, Perplexity, Copilot, Gemini apps) under any circumstance — see `docs/CONVENTIONS.md` Section 5 and the spec's Section 6.3/12 for why this is a hard legal boundary, not a style preference.
- Do not mark a module `done` in the tracker without checking it against the shared Definition of Done in `progress/progress.json`.
- Do not build Phase-2 paid AI engines (Section 6.0) speculatively — only when a paying customer asks.
