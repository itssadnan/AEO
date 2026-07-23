# AEO Visibility Platform — app

Next.js (App Router) + TypeScript + Tailwind, deployed on Vercel. This is the `app/` project described in `../docs/CONVENTIONS.md` Section 1 — read that file (and `../CLAUDE.md` at the repo root) before working here.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in real values — see comments in .env.example
npm run dev
```

## Scripts

- `npm run dev` — local dev server
- `npm run build` / `npm start` — production build/serve
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit` (strict mode)
- `npm test` — Node's built-in test runner over `tests/unit` and `tests/integration`
- `npm run format` / `format:check` — Prettier

## Structure

See `../docs/CONVENTIONS.md` Section 1 for the full folder layout and the barrel-export rule for `src/modules/*`.
