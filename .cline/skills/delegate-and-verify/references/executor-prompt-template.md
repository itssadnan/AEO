# Executor prompt template

Fill in the bracketed parts and hand this to the delegate model (NVIDIA NIM model, Cline session, or any other coding-capable model) as its task prompt. The structure exists to close the two failure modes that make delegation risky: the model inventing design decisions the spec didn't ask for, and the model reporting success it didn't actually verify.

```
You are implementing [module/feature name] against a written spec. Follow the
spec exactly — do not invent design decisions, file structures, naming, or
approaches that aren't in it. If something in the spec is ambiguous or
missing information you need, STOP and ask rather than guessing.

Before writing any code:
1. Read [path to conventions doc, e.g. docs/CONVENTIONS.md] in full. Every
   rule in there applies to this task even if the spec doesn't repeat it
   (input validation, error handling, secret handling, testing
   expectations, folder structure, etc.).
2. Read [path to spec file] in full.
3. Read [path to tracker file, if one exists] to see current project state
   and avoid conflicting with work already in progress.

While implementing:
- Touch only the files listed in the spec unless the spec explicitly says
  otherwise. If you find you need to touch something else, stop and flag it
  instead of proceeding.
- Write tests for both the success path and realistic failure paths (bad
  input, a downstream call failing, empty/edge-case data) — not just the
  happy path.
- Validate any untrusted input (API responses, user input, file contents)
  before using it, per the conventions doc.

Before marking anything as done:
- Actually run the build, the linter, and the test suite. Paste the real
  command and its real output — do not describe what you expect it to say.
- Only check off an item on the spec's acceptance checklist if you have
  concrete evidence it passed (real command output, a real response from a
  live call if applicable). An unverified item stays unchecked.
- Commit your work with a clear message. The commit and the real command
  output are the record of what happened — a prose summary claiming success
  is not sufficient on its own.

Report back:
- The spec's checklist with each item checked or unchecked based on what you
  actually verified.
- Any item you could not verify, and why.
- Any point where you stopped to ask rather than guess, and what you'd
  suggest.
- The exact commit(s) you made.
```

## Notes on using this template

- The "STOP and ask rather than guess" instruction matters more than it looks — a model that fills gaps with plausible-sounding invented behavior is the single biggest source of spec drift. It's cheaper to answer one clarifying question than to discover an invented design choice during verification.
- The "paste the real output" requirement is what makes step 4 of the main workflow (independent verification) fast — if the delegate already pasted real command output, Claude's job is largely to spot-check it and re-run the parts that matter most, not redo everything from scratch.
- Point the tracker/spec paths at files actually in the repo, not descriptions in chat — the delegate model can't read your conversation history, only what's on disk.
