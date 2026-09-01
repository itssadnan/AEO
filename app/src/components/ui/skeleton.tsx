// Shared loading placeholder. Used both by route-level loading.tsx files
// (Next.js's automatic loading UI during navigation) and inside client views
// that previously each hand-rolled their own "Loading..." block -- found
// during independent verification, 2026-08-14, that no loading.tsx existed
// anywhere in the app router, so route transitions showed a blank flash.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-2 ${className}`} />;
}

/** A page-shaped skeleton: header bar + a grid of stat tiles + a table block. */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-8" aria-busy="true" aria-live="polite">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface-1 border border-border rounded-xl p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>

      <div className="bg-surface-1 border border-border rounded-xl p-6 space-y-4">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
