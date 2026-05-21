'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  questFormSchema,
  saigonLocalToIso,
  type QuestFormValues,
} from '@/lib/quest-schema';

export async function createQuest(
  values: QuestFormValues
): Promise<{ error: string | null; id?: string }> {
  const parsed = questFormSchema.safeParse(values);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message ?? 'Validation failed.' };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('quests')
    .insert({
      class_id: v.class_id,
      title: v.title.trim(),
      description: v.description ?? '',
      quest_type: v.quest_type,
      xp_reward: v.xp_reward,
      word_limit_min: v.word_limit_min ?? null,
      max_team_size: v.quest_type === 'coop' ? (v.max_team_size ?? null) : null,
      expires_at: saigonLocalToIso(v.expires_at ?? null),
    })
    .select('id')
    .single();

  if (error) return { error: `Failed to create quest: ${error.message}` };

  revalidatePath('/teacher/quests');
  return { error: null, id: data.id };
}
