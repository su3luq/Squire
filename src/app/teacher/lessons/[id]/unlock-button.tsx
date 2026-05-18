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
  const label = alreadyUnlocked ? 'Re-sync class' : 'Unlock for class';
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
              {alreadyUnlocked ? 'Re-sync this lesson?' : 'Unlock this lesson for the class?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {alreadyUnlocked ? (
                <>
                  Picks up any cards added since the last unlock and any students
                  who joined the class. Existing review progress is preserved.
                  Lesson has {cardCount}{' '}
                  {cardCount === 1 ? 'card' : 'cards'}; class has {studentCount}{' '}
                  {studentCount === 1 ? 'student' : 'students'}.
                </>
              ) : (
                <>
                  Makes the {cardCount} {cardCount === 1 ? 'card' : 'cards'} in
                  this lesson visible to the whole class ({studentCount}{' '}
                  {studentCount === 1 ? 'student' : 'students'}). They can start
                  reviewing immediately. Safe to re-run later — re-syncs pick up
                  new cards or new students automatically.
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
            ? 'Class already in sync.'
            : alreadyUnlocked
              ? 'Class re-synced.'
              : 'Class unlocked.'}
        </p>
      )}
      {error && !open && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
