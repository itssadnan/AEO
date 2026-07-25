---
name: delegate-and-verify
description: Use whenever the user wants to hand off implementation of a module, feature, or task to a cheaper or external LLM (for example a free NVIDIA NIM model such as Kimi K2.6, DeepSeek V4 Pro, or GLM-5.2) while Claude handles spec-writing and final verification. Trigger this any time the user mentions delegating coding work to another model, asks which NVIDIA NIM or other free/cheap model to use for implementation, wants a spec written for another AI to execute, mentions routing work through Cline or a similar tool with NIM models, asks whether to add an extra AI review/QA layer before merging delegated work, or asks how to cut Claude's own token usage on a project without losing correctness. Also trigger if the user is setting up any multi-model pipeline where one model implements and another checks the work.
---

# Delegate and verify

A workflow for getting implementation work done by a cheaper or free external model while keeping Claude's guarantees on correctness. Claude writes the spec and does the final check; the external model does the typing. The entire value of this pattern lives in the verification step — skip that, and delegation just moves the bugs one hop further from where anyone is looking.

## Why the shape of this matters

Delegation without independent verification looks like it's working right up until it doesn't. A delegate model can report "done," write a checklist full of checkmarks, and even generate passing-looking test output that isn't real. Adding a second AI as a reviewer does not fix this — a reviewer's "looks good" is still a self-report, just from a different model, and it is just as capable of being wrong or fabricated as the implementer's own claim. The only thing that actually catches a false "done" is checking it against something that can't lie: a compiler, a real test run, a live API call, an actual git diff.

This means the workflow below has exactly one mandatory checkpoint — Claude verifying against ground truth — and treats every other layer (an extra AI review pass, an extra revision round) as optional overhead to add only when it's earning its keep.

## The workflow

**1. Read the project's own conventions and tracker before writing anything.**
Find and read whatever plays the role of a standing rulebook (a `CLAUDE.md`/`AGENTS.md`, a `docs/CONVENTIONS.md`, a style guide) and whatever tracks current state (a `progress.json`, a project board, an issues list). The spec you write next should match established patterns already in the codebase, not invent new ones — an external model has no way to know the local conventions unless the spec spells them out.

**2. Write the spec into the repo, not just into chat.**
A spec that only exists in a chat transcript can't be handed to another tool, re-read later, or diffed against. Write it as a file: exact list of files to touch, exact schema/interface shapes, the acceptance criteria as a checklist the executor will mark against, and any code-quality rules from the conventions doc that apply directly (validation of untrusted input, secret handling, error handling patterns, etc.) so the executor doesn't have to go find them itself.

**3. Hand the spec to the delegate model using the executor prompt.**
See `references/executor-prompt-template.md` for the full template. The key things that prompt must do: point the model at the conventions doc and the spec file, forbid inventing design decisions not in the spec, require it to stop and flag ambiguity rather than guess, require it to actually run the commands it claims to have run and paste the real output, and require a checklist update that only marks an item done if it was genuinely executed and verified — not aspirationally.

**4. Verify independently. Never accept the self-report as-is.**
This is the step that makes the whole pattern safe, so don't compress it. Concretely:

- Re-run the build, lint, and test suite yourself rather than trusting reported output.
- Read the actual diff or commit, not just the checklist — confirm the files touched match the spec and nothing unrelated snuck in.
- If the work involves a live system (an API call, a deployed function, a database migration), hit it for real and look at the real response, the same way you'd verify your own work.
- Treat a fully-checked checklist with the same skepticism as a partially-checked one until you've confirmed a sample of the checks yourself. A model that fabricates one line of a report will fabricate others.

**5. Fix small gaps directly; only send it back for a full redo if the gap is large.**
If verification turns up a handful of small issues, it's usually cheaper for Claude to fix them directly than to round-trip the whole spec back to the delegate. Reserve a full redo for cases where the implementation took a fundamentally wrong approach.

**6. Update the tracker with what's actually true, not what was claimed.**
Write down what was verified and how, not just "done." If a decisions log exists, log it there. An out-of-date or over-optimistic tracker is worse than no tracker, because the next person (or the next AI session) trusts it.

## Choosing a delegate model

Prefer models known for agentic coding and long, literal instruction-following over models chosen for general chat quality — the job here is "follow this spec precisely," not "have good conversational judgment." Before trusting a new model with real scope, run one small task with a known-correct answer through it first.

For NVIDIA NIM's free tier specifically (`https://integrate.api.nvidia.com/v1`, OpenAI-compatible, no credit card but phone verification required, roughly 40 requests/minute shared across whichever model is called): as researched during this project, a reasonable default ranking is Kimi K2.6 first, DeepSeek V4 Pro second, GLM-5.2 third, based on context length and coding-instruction-following. Free-tier catalogs change often — treat this ranking as a starting point to re-verify against NVIDIA's current catalog rather than a fixed fact, and swap in whatever the user is already using successfully.

## Don't add a mandatory AI-review gate by default

It's tempting to insert a second AI as a "QA lead" between the implementer and Claude's final check. In practice this adds cost (a full extra pass) without reducing the verification burden on Claude, because the reviewer's judgment still needs the same independent checking as the implementer's — a reviewer can confidently report a fabricated pass rate just as easily as an implementer can. If the user wants a second opinion anyway, treat it as optional and non-authoritative input into step 4, not a required checkpoint that has to pass before Claude looks at the work.

## Reference files

- `references/executor-prompt-template.md` — the prompt to hand the delegate model, ready to fill in with the spec file path and any project-specific conventions.
