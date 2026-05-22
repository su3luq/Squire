'use client';

import { useState, useTransition } from 'react';
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
import { deleteStudent } from './actions';

export function DeleteStudentButton({
  studentId,
  fromClassId,
  studentName,
  activeTeamCount,
}: {
  studentId: string;
  fromClassId: string;
  studentName: string;
  activeTeamCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const r = await deleteStudent(studentId, fromClassId);
      if (r.error) {
        setError(r.error);
        return;
      }
      // redirects on success
    });
  }

  return (
    <div className="space-y-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger
          className={buttonVariants({ variant: 'destructive' })}
          disabled={isPending}
        >
          {isPending ? 'Deleting...' : 'Delete student'}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {studentName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the student account and all their data
              (XP history, reviews, quest acceptances, submissions, notes,
              assessments). Cannot be undone.
              {activeTeamCount > 0 && (
                <span className="mt-2 block font-medium text-amber-800">
                  Heads up: this student is on {activeTeamCount} active co-op{' '}
                  {activeTeamCount === 1 ? 'team' : 'teams'}. Those teams will
                  be left a member short — consider disbanding them first.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
              {isPending ? 'Deleting...' : 'Delete forever'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
