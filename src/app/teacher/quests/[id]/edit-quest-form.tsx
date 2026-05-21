'use client';

import { QuestForm } from '../quest-form';
import { updateQuest } from './actions';
import {
  isoToSaigonLocal,
  type QuestFormValues,
} from '@/lib/quest-schema';
import type { Database } from '@/lib/database.types';

type Quest = Database['public']['Tables']['quests']['Row'];

export function EditQuestForm({
  quest,
  lockCoopFields,
}: {
  quest: Quest;
  lockCoopFields: boolean;
}) {
  const initial: QuestFormValues = {
    quest_type: quest.quest_type === 'coop' ? 'coop' : 'solo',
    title: quest.title,
    description: quest.description ?? '',
    xp_reward: quest.xp_reward,
    word_limit_min: quest.word_limit_min,
    max_team_size: quest.max_team_size,
    expires_at: isoToSaigonLocal(quest.expires_at),
  };

  return (
    <QuestForm
      initial={initial}
      mode="edit"
      action={updateQuest.bind(null, quest.id)}
      cancelHref={`/teacher/quests/${quest.id}`}
      lockCoopFields={lockCoopFields}
    />
  );
}
