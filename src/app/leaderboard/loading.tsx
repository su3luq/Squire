import { Skeleton } from '@/components/skeleton';

export default function LeaderboardLoading() {
  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-64" />
      </header>

      {/* Podium placeholder */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3 sm:items-end">
        {[2, 1, 3].map((place, i) => (
          <div
            key={place}
            className={
              i === 1
                ? 'rounded-2xl border border-border bg-card p-5 text-center sm:pt-7'
                : 'rounded-2xl border border-border bg-card p-4 text-center'
            }
          >
            <Skeleton className="mx-auto h-3 w-10" />
            <Skeleton
              className={
                i === 1
                  ? 'mx-auto mt-3 h-16 w-16 rounded-full'
                  : 'mx-auto mt-3 h-12 w-12 rounded-full'
              }
            />
            <Skeleton className="mx-auto mt-3 h-4 w-24" />
            <Skeleton className="mx-auto mt-2 h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Below-podium list placeholder */}
      <div className="rounded-lg border border-border bg-card">
        <ul className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="h-3 w-6" />
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-4 w-12" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
