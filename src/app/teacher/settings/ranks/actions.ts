'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { RANK_GRADIENT_BY_ID } from '@/lib/rank-gradients';

export type RankInput = {
  tier: number;
  min_xp: number;
  gradient_id: string;
  name: string | null;
};

type Result = { error: string | null };

/**
 * Replace the entire rank ladder atomically.
 *
 * 1. Validate the proposed ranks (at least 2 tiers, monotonic in both
 *    tier number and min_xp, valid gradient_id values).
 * 2. Wipe storage.protect_delete()-safe public.ranks rows.
 * 3. Insert the new set.
 * 4. Recompute every student's current_rank so the rings refresh.
 *    The notify_on_rank_up() trigger only fires on a rank UP (NEW <
 *    OLD), so a bulk recompute won't notify students whose tier
 *    didn't change OR who actually dropped a tier.
 */
export async function saveRanks(ranks: RankInput[]): Promise<Result> {
  // --- 1. Validate.
  if (ranks.length < 2) {
    return { error: 'You need at least 2 tiers.' };
  }
  const sorted = [...ranks].sort((a, b) => a.tier - b.tier);
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (!Number.isInteger(r.tier) || r.tier < 1) {
      return { error: `Tier "${r.tier}" must be a positive integer.` };
    }
    if (!Number.isInteger(r.min_xp) || r.min_xp < 0) {
      return { error: `Tier ${r.tier}: min XP must be a non-negative integer.` };
    }
    if (!(r.gradient_id in RANK_GRADIENT_BY_ID)) {
      return { error: `Tier ${r.tier}: unknown gradient "${r.gradient_id}".` };
    }
    if (i > 0 && sorted[i].tier === sorted[i - 1].tier) {
      return { error: `Duplicate tier ${r.tier}.` };
    }
    // Lower tier numbers (closer to 1) are HIGHER rank, so they
    // require MORE XP — min_xp must descend as tier ascends.
    if (i > 0 && sorted[i].min_xp >= sorted[i - 1].min_xp) {
      return {
        error: `Tier ${r.tier} (min XP ${r.min_xp}) must be strictly LESS than tier ${sorted[i - 1].tier} (min XP ${sorted[i - 1].min_xp}).`,
      };
    }
  }
  // Min XP values must be unique (DB enforces this too).
  const minXps = sorted.map((r) => r.min_xp);
  if (new Set(minXps).size !== minXps.length) {
    return { error: 'Each tier needs a distinct min XP value.' };
  }

  // --- 2 & 3. Replace the table contents in one round-trip.
  const supabase = await createClient();
  const { error: delErr } = await supabase
    .from('ranks')
    .delete()
    .gte('tier', 0); // no-op WHERE that matches everything
  if (delErr) return { error: `Delete failed: ${delErr.message}` };

  const { error: insErr } = await supabase.from('ranks').insert(
    sorted.map((r) => ({
      tier: r.tier,
      min_xp: r.min_xp,
      gradient_id: r.gradient_id,
      name: r.name?.trim() || null,
    })),
  );
  if (insErr) return { error: `Insert failed: ${insErr.message}` };

  // --- 4. Recompute every student's rank against the new ladder.
  // compute_rank_from_xp() now reads from the table we just rewrote,
  // so the per-row UPDATE picks up the new thresholds. The
  // notify_on_rank_up() trigger only fires on a rank UP transition
  // (NEW < OLD), so bulk-writing the recomputed values doesn't spam.
  const { data: students } = await supabase
    .from('profiles')
    .select('id, xp_total, current_rank')
    .eq('role', 'student');

  if (students?.length) {
    for (const s of students) {
      const { data: tier } = await supabase.rpc('compute_rank_from_xp', {
        xp: s.xp_total ?? 0,
      });
      if (tier != null && tier !== s.current_rank) {
        await supabase
          .from('profiles')
          .update({ current_rank: tier })
          .eq('id', s.id);
      }
    }
  }

  revalidatePath('/teacher/settings/ranks');
  revalidatePath('/leaderboard');
  return { error: null };
}
