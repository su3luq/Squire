'use client';

import { useEffect, useState } from 'react';
import { formatRelativeTime } from '@/lib/format-relative-time';

// Ticking display of "in 47s" / "in 3m" / "in 2h" / "in 1d" / "now".
// Re-renders once per second.

export function NextReviewCountdown({ dueAt }: { dueAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return <>{formatRelativeTime(new Date(dueAt).getTime(), now)}</>;
}
