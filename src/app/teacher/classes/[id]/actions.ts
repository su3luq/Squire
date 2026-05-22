'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type UpdateClassState = { error: string | null; success: boolean };

export async function updateClass(
  classId: string,
  _prev: UpdateClassState,
  formData: FormData
): Promise<UpdateClassState> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Class name is required.', success: false };
  if (name.length > 100)
    return { error: 'Name is too long (max 100 chars).', success: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from('classes')
    .update({ name })
    .eq('id', classId);
  if (error)
    return { error: `Failed to update class: ${error.message}`, success: false };

  revalidatePath(`/teacher/classes/${classId}`);
  revalidatePath('/teacher/classes');
  return { error: null, success: true };
}

export async function toggleRegistration(
  classId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: cls, error: loadErr } = await supabase
    .from('classes')
    .select('registration_open, archived_at')
    .eq('id', classId)
    .single();
  if (loadErr || !cls) return { error: 'Class not found.' };
  if (cls.archived_at)
    return { error: 'Cannot toggle registration on an archived class.' };

  const { error } = await supabase
    .from('classes')
    .update({ registration_open: !cls.registration_open })
    .eq('id', classId);
  if (error) return { error: `Failed to toggle: ${error.message}` };

  revalidatePath(`/teacher/classes/${classId}`);
  revalidatePath('/teacher/classes');
  return { error: null };
}

export async function archiveClass(
  classId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('classes')
    .update({
      archived_at: new Date().toISOString(),
      registration_open: false,
    })
    .eq('id', classId);
  if (error) return { error: `Failed to archive: ${error.message}` };
  revalidatePath(`/teacher/classes/${classId}`);
  revalidatePath('/teacher/classes');
  return { error: null };
}

export async function unarchiveClass(
  classId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('classes')
    .update({ archived_at: null })
    .eq('id', classId);
  if (error) return { error: `Failed to unarchive: ${error.message}` };
  revalidatePath(`/teacher/classes/${classId}`);
  revalidatePath('/teacher/classes');
  return { error: null };
}
