'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import {
  questFormSchema,
  saigonLocalToIso,
  type QuestFormValues,
} from '@/lib/quest-schema';

type QuestUpdate = Database['public']['Tables']['quests']['Update'];

export async function updateQuest(
  questId: string,
  values: QuestFormValues
): Promise<{ error: string | null; id?: string }> {
  const parsed = questFormSchema.safeParse(values);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message ?? 'Validation failed.' };
  }
  const v = parsed.data;

  const supabase = await createClient();

  // Load current row to enforce lock rules + non-changing quest_type.
  const { data: current, error: loadErr } = await supabase
    .from('quests')
    .select('id, quest_type, max_team_size')
    .eq('id', questId)
    .single();
  if (loadErr || !current) {
    return { error: 'Quest not found.' };
  }
  if (current.quest_type !== v.quest_type) {
    return { error: "Quest type can't be changed after creation." };
  }

  // Check whether to lock max_team_size: any acceptance present locks it.
  let allowMaxTeamSizeChange = true;
  if (v.quest_type === 'coop') {
    const { count: acceptanceCount } = await supabase
      .from('quest_acceptances')
      .select('id', { count: 'exact', head: true })
      .eq('quest_id', questId);
    if ((acceptanceCount ?? 0) > 0) allowMaxTeamSizeChange = false;
  }

  const update: QuestUpdate = {
    title: v.title.trim(),
    description: v.description ?? '',
    xp_reward: v.xp_reward,
    word_limit_min: v.word_limit_min ?? null,
    expires_at: saigonLocalToIso(v.expires_at ?? null),
  };
  if (v.quest_type === 'coop' && allowMaxTeamSizeChange) {
    update.max_team_size = v.max_team_size ?? null;
  }

  const { error } = await supabase.from('quests').update(update).eq('id', questId);
  if (error) return { error: `Failed to update quest: ${error.message}` };

  revalidatePath(`/teacher/quests/${questId}`);
  revalidatePath('/teacher/quests');
  return { error: null, id: questId };
}

export async function closeQuest(
  questId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('quests')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', questId);
  if (error) return { error: `Failed to close quest: ${error.message}` };
  revalidatePath(`/teacher/quests/${questId}`);
  revalidatePath('/teacher/quests');
  return { error: null };
}

export async function reopenQuest(
  questId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('quests')
    .update({ closed_at: null })
    .eq('id', questId);
  if (error) return { error: `Failed to reopen quest: ${error.message}` };
  revalidatePath(`/teacher/quests/${questId}`);
  revalidatePath('/teacher/quests');
  return { error: null };
}

export async function deleteQuest(
  questId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  // Spec D: race-protected delete. Best-effort check for any pending submission
  // attached to this quest (via acceptance OR instance). The DB has ON DELETE
  // CASCADE on all child rows, so the actual delete is atomic.
  const { data: pending } = await supabase
    .from('quest_submissions')
    .select(
      `
        id,
        quest_acceptances:acceptance_id ( quest_id ),
        coop_quest_instances:instance_id ( quest_id )
      `
    )
    .eq('status', 'pending_review');

  const hasPending = (pending ?? []).some((row) => {
    const a = row.quest_acceptances as { quest_id: string } | null;
    const i = row.coop_quest_instances as { quest_id: string } | null;
    return a?.quest_id === questId || i?.quest_id === questId;
  });
  if (hasPending) {
    return {
      error: 'Review the pending submissions on this quest before deleting it.',
    };
  }

  const { error } = await supabase.from('quests').delete().eq('id', questId);
  if (error) return { error: `Failed to delete quest: ${error.message}` };

  revalidatePath('/teacher/quests');
  return { error: null };
}

export async function disbandInstance(
  instanceId: string
): Promise<{ error: string | null; members_released?: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('disband_coop_instance', {
    p_instance_id: instanceId,
  });
  if (error) return { error: `Failed to disband: ${error.message}` };
  const result = data as { ok: boolean; error?: string; members_released?: number };
  if (!result.ok) return { error: result.error ?? 'Disband failed.' };
  revalidatePath('/teacher/quests');
  return { error: null, members_released: result.members_released };
}

export async function runMatchmakingNow(
  questId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('run_matchmaking', {
    p_quest_id: questId,
  });
  if (error) return { error: `Matchmaking failed: ${error.message}` };
  const result = data as { ok: boolean; error?: string };
  if (!result.ok) return { error: result.error ?? 'Matchmaking failed.' };
  revalidatePath(`/teacher/quests/${questId}`);
  revalidatePath('/teacher/quests');
  return { error: null };
}
