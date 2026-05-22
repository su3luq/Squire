'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// ---- Assessment ----

export type AssessmentState = { error: string | null; success: boolean };

export async function saveAssessment(
  studentId: string,
  _prev: AssessmentState,
  formData: FormData
): Promise<AssessmentState> {
  const pearsonRaw = String(formData.get('pearson') ?? '').trim();
  const cefr = String(formData.get('cefr') ?? '').trim() || null;

  let pearson: number | null = null;
  if (pearsonRaw) {
    const n = Number(pearsonRaw);
    if (Number.isNaN(n) || n < 10 || n > 90) {
      return { error: 'Pearson must be between 10 and 90.', success: false };
    }
    pearson = Math.round(n);
  }

  const supabase = await createClient();
  // Upsert by student_id (unique).
  const { error } = await supabase
    .from('student_assessments')
    .upsert(
      {
        student_id: studentId,
        english_proficiency_pearson: pearson,
        english_proficiency_cefr: cefr,
      },
      { onConflict: 'student_id' }
    );
  if (error) return { error: `Failed to save: ${error.message}`, success: false };

  revalidatePath(`/teacher/classes/*/students/${studentId}`);
  return { error: null, success: true };
}

// ---- Notes ----

export async function addNote(
  studentId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  const note = String(formData.get('note') ?? '').trim();
  if (!note) return { error: 'Note text is required.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('teacher_notes')
    .insert({ student_id: studentId, note });
  if (error) return { error: `Failed to add note: ${error.message}` };
  revalidatePath(`/teacher/classes/*/students/${studentId}`);
  return { error: null };
}

export async function updateNote(
  noteId: string,
  text: string
): Promise<{ error: string | null }> {
  const trimmed = text.trim();
  if (!trimmed) return { error: 'Note text is required.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('teacher_notes')
    .update({ note: trimmed })
    .eq('id', noteId);
  if (error) return { error: `Failed to update note: ${error.message}` };
  revalidatePath('/teacher/classes');
  return { error: null };
}

export async function deleteNote(
  noteId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from('teacher_notes').delete().eq('id', noteId);
  if (error) return { error: `Failed to delete note: ${error.message}` };
  revalidatePath('/teacher/classes');
  return { error: null };
}

// ---- Transfer ----

export async function transferStudent(
  studentId: string,
  toClassId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('transfer_student', {
    p_student_id: studentId,
    p_to_class_id: toClassId,
  });
  if (error) return { error: `Server error: ${error.message}` };
  const result = data as { ok: boolean; error?: string };
  if (!result.ok) return { error: result.error ?? 'Transfer failed.' };
  revalidatePath('/teacher/classes');
  redirect(`/teacher/classes/${toClassId}/students/${studentId}`);
}

// ---- Delete student ----

export async function deleteStudent(
  studentId: string,
  fromClassId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('delete_student', {
    p_student_id: studentId,
  });
  if (error) return { error: `Server error: ${error.message}` };
  const result = data as { ok: boolean; error?: string };
  if (!result.ok) return { error: result.error ?? 'Delete failed.' };
  revalidatePath('/teacher/classes');
  revalidatePath(`/teacher/classes/${fromClassId}`);
  redirect(`/teacher/classes/${fromClassId}`);
}
