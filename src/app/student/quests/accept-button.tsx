'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  acceptSoloQuest,
  enrollCoopQuest,
  unenrollCoopQuest,
} from './actions';

type Variant = 'accept-solo' | 'enroll-coop' | 'unenroll-coop';

const LABELS: Record<
  Variant,
  { idle: string; pending: string; success?: string }
> = {
  'accept-solo': { idle: 'Accept quest', pending: 'Accepting...' },
  'enroll-coop': { idle: 'Enroll', pending: 'Enrolling...' },
  'unenroll-coop': { idle: 'Unenroll', pending: 'Unenrolling...' },
};

export function QuestActionButton({
  variant,
  questId,
  redirectToMyQuestsOnAccept = false,
  outline = false,
}: {
  variant: Variant;
  questId: string;
  redirectToMyQuestsOnAccept?: boolean;
  outline?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result =
        variant === 'accept-solo'
          ? await acceptSoloQuest(questId)
          : variant === 'enroll-coop'
            ? await enrollCoopQuest(questId)
            : await unenrollCoopQuest(questId);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (variant === 'accept-solo' && redirectToMyQuestsOnAccept) {
        router.push('/student/my-quests');
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        variant={
          outline || variant === 'unenroll-coop' ? 'outline' : 'default'
        }
        size="sm"
      >
        {isPending ? LABELS[variant].pending : LABELS[variant].idle}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
