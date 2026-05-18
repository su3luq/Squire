'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export type CreateLessonState = { error: string | null };

export async function createLesson(
  _prevState: CreateLessonState,
  formData: FormData
): Promise<CreateLessonState> {
  const title = String(formData.get('title') ?? '').trim();
  const lesson_number = parseInt(String(formData.get('lesson_number') ?? ''), 10);

  if (!title) return { error: 'Title is required.' };
  if (isNaN(lesson_number) || lesson_number < 1) {
    return { error: 'Lesson number must be a positive integer.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lessons')
    .insert({ title, lesson_number })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { error: `Lesson number ${lesson_number} is already in use.` };
    }
    return { error: `Failed to create lesson: ${error.message}` };
  }

  redirect(`/teacher/lessons/${data.id}`);
}
