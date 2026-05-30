'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format-relative-time';

// Home-screen entry into the review flow.
//   - dueCount > 0 → enabled, "Review (N due)" link
//   - dueCount === 0 + nextDueAt present → disabled with live countdown
//   - dueCount === 0 + no nextDueAt → disabled with "No cards yet"
// When the countdown ticks past zero, the launcher auto-refreshes the page so
// the new server-side dueCount is picked up — student doesn't have to manually
// reload to discover that a card just became reviewable.

export function ReviewLauncher({
  dueCount,
  nextDueAt,
}: {
  dueCount: number;
  nextDueAt: string | null;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  // Ref (not state) so flipping it doesn't trigger a re-render — the
  // router.refresh() will cause a fresh render via its own mechanism.
  const refreshTriggeredRef = useRef(false);

  // Only tick when we're actually showing a countdown.
  const ticking = dueCount === 0 && nextDueAt !== null;

  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  const nextDueMs = nextDueAt ? new Date(nextDueAt).getTime() : null;
  const isReady = dueCount > 0 || (nextDueMs !== null && now >= nextDueMs);

  // When the countdown crosses zero, refresh the page to get fresh server data.
  useEffect(() => {
    if (!isReady) return;
    if (dueCount > 0) return; // already enabled from server data, no refresh needed
    if (refreshTriggeredRef.current) return;
    refreshTriggeredRef.current = true;
    router.refresh();
  }, [isReady, dueCount, router]);

  if (isReady) {
    return (
      <Link
        href={dueCount > 0 ? '/student/cards?review=1' : '/student/cards'}
        className={buttonVariants()}
      >
        {dueCount > 0 ? `Review (${dueCount} due)` : 'Review'}
      </Link>
    );
  }

  if (!nextDueMs) {
    return (
      <div className="flex flex-col items-center gap-1">
        <button
          disabled
          type="button"
          className={cn(buttonVariants({ variant: 'outline' }), 'opacity-60')}
        >
          Review
        </button>
        <p className="text-xs text-slate-500">No cards unlocked yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        disabled
        type="button"
        className={cn(buttonVariants({ variant: 'outline' }), 'opacity-60')}
      >
        Review
      </button>
      <p className="text-xs text-slate-500">
        Next card {formatRelativeTime(nextDueMs, now)}
      </p>
    </div>
  );
}
