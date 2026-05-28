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
