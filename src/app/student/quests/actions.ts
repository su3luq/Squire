'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

type RpcResult = { ok: boolean; error?: string; acceptance_id?: string };

export async function acceptSoloQuest(
  questId: string
): Promise<{ error: string | null; acceptance_id?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('accept_solo_quest', {
    p_quest_id: questId,
  });
  if (error) return { error: `Server error: ${error.message}` };
  const result = data as RpcResult;
  if (!result.ok) return { error: result.error ?? 'Could not accept quest.' };
  revalidatePath('/student/quests');
  revalidatePath(`/student/quests/${questId}`);
  revalidatePath('/student/my-quests');
  return { error: null, acceptance_id: result.acceptance_id };
}

export async function enrollCoopQuest(
  questId: string
): Promise<{ error: string | null; acceptance_id?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('accept_coop_quest', {
    p_quest_id: questId,
  });
  if (error) return { error: `Server error: ${error.message}` };
  const result = data as RpcResult;
  if (!result.ok) return { error: result.error ?? 'Could not enroll.' };
  revalidatePath('/student/quests');
  revalidatePath(`/student/quests/${questId}`);
  revalidatePath('/student/my-quests');
  return { error: null, acceptance_id: result.acceptance_id };
}

export async function unenrollCoopQuest(
  questId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('unenroll_coop_quest', {
    p_quest_id: questId,
  });
  if (error) return { error: `Server error: ${error.message}` };
  const result = data as RpcResult;
  if (!result.ok) return { error: result.error ?? 'Could not unenroll.' };
  revalidatePath('/student/quests');
  revalidatePath(`/student/quests/${questId}`);
  revalidatePath('/student/my-quests');
  return { error: null };
}
