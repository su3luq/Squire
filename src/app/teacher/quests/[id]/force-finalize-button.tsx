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
import { forceFinalizeTeamSubmission } from './actions';

export function ForceFinalizeButton({
  instanceId,
  questId,
  pendingCount,
  totalCount,
}: {
  instanceId: string;
  questId: string;
  pendingCount: number;
  totalCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await forceFinalizeTeamSubmission(instanceId, questId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
          disabled={isPending}
        >
          {isPending ? 'Submitting…' : 'Force submit'}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force-submit this team?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCount} of {totalCount} members haven&apos;t marked their
              draft as submitted. Force-submitting will finalize the team&apos;s
              work now using whatever each member has written so far (empty
              drafts will be shown as placeholders). The submission then enters
              the review queue normally.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
              {isPending ? 'Submitting…' : 'Force submit'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
