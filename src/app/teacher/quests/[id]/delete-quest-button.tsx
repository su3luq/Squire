'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteQuest(questId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push('/teacher/quests');
      router.refresh();
    });
  }

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
    <div className="space-y-2">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger
          className={buttonVariants({ variant: 'destructive' })}
          disabled={isPending}
        >
          {isPending ? 'Deleting...' : 'Delete quest'}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this quest?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the quest, all acceptances, instances, and
              submissions. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
              {isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
