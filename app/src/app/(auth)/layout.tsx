import Link from "next/link";

// Restyled onto the shared design system (Module 5.6) 2026-09-01 — was a
// completely bare centering div predating that system. Adds the brand mark
// above the card so /sign-in and /sign-up don't feel like an orphaned form.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-surface-0 px-4 py-16">
      <Link href="/" className="text-lg font-semibold tracking-tight text-text-primary">
        AEO Visibility Platform
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface-1 p-6">
        {children}
      </div>
    </div>
  );
}
