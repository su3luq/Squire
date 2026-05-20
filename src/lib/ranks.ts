// Rank tier definitions — matches the compute_rank_from_xp() Postgres function
// and CLAUDE.md "XP and Ranks" table. The DB stores `profiles.current_rank` as
// the tier number (1-7); this module is the single source for the names.

export const RANKS = [
  { tier: 1, name: 'Novice', minXp: 0 },
  { tier: 2, name: 'Apprentice', minXp: 200 },
  { tier: 3, name: 'Adept', minXp: 600 },
  { tier: 4, name: 'Expert', minXp: 1400 },
  { tier: 5, name: 'Master', minXp: 2600 },
  { tier: 6, name: 'Grandmaster', minXp: 4200 },
  { tier: 7, name: 'Luminary', minXp: 6000 },
] as const;

export function rankName(tier: number): string {
  return RANKS[tier - 1]?.name ?? 'Unknown';
}

// Returns 0..1 progress through the current rank. 1 means at-or-above the
// next rank's threshold (the trigger should have moved them by now).
export function rankProgress(xp: number, tier: number): number {
  const current = RANKS[tier - 1];
  const next = RANKS[tier];
  if (!current) return 0;
  if (!next) return 1; // Already at top rank.
  const span = next.minXp - current.minXp;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (xp - current.minXp) / span));
}
