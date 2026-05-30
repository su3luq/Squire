'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { saigonShortDate } from '@/lib/saigon-date';

// Quick-start a new lesson with a default title + auto lesson_number, then
// redirect straight into the card editor. Skips the "fill out form first"
// step. Lessons are class-agnostic now — no class selection needed.
export async function quickStartLesson(): Promise<void> {
  const supabase = await createClient();

  const { data: maxLesson } = await supabase
    .from('lessons')
    .select('lesson_number')
    .order('lesson_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const lesson_number = (maxLesson?.lesson_number ?? 0) + 1;
  const title = `Untitled lesson — ${saigonShortDate()}`;

  const { data, error } = await supabase
    .from('lessons')
    .insert({ title, lesson_number })
    .select('id')
    .single();

  if (error || !data) {
    // Fall back to the regular form so the user can resolve any error.
    redirect('/teacher/cards/new');
  }

  redirect(`/teacher/cards/${data.id}/cards/new`);
}
