import { Skeleton } from '@/components/skeleton';

export default function StudentHomeLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Rank hero placeholder */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-5">
          <Skeleton className="h-28 w-28 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-2 w-full" />
          </div>
        </div>
      </div>

      {/* Closest rival placeholder */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-32" />
          <div className="ml-auto">
            <Skeleton className="h-3 w-12" />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>

      {/* Recent wins placeholder */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3">
          <Skeleton className="h-4 w-24" />
        </div>
        <ul className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-5 w-10 rounded-full" />
            </li>
          ))}
        </ul>
      </div>

      {/* Stat cards placeholder */}
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-7 w-12" />
            <Skeleton className="mt-1 h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
