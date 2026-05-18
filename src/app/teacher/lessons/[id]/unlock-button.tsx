'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
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
import { unlockLessonCards, type UnlockResult } from './actions';

type UnlockSuccess = Extract<UnlockResult, { ok: true }>;

export function UnlockLessonButton({
  lessonId,
  cardCount,
  studentCount,
  alreadyUnlocked,
}: {
  lessonId: string;
  cardCount: number;
  studentCount: number;
  alreadyUnlocked: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<UnlockSuccess | null>(null);

  const disabled = cardCount === 0 || studentCount === 0;
  const label = alreadyUnlocked ? 'Re-sync class reviews' : 'Unlock for class';
  const buttonVariant = alreadyUnlocked ? 'outline' : 'default';

  function handleConfirm() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await unlockLessonCards(lessonId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(result);
      setOpen(false);
      router.refresh();
    });
  }

  if (disabled) {
    return (
      <div className="space-y-1">
        <button
          disabled
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
          type="button"
        >
          {label}
        </button>
        <p className="text-xs text-slate-500">
          {cardCount === 0
            ? 'Add at least one card before unlocking.'
            : 'No students enrolled in this class yet.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setError(null);
        }}
      >
        <AlertDialogTrigger
          className={buttonVariants({ variant: buttonVariant, size: 'sm' })}
          disabled={isPending}
        >
          {isPending ? 'Unlocking...' : label}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {alreadyUnlocked ? 'Re-sync class reviews?' : 'Unlock cards for class?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {alreadyUnlocked ? (
                <>
                  Picks up any cards or students added since the last unlock and
                  creates the missing review rows. Existing review state is
                  preserved. Affects {cardCount}{' '}
                  {cardCount === 1 ? 'card' : 'cards'} and {studentCount}{' '}
                  {studentCount === 1 ? 'student' : 'students'}.
                </>
              ) : (
                <>
                  Makes the {cardCount} {cardCount === 1 ? 'card' : 'cards'} in
                  this lesson visible to {studentCount}{' '}
                  {studentCount === 1 ? 'student' : 'students'} for review. Each
                  student gets an initial FSRS review row per card. This action is
                  idempotent — safe to re-run later.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
              {isPending ? 'Unlocking...' : alreadyUnlocked ? 'Re-sync' : 'Unlock'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {success && (
        <p className="text-sm text-green-700">
          {success.reviews_created === 0
            ? 'Already in sync. No new review rows needed.'
            : `Created ${success.reviews_created} review ${
                success.reviews_created === 1 ? 'row' : 'rows'
              }.`}
        </p>
      )}
      {error && !open && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
