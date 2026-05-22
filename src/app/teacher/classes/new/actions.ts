'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type CreateClassState = { error: string | null };

export async function createClass(
  _prev: CreateClassState,
  formData: FormData
): Promise<CreateClassState> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Class name is required.' };
  if (name.length > 100) return { error: 'Name is too long (max 100 chars).' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('classes')
    .insert({ name, registration_open: false })
    .select('id')
    .single();
  if (error) return { error: `Failed to create class: ${error.message}` };

  revalidatePath('/teacher/classes');
  redirect(`/teacher/classes/${data.id}`);
}
