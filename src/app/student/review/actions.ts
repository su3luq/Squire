'use server';

import { createClient } from '@/lib/supabase/server';
import {
  scheduleNext,
  type DbCardReview,
  type RatingChoice,
} from '@/lib/fsrs';

export type RateCardResult =
  | { ok: true; nextDueAt: string }
  | { ok: false; error: string };

// Mutation: a student rates a card. Loads the current card_reviews row,
// runs FSRS to compute the next state, writes it back. RLS ensures the
// student can only rate their own rows (handled in migration 008 policies).
export async function rateCard(
  cardReviewId: string,
  choice: RatingChoice
): Promise<RateCardResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: row, error: fetchError } = await supabase
    .from('card_reviews')
    .select(
      'id, student_id, difficulty, stability, state, due_at, last_reviewed_at, review_count'
    )
    .eq('id', cardReviewId)
    .single();

  if (fetchError || !row) {
    return { ok: false, error: 'Card review row not found.' };
  }

  // Defensive: belt-and-braces alongside RLS.
  if (row.student_id !== user.id) {
    return { ok: false, error: 'Not your card.' };
  }

  const update = scheduleNext(row as DbCardReview, choice);

  const { error: updateError } = await supabase
    .from('card_reviews')
    .update(update)
    .eq('id', cardReviewId);

  if (updateError) {
    return { ok: false, error: `Failed to save rating: ${updateError.message}` };
  }

  return { ok: true, nextDueAt: update.due_at };
}
