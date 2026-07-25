# Progress Tracker — How To Use This

This package exists so that development can be picked up by any LLM session (or any human) with zero prior context, at any point, without re-deriving decisions that were already made. Three files matter:

- **`progress.json`** — the machine-readable source of truth. Status, dependencies, ownership, and checklists live here.
- **`modules/<id>-<name>.md`** — one per module, human-readable, holds the _why_ behind decisions (the append-only Decisions log), not just the current status.
- **`LEFT_FOR_FINAL_TOUCHES.md`** — cross-module list of deferred, non-blocking work (config that's a workaround for now, cleanup items, things to do before a real launch but not before the next module). Read it every session alongside `progress.json`; append to it whenever a module's work surfaces something worth deferring rather than fixing immediately.

They must always agree. If they ever drift, `progress.json` is the tiebreaker for status/dependencies, and the module `.md` file is the tiebreaker for historical reasoning — but drifting at all is a process failure, not a normal state. Update both, every time, in the same commit.

## Protocol for starting a session

1. Open `progress.json`. Read `_protocol` (repeated here, but that copy is the canonical one). Scan `modules[]` for anything `in_progress` or `blocked` — that's probably where you left off.
2. Pick the next module whose `dependsOn` are all `done`. Do not start a module out of order — the dependency graph exists because later modules assume earlier ones' interfaces are stable.
3. Open that module's detail file in `modules/`. Read Purpose, Acceptance Criteria, Caching, Security, and the Decisions log in full before writing any code.
4. Also read `docs/CONVENTIONS.md` if this is a new module you haven't touched before — it has the folder structure, caching, and security rules that apply everywhere, so they aren't repeated in full on every module file.

## Protocol for ending a session (even an unfinished one)

1. Update `status` and `percentComplete` in `progress.json` for the module you touched.
2. Tick any `acceptanceCriteria[].done` items that are genuinely satisfied — not aspirationally, only what's actually true right now.
3. Append (don't rewrite) an entry to that module's Decisions log in its `.md` file: date, what you decided or built, why, and anything the next session needs to know.
4. List every file you created or changed in `filesTouched`.
5. If you're stopping because you're blocked, set `status: "blocked"` and write exactly what's needed to unblock it in `blockers` — specific enough that a different LLM with no memory of this session could resolve it.
6. If you completed the module, verify every applicable item in `definitionOfDone` (in `progress.json`) before setting `status: "done"` — not before.

## Status values

`not_started` → `in_progress` → (`blocked` if stuck) → `in_review` → `done`

A module in `in_review` means the code is written and the author believes it's done, but the Definition-of-Done checklist hasn't been independently re-verified yet (by a human, or by a fresh LLM session reviewing against the checklist with no memory of writing the code). Don't skip straight from `in_progress` to `done` — the whole point of this system is that a second pass catches what the first pass missed.

## Why JSON + Markdown instead of an external tool

No external project-management tool (Jira, Linear, etc.) is used here on purpose. Anything outside the git repo is invisible to an LLM working directly in the codebase unless it's specifically wired up as a tool, and it's one more free-tier account to manage. Plain files versioned in git mean: the tracker's history _is_ git history (`git log progress/`), any LLM with repo access can read and write it with the same tools it already has, and there is nothing to keep paying for or re-authenticating into as this project changes hands between tools or sessions.
