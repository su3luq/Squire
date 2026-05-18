'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cardSchema, type CardFormValues } from '@/lib/card-schema';

export type UpdateCardResult = { error: string | null };

export async function updateCard(
  lessonId: string,
  cardId: string,
  values: CardFormValues
): Promise<UpdateCardResult> {
  const parsed = cardSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid card data.' };
  }

  const supabase = await createClient();

  // Update the card itself.
  const { error: cardError } = await supabase
    .from('review_cards')
    .update({
      headline: parsed.data.headline.trim(),
      body: parsed.data.body,
    })
    .eq('id', cardId);

  if (cardError) {
    return { error: `Failed to update card: ${cardError.message}` };
  }

  // Replace all questions atomically: delete + insert.
  // RLS allows teacher full access; the FK from card_quiz_questions → review_cards
  // has ON DELETE CASCADE, so we delete by card_id explicitly.
  const { error: delError } = await supabase
    .from('card_quiz_questions')
    .delete()
    .eq('card_id', cardId);

  if (delError) {
    return { error: `Failed to clear old questions: ${delError.message}` };
  }

  const questionRows = parsed.data.questions.map((q) => ({
    card_id: cardId,
    question_text: q.question_text.trim(),
    choice_a: q.choice_a.trim(),
    choice_b: q.choice_b.trim(),
    choice_c: q.choice_c.trim(),
    choice_d: q.choice_d.trim(),
    correct_choice: q.correct_choice,
  }));

  const { error: insertError } = await supabase
    .from('card_quiz_questions')
    .insert(questionRows);

  if (insertError) {
    return { error: `Failed to save new questions: ${insertError.message}` };
  }

  revalidatePath(`/teacher/lessons/${lessonId}`);
  redirect(`/teacher/lessons/${lessonId}`);
}

export async function deleteCard(
  lessonId: string,
  cardId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from('review_cards').delete().eq('id', cardId);
  if (error) return { error: `Failed to delete card: ${error.message}` };
  revalidatePath(`/teacher/lessons/${lessonId}`);
  return { error: null };
}
