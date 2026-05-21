'use client';

import { QuestForm } from '../quest-form';
import { updateQuest } from './actions';
import {
  isoToSaigonLocal,
  type QuestFormValues,
} from '@/lib/quest-schema';
import type { Database } from '@/lib/database.types';

type Quest = Database['public']['Tables']['quests']['Row'];
type ClassOption = { id: string; name: string };

export function EditQuestForm({
  quest,
  classes,
  lockCoopFields,
}: {
  quest: Quest;
  classes: ClassOption[];
  lockCoopFields: boolean;
}) {
  const initial: QuestFormValues = {
    quest_type: quest.quest_type === 'coop' ? 'coop' : 'solo',
    class_id: quest.class_id,
    title: quest.title,
    description: quest.description ?? '',
    xp_reward: quest.xp_reward,
    word_limit_min: quest.word_limit_min,
    max_team_size: quest.max_team_size,
    expires_at: isoToSaigonLocal(quest.expires_at),
  };

  return (
    <QuestForm
      classes={classes}
      initial={initial}
      mode="edit"
      action={updateQuest.bind(null, quest.id)}
      cancelHref={`/teacher/quests/${quest.id}`}
      lockCoopFields={lockCoopFields}
    />
  );
}
