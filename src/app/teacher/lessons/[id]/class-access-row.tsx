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
import { unlockLessonForClass } from './actions';

// One row in the Class access table. Renders a single class with its current
// unlock state (unlocked + date, or locked) and an Unlock/Re-sync action.

export function ClassAccessRow({
  lessonId,
  classId,
  className,
  unlockedAt,
  cardCount,
  studentCount,
}: {
  lessonId: string;
  classId: string;
  className: string;
  unlockedAt: string | null;
  cardCount: number;
  studentCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyUnlocked = unlockedAt !== null;
  const disabled = cardCount === 0 || studentCount === 0;
  const buttonLabel = alreadyUnlocked ? 'Re-sync' : 'Unlock';
  const buttonVariant = alreadyUnlocked ? 'outline' : 'default';

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await unlockLessonForClass(lessonId, classId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{className}</p>
        {alreadyUnlocked ? (
          <p className="text-xs text-green-700">
            Unlocked {new Date(unlockedAt).toLocaleDateString()}
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            {studentCount === 0 ? 'No students yet' : 'Locked'}
          </p>
        )}
      </div>

      {disabled ? (
        <button
          disabled
          type="button"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
          title={
            cardCount === 0
              ? 'Add at least one card first'
              : 'No students enrolled in this class'
          }
        >
          {buttonLabel}
        </button>
      ) : (
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
            {isPending ? '...' : buttonLabel}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {alreadyUnlocked
                  ? `Re-sync ${className}?`
                  : `Unlock this lesson for ${className}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {alreadyUnlocked ? (
                  <>
                    Picks up any cards added since the last unlock and any students
                    who joined the class. Existing review progress is preserved.{' '}
                    {cardCount} {cardCount === 1 ? 'card' : 'cards'} · {studentCount}{' '}
                    {studentCount === 1 ? 'student' : 'students'}.
                  </>
                ) : (
                  <>
                    Makes the {cardCount} {cardCount === 1 ? 'card' : 'cards'} in
                    this lesson visible to {studentCount}{' '}
                    {studentCount === 1 ? 'student' : 'students'} in {className}. Other
                    classes are unaffected.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
                {isPending ? 'Working...' : buttonLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </li>
  );
}
