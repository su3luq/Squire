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

  if (!title) return { error: 'Title is required.', success: false };
  if (isNaN(lesson_number) || lesson_number < 1) {
    return { error: 'Lesson number must be a positive integer.', success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('lessons')
    .update({ title, lesson_number })
    .eq('id', lessonId);

  if (error) {
    if (error.code === '23505') {
      return {
        error: `Lesson number ${lesson_number} is already in use.`,
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

// Per-class unlock. Wires the unlock_lesson_cards(lesson_id, class_id) RPC
// from migration 014. Creates a lesson_unlocks row + initial card_reviews
// rows for that class's students. Idempotent — re-running picks up new
// students or new cards added since.
export type UnlockResult =
  | {
      ok: true;
      cards_count: number;
      students_count: number;
      reviews_created: number;
      cards_skipped_no_mcq: number;
      skipped_card_headlines: string[];
    }
  | { ok: false; error: string };

export async function unlockLessonForClass(
  lessonId: string,
  classId: string
): Promise<UnlockResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('unlock_lesson_cards', {
    p_lesson_id: lessonId,
    p_class_id: classId,
  });

  if (error) return { ok: false, error: `Unlock RPC failed: ${error.message}` };

  const result = data as {
    ok: boolean;
    cards_count?: number;
    students_count?: number;
    reviews_created?: number;
    cards_skipped_no_mcq?: number;
    skipped_card_headlines?: string[];
    error?: string;
  };

  if (!result.ok) return { ok: false, error: result.error ?? 'Unlock failed.' };

  revalidatePath(`/teacher/lessons/${lessonId}`);
  revalidatePath('/teacher/lessons');
  return {
    ok: true,
    cards_count: result.cards_count ?? 0,
    students_count: result.students_count ?? 0,
    reviews_created: result.reviews_created ?? 0,
    cards_skipped_no_mcq: result.cards_skipped_no_mcq ?? 0,
    skipped_card_headlines: result.skipped_card_headlines ?? [],
  };
}

// Thin rename used by the inline-rename control on the card editor pages.
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
