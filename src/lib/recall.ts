// Recall = % of review-question answers correct. Used by the teacher Cards
// workspace as a "what content is hard" signal. Gated below MIN_ATTEMPTS so
// a tiny sample can't mislead.
export const MIN_RECALL_ATTEMPTS = 8;

export type RecallTier = 'good' | 'mid' | 'low' | 'none';

export type RecallStat = {
  /** 0..100, or null when below the attempts gate. */
  pct: number | null;
  tier: RecallTier;
  attempts: number;
};

export function computeRecall(attempts: number, correct: number): RecallStat {
  if (attempts < MIN_RECALL_ATTEMPTS) {
    return { pct: null, tier: 'none', attempts };
  }
  const pct = Math.round((correct / attempts) * 100);
  const tier: RecallTier = pct >= 80 ? 'good' : pct >= 60 ? 'mid' : 'low';
  return { pct, tier, attempts };
}
