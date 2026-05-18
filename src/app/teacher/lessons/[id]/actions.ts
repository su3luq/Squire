'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export type UpdateLessonState = { error: string | null; success: boolean };

export async function updateLesson(
  lessonId: string,
  _prevState: UpdateLessonState,
  formData: FormData
): Promise<UpdateLessonState> {
  const title = String(formData.get('title') ?? '').trim();
  const lesson_number = parseInt(String(formData.get('lesson_number') ?? ''), 10);
  const taught_at_raw = String(formData.get('taught_at') ?? '').trim();

  if (!title) return { error: 'Title is required.', success: false };
  if (isNaN(lesson_number) || lesson_number < 1) {
    return { error: 'Lesson number must be a positive integer.', success: false };
  }

  const taught_at = taught_at_raw ? new Date(taught_at_raw).toISOString() : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from('lessons')
    .update({ title, lesson_number, taught_at })
    .eq('id', lessonId);

  if (error) {
    if (error.code === '23505') {
      return {
        error: `Lesson number ${lesson_number} already exists in this class.`,
        success: false,
      };
    }
    return { error: `Failed to update lesson: ${error.message}`, success: false };
  }

  revalidatePath(`/teacher/lessons/${lessonId}`);
  revalidatePath('/teacher/lessons');
  return { error: null, success: true };
}

export async function deleteLesson(
  lessonId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from('lessons').delete().eq('id', lessonId);
  if (error) return { error: `Failed to delete lesson: ${error.message}` };
  revalidatePath('/teacher/lessons');
  return { error: null };
}
