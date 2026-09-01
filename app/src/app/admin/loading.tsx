import { PageSkeleton } from "@/components/ui/skeleton";

// Restyled onto the shared design system (Module 5.6) 2026-09-01 — was
// hardcoded bg-gray-50, inconsistent with the surface-0 body background
// used everywhere else.
export default function Loading() {
  return (
    <div className="min-h-screen bg-surface-0 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <PageSkeleton />
      </div>
    </div>
  );
}
