'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { cardSchema, type CardFormValues } from '@/lib/card-schema';

export type CreateCardResult = { error: string | null };

export async function createCard(
  lessonId: string,
  values: CardFormValues
): Promise<CreateCardResult> {
  // Server-side validation (the client also validates, but never trust the client).
  const parsed = cardSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid card data.' };
  }

  const supabase = await createClient();

  // Find the next position for this lesson (append).
  const { data: maxPos } = await supabase
    .from('review_cards')
    .select('position')
    .eq('lesson_id', lessonId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (maxPos?.position ?? -1) + 1;

  // Insert the card.
  const { data: card, error: cardError } = await supabase
    .from('review_cards')
    .insert({
      lesson_id: lessonId,
      headline: parsed.data.headline.trim(),
      body: parsed.data.body,
      position,
    })
    .select('id')
    .single();

  if (cardError || !card) {
    return { error: `Failed to create card: ${cardError?.message ?? 'unknown'}` };
  }

  // Insert the MCQs.
  const questionRows = parsed.data.questions.map((q) => ({
    card_id: card.id,
    question_text: q.question_text.trim(),
    choice_a: q.choice_a.trim(),
    choice_b: q.choice_b.trim(),
    choice_c: q.choice_c.trim(),
    choice_d: q.choice_d.trim(),
    correct_choice: q.correct_choice,
  }));

  const { error: questionsError } = await supabase
    .from('card_quiz_questions')
    .insert(questionRows);

  if (questionsError) {
    // Roll back the card if questions failed.
    await supabase.from('review_cards').delete().eq('id', card.id);
    return { error: `Failed to save questions: ${questionsError.message}` };
  }

  redirect(`/teacher/lessons/${lessonId}`);
}
