import { Skeleton } from '@/components/skeleton';

// Loading shell for /teacher/analytics and all its sub-routes. The
// analytics layout (sub-tabs + class filter) renders synchronously,
// then this loading file fills the content area while the streaming
// page renders.

export default function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      {/* Rollup row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-7 w-12" />
            <Skeleton className="mt-1 h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Hero panel placeholder */}
      <div className="rounded-lg border border-border bg-card p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-3 w-48" />
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-6" />
              </div>
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Three shortcut cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="space-y-2 p-5">
              {Array.from({ length: 3 }).map((__, j) => (
                <div key={j} className="flex items-center gap-3">
                  <Skeleton className="h-3 w-20 flex-1" />
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
