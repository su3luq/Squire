// Rank tier definitions — matches the compute_rank_from_xp() Postgres
// function. The DB stores `profiles.current_rank` as an integer 1-7
// where 1 is the highest rank (most XP) and 7 is the lowest.
// Ranks are displayed by number only — no English names.

export const RANKS = [
  { tier: 1, minXp: 6000 },
  { tier: 2, minXp: 4200 },
  { tier: 3, minXp: 2600 },
  { tier: 4, minXp: 1400 },
  { tier: 5, minXp: 600 },
  { tier: 6, minXp: 200 },
  { tier: 7, minXp: 0 },
] as const;

// Rank one tier higher (numerically lower). Returns null if the tier
// is already at the top (tier 1).
export function nextRankUp(tier: number): (typeof RANKS)[number] | null {
  if (tier <= 1) return null;
  return RANKS[tier - 2] ?? null;
}

// Returns 0..1 progress from the current rank's floor toward the next
// rank up's floor. 1 means at-or-above the next rank's threshold.
export function rankProgress(xp: number, tier: number): number {
  const current = RANKS.find((r) => r.tier === tier);
  const next = nextRankUp(tier);
  if (!current) return 0;
  if (!next) return 1; // Already at top rank.
  const span = next.minXp - current.minXp;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (xp - current.minXp) / span));
}
