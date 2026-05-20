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
import { unlockLessonForClass, type UnlockResult } from './actions';

type UnlockSuccess = Extract<UnlockResult, { ok: true }>;

// One row in the Class access table. Renders a single class with its current
// unlock state (unlocked + date, or locked) and an Unlock/Re-sync action.
// When the unlock RPC skips cards without MCQs, the row surfaces the skipped
// headlines so the teacher can fix them and re-sync.

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
  const [lastResult, setLastResult] = useState<UnlockSuccess | null>(null);

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
      setLastResult(result);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <li className="px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
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
                      Cards without quiz questions are skipped.
                    </>
                  ) : (
                    <>
                      Makes the reviewable cards in this lesson visible to {studentCount}{' '}
                      {studentCount === 1 ? 'student' : 'students'} in {className}. Cards
                      without quiz questions are skipped — they need at least one MCQ to
                      enter the review system. Other classes are unaffected.
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
      </div>

      {/* Persistent result feedback below the row after a successful unlock. */}
      {lastResult && (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-slate-600">
            Reviewable cards: {lastResult.cards_count} ·{' '}
            {lastResult.reviews_created === 0
              ? 'no new review rows needed'
              : `${lastResult.reviews_created} new review ${
                  lastResult.reviews_created === 1 ? 'row' : 'rows'
                } created`}
          </p>
          {lastResult.cards_skipped_no_mcq > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              <p className="font-medium">
                {lastResult.cards_skipped_no_mcq}{' '}
                {lastResult.cards_skipped_no_mcq === 1 ? 'card was' : 'cards were'}{' '}
                skipped (no quiz questions):
              </p>
              <ul className="mt-1 list-disc pl-4">
                {lastResult.skipped_card_headlines.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              <p className="mt-1 text-amber-700">
                Add at least one MCQ to each, then re-sync to include them.
              </p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
