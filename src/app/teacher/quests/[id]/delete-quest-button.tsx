'use client';

import { useRouter } from 'next/navigation';
import { ConfirmButton } from '@/components/confirm-button';
import { buttonVariants } from '@/components/ui/button';
import { deleteQuest } from './actions';

export function DeleteQuestButton({
  questId,
  hasPending,
}: {
  questId: string;
  hasPending: boolean;
}) {
  const router = useRouter();

  if (hasPending) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          disabled
          className={buttonVariants({ variant: 'destructive' })}
        >
          Delete quest
        </button>
        <p className="text-xs text-amber-800">
          Review the pending submissions on this quest before deleting it.
        </p>
      </div>
    );
  }

  return (
    <ConfirmButton
      label="Delete quest"
      pendingLabel="Deleting…"
      title="Delete this quest?"
      description="This permanently removes the quest, all acceptances, instances, and submissions. This cannot be undone."
      action={() => deleteQuest(questId)}
      onSuccess={() => {
        router.push('/teacher/quests');
        router.refresh();
      }}
    />
  );
}
