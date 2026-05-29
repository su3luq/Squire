// Server-side helpers that fetch the live rank ladder from the
// `ranks` table. Both functions are React.cache()'d so each request
// fetches the table at most once even if many components ask for it
// (leaderboard rows, the app shell, the student dashboard, etc.).

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import {
  resolveGradient,
  type RankGradient,
} from '@/lib/rank-gradients';

export type RankConfig = {
  tier: number;
  min_xp: number;
  gradient_id: string;
  name: string | null;
};

export type ResolvedRank = RankConfig & {
  gradient: RankGradient | null;
};

export const getRanksConfig = cache(async (): Promise<RankConfig[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('ranks')
    .select('tier, min_xp, gradient_id, name')
    .order('tier', { ascending: true });
  return data ?? [];
});

export const getRanksMap = cache(
  async (): Promise<Map<number, ResolvedRank>> => {
    const ranks = await getRanksConfig();
    const map = new Map<number, ResolvedRank>();
    for (const r of ranks) {
      map.set(r.tier, { ...r, gradient: resolveGradient(r.gradient_id) });
    }
    return map;
  },
);

export type RingConfig = {
  gradient: string;
  glow?: string | null;
};

/** Resolve a single tier into a RingConfig the Avatar component can render. */
export async function getRingConfigForTier(
  tier: number | null | undefined,
): Promise<RingConfig | null> {
  if (tier == null) return null;
  const map = await getRanksMap();
  const r = map.get(tier);
  if (!r?.gradient) return null;
  return { gradient: r.gradient.gradient, glow: r.gradient.glow ?? null };
}

export type RankProgress = {
  /** Resolved current rank (or null if tier unknown). */
  current: ResolvedRank | null;
  /** Resolved next-higher rank (tier - 1) or null if already top. */
  next: ResolvedRank | null;
  /** 0..1 progress from current floor to next floor. 1 = at top. */
  progress: number;
  /** XP remaining until the next rank threshold. 0 if at top. */
  xpToNext: number;
};

/**
 * Dynamic-ladder version of {@link rankProgress}. Reads the live `ranks`
 * table so it stays correct after the teacher edits the ladder.
 */
export async function getRankProgress(
  xp: number,
  tier: number | null | undefined,
): Promise<RankProgress> {
  const map = await getRanksMap();
  const current = tier != null ? (map.get(tier) ?? null) : null;
  const next = tier != null ? (map.get(tier - 1) ?? null) : null;
  if (!current) return { current: null, next: null, progress: 0, xpToNext: 0 };
  if (!next) return { current, next: null, progress: 1, xpToNext: 0 };
  const span = next.min_xp - current.min_xp;
  const progress =
    span > 0 ? Math.max(0, Math.min(1, (xp - current.min_xp) / span)) : 1;
  return {
    current,
    next,
    progress,
    xpToNext: Math.max(0, next.min_xp - xp),
  };
}
