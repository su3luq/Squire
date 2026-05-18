'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { saigonShortDate } from '@/lib/saigon-date';

// Quick-start a new lesson with a sensible default title + auto-suggested
// lesson_number, then redirect straight into the card editor.
//
// Multi-class teachers: picks the alphabetically-first non-archived class.
// v1 has one class; revisit if/when multi-class lands.
export async function quickStartLesson(): Promise<void> {
  const supabase = await createClient();

  const { data: classes, error: classesError } = await supabase
    .from('classes')
    .select('id')
    .is('archived_at', null)
    .order('name')
    .limit(1);

  if (classesError || !classes || classes.length === 0) {
    redirect('/teacher/lessons/new');
  }

  const class_id = classes[0].id;

  const { data: maxLesson } = await supabase
    .from('lessons')
    .select('lesson_number')
    .eq('class_id', class_id)
    .order('lesson_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const lesson_number = (maxLesson?.lesson_number ?? 0) + 1;
  const title = `Untitled lesson — ${saigonShortDate()}`;

  const { data, error } = await supabase
    .from('lessons')
    .insert({ class_id, title, lesson_number })
    .select('id')
    .single();

  if (error || !data) {
    // Fall back to the form so the user can resolve any unique-constraint
    // collision or other unexpected failure with full context.
    redirect('/teacher/lessons/new');
  }

  redirect(`/teacher/lessons/${data.id}/cards/new`);
}
