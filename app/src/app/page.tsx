// Marketing/entry placeholder — real marketing site is future work; this
// exists so signed-out visitors land somewhere coherent instead of a blank
// or unstyled screen. Restyled onto the shared design system (Module 5.6)
// 2026-09-01 — previously used hardcoded zinc/black classes predating that
// system entirely (Module 0.0 scaffold).
export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-surface-0 px-4 py-24">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex items-center rounded-full bg-accent-muted px-3 py-1 text-xs font-medium text-accent">
          Under construction
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          AEO Visibility Platform
        </h1>
        <p className="max-w-md text-text-secondary">
          Tracks whether AI answer engines mention and recommend your brand — and explains why a
          competitor is winning.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <a
          href="/sign-in"
          className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Sign in
        </a>
        <a
          href="/sign-up"
          className="inline-flex items-center justify-center rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-1"
        >
          Sign up
        </a>
      </div>
    </div>
  );
}
