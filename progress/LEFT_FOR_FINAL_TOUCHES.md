# Left for Final Touches

A running list of deferred, **non-blocking** work discovered during development —
things that are known gaps but don't block the current module's `done` status.
Nothing here should block moving on to the next module; it should get cleaned
up before real production launch (real customers, real money) or whenever
convenient before then.

If you're an LLM picking up this project: read this file every session
alongside `progress/progress.json`. When you close one of these items, move it
to "Resolved" with the date and a one-line note, don't delete it — same
append-only spirit as the per-module decisions logs. When you find a new
deferred item, add it here in the same session, under the module that
surfaced it.

## Open

### From Module 5.1 (Auth & Account)

- **Real SMTP provider not configured; "Confirm email" is disabled as a stand-in.** Supabase's free-tier shared email service has a strict rate limit (~2-4 emails/hour) that was getting exhausted during testing, surfacing as raw 500s on signup. As a workaround, the user disabled Supabase Auth's "Confirm email" requirement entirely (2026-07-24) so signup no longer needs to send mail at all. This is fine for continued development but is **not the intended production posture** — anyone can sign up with an email they don't own before a real launch. Before real customers: configure a real SMTP provider (Resend, Postmark, SES, etc.) in Supabase Auth settings, then re-enable "Confirm email".
- **Migration filename convention doesn't match Supabase CLI/GitHub-integration expectations.** This project's migrations are named sequentially (`0001_...`, `0002_...`, `0003_...`, `0004_...`), but Supabase's CLI/GitHub integration expects timestamp-prefixed filenames matching what's recorded in `supabase_migrations.schema_migrations`. This mismatch needs to be resolved before safely linking Supabase's native GitHub integration (auto-applying migrations on push) — right now every migration in this project has been applied manually via the Supabase MCP connector's `apply_migration`, which sidesteps the issue but doesn't scale once the GitHub integration is wanted.
- **Test accounts/data accumulated in the live Supabase project during diagnostics.** Worth a cleanup pass before launch: test users like `csalad504@gmail.com`, various `heisen.better.berg+*@gmail.com` aliases, and old `rls-test-*@example.com` rows (some already cleaned up manually during RLS testing, some may remain) plus their `rate_limit_events` history. None of this is harmful to leave, but it's noise in a production database.
- **Domain not purchased yet** — `aeo-roan.vercel.app` works fine as a placeholder (tracked as satisfied in Module 0.0's acceptance criteria), but a real domain should be purchased/pointed before public launch.
- **Google OAuth is not enabled on the live Supabase project.** Found 2026-07-24: clicking "Continue with Google" on production correctly builds the redirect (right callback URL, valid PKCE challenge) but Supabase itself rejects it with `400 "Unsupported provider: provider is not enabled"`. The app code is not the problem — this is a Supabase Dashboard → Authentication → Providers → Google setting. No record exists of anyone deliberately disabling it (checked the full decisions log); most likely it was never actually saved despite an earlier session's confirmation, or got toggled off by accident. Deliberately descoped from Module 5.1's Definition-of-Done by user decision (2026-07-24) so it doesn't block that module or Module 5.2 — this is the only reason it's `done`-eligible without OAuth working. **Before real launch:** check the dashboard toggle + Client ID/Secret, then re-run the "Continue with Google" click-through end-to-end.

## Resolved

_(none yet — this file was created 2026-07-24)_
