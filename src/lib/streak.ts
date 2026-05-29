// Streak display helpers. The DB stores streak_days as the cached value
// from the last review attempt; this module computes the *effective*
// streak — what the student sees — taking into account whether they've
// reviewed today or yesterday. Without this, a 12-day streak that ended
// last Monday would still display as "12" on Friday, lying to the user.

const SAIGON_TZ = 'Asia/Ho_Chi_Minh';

/** Saigon-local ISO date string (YYYY-MM-DD) for the given instant. */
export function saigonDay(date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAIGON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date);
}

/** Difference in calendar days between two YYYY-MM-DD strings. */
export function dayDiff(later: string, earlier: string): number {
  const a = Date.UTC(
    Number(later.slice(0, 4)),
    Number(later.slice(5, 7)) - 1,
    Number(later.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(earlier.slice(0, 4)),
    Number(earlier.slice(5, 7)) - 1,
    Number(earlier.slice(8, 10)),
  );
  return Math.round((a - b) / 86_400_000);
}

export type StreakStatus =
  | 'alive_today'
  | 'in_danger' // counted yesterday, no review today yet
  | 'broken'
  | 'none';

export type EffectiveStreak = {
  /** Display number — 0 when broken or never started. */
  days: number;
  /** Categorisation for UI colouring + copy. */
  status: StreakStatus;
};

/**
 * Resolve the cached `streak_days` + `streak_last_day` from the DB into
 * what the student should see right now.
 *
 *   - alive_today: reviewed today → display the cached number
 *   - in_danger:   reviewed yesterday → display the cached number,
 *                  warn that the streak will reset if today is missed
 *   - broken:      had a streak but skipped — display 0
 *   - none:        never reviewed → display 0
 */
export function computeEffectiveStreak(
  stored: number,
  lastDay: string | null,
  today: string = saigonDay(),
): EffectiveStreak {
  if (!lastDay || stored === 0) {
    return { days: 0, status: 'none' };
  }
  const gap = dayDiff(today, lastDay);
  if (gap === 0) return { days: stored, status: 'alive_today' };
  if (gap === 1) return { days: stored, status: 'in_danger' };
  return { days: 0, status: 'broken' };
}
