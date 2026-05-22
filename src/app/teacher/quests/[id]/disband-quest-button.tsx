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
import { disbandQuest } from './actions';

export function DisbandQuestButton({
  questId,
  affectedStudents,
  affectedTeams,
}: {
  questId: string;
  affectedStudents: number;
  affectedTeams: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const nothingToDo = affectedStudents === 0 && affectedTeams === 0;

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const r = await disbandQuest(questId);
      if (r.error) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (nothingToDo) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          disabled
          className={buttonVariants({ variant: 'outline' })}
        >
          Disband quest
        </button>
        <p className="text-xs text-slate-500">
          Nothing to disband — no in-flight work on this quest.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger
          className={buttonVariants({ variant: 'outline' })}
          disabled={isPending}
        >
          {isPending ? 'Disbanding...' : 'Disband quest'}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disband this quest?</AlertDialogTitle>
            <AlertDialogDescription>
              This cancels all ongoing work on the quest:{' '}
              <span className="font-medium">
                {affectedStudents}{' '}
                {affectedStudents === 1 ? 'student' : 'students'}
              </span>{' '}
              will lose their active/enrolled status
              {affectedTeams > 0 && (
                <>
                  {' '}
                  and{' '}
                  <span className="font-medium">
                    {affectedTeams} {affectedTeams === 1 ? 'team' : 'teams'}
                  </span>{' '}
                  will be disbanded
                </>
              )}
              . Already-passed work is preserved. Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
              {isPending ? 'Disbanding...' : 'Disband everything'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-slate-500">
        Cancels active/enrolled/submitted work. Doesn&apos;t close the quest —
        new accepts/enrollments still possible unless you also click Close.
      </p>
    </div>
  );
}
