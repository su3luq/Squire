'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { acceptSoloQuest, enrollCoopQuest } from './actions';

type Variant = 'accept-solo' | 'enroll-coop';

const LABELS: Record<Variant, { idle: string; pending: string; toast: string }> = {
  'accept-solo': {
    idle: 'Accept quest',
    pending: 'Accepting...',
    toast: 'Quest accepted',
  },
  'enroll-coop': {
    idle: 'Enroll',
    pending: 'Enrolling...',
    toast: 'Enrolled — waiting for matchmaking',
  },
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
          : await enrollCoopQuest(questId);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(LABELS[variant].toast);
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
        variant={outline ? 'outline' : 'default'}
        size="sm"
      >
        {isPending ? LABELS[variant].pending : LABELS[variant].idle}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
