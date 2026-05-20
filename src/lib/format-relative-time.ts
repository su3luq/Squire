// Format a future timestamp as a short relative-time string.
// Returns "now" when the target has passed.
// Granularity:
//   <60s → "in 47s"
//   <60m → "in 5m"
//   <24h → "in 3h"
//   else → "in 2d"
// Used by both the review-end summary, the home-screen launcher, and the
// "All caught up" empty state on /student/review.

export function formatRelativeTime(targetMs: number, nowMs: number = Date.now()): string {
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return 'now';
  const seconds = Math.ceil(diffMs / 1000);
  if (seconds < 60) return `in ${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.ceil(hours / 24);
  return `in ${days}d`;
}
