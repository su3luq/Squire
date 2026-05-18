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

// Wire the "Unlock for class" button to the unlock_lesson_cards RPC (migration 012).
// Idempotent — safe to re-run after adding cards or enrolling new students.
export type UnlockResult =
  | {
      ok: true;
      cards_count: number;
      students_count: number;
      reviews_created: number;
    }
  | { ok: false; error: string };

export async function unlockLessonCards(lessonId: string): Promise<UnlockResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('unlock_lesson_cards', {
    p_lesson_id: lessonId,
  });

  if (error) return { ok: false, error: `Unlock RPC failed: ${error.message}` };

  // RPC returns jsonb { ok, ...counts } or { ok: false, error }.
  const result = data as {
    ok: boolean;
    cards_count?: number;
    students_count?: number;
    reviews_created?: number;
    error?: string;
  };

  if (!result.ok) {
    return { ok: false, error: result.error ?? 'Unlock failed.' };
  }

  revalidatePath(`/teacher/lessons/${lessonId}`);
  revalidatePath('/teacher/lessons');
  return {
    ok: true,
    cards_count: result.cards_count ?? 0,
    students_count: result.students_count ?? 0,
    reviews_created: result.reviews_created ?? 0,
  };
}

// Thin rename used by the inline-rename control on the card editor pages.
// Only changes the title; other fields are untouched.
export async function renameLesson(
  lessonId: string,
  title: string
): Promise<{ error: string | null }> {
  const trimmed = title.trim();
  if (!trimmed) return { error: 'Title cannot be empty.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('lessons')
    .update({ title: trimmed })
    .eq('id', lessonId);

  if (error) return { error: `Failed to rename lesson: ${error.message}` };

  revalidatePath(`/teacher/lessons/${lessonId}`);
  revalidatePath('/teacher/lessons');
  return { error: null };
}
