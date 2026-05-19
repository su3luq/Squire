'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { cn } from '@/lib/utils';
import { rateCard } from './actions';
import type { RatingChoice } from '@/lib/fsrs';

type SessionCard = {
  cardReviewId: string;
  headline: string;
  body: string;
  lessonTitle: string;
  lessonNumber: number;
};

type RatingDef = {
  choice: RatingChoice;
  label: string;
  hint: string;
  className: string;
};

const RATINGS: RatingDef[] = [
  {
    choice: 'again',
    label: 'Again',
    hint: 'forgot',
    className: 'border-red-300 text-red-700 hover:bg-red-50',
  },
  {
    choice: 'hard',
    label: 'Hard',
    hint: 'difficult',
    className: 'border-amber-300 text-amber-800 hover:bg-amber-50',
  },
  {
    choice: 'good',
    label: 'Good',
    hint: 'remembered',
    className: 'border-blue-300 text-blue-700 hover:bg-blue-50',
  },
  {
    choice: 'easy',
    label: 'Easy',
    hint: 'trivial',
    className: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
  },
];

export function ReviewSession({ cards }: { cards: SessionCard[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const total = cards.length;
  const current = cards[index];
  const progressValue = total === 0 ? 0 : (index / total) * 100;

  function handleRate(choice: RatingChoice) {
    if (!current || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await rateCard(current.cardReviewId, choice);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (index + 1 >= total) {
        setDone(true);
      } else {
        setIndex(index + 1);
      }
    });
  }

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <h2 className="text-2xl font-bold text-slate-900">Review complete</h2>
          <p className="text-sm text-slate-600">
            You rated {total} {total === 1 ? 'card' : 'cards'}. Come back
            tomorrow for the next batch.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Link
              href="/student"
              className={buttonVariants({ variant: 'outline' })}
            >
              Home
            </Link>
            <button
              type="button"
              onClick={() => router.refresh()}
              className={buttonVariants()}
            >
              Check for more
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!current) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Progress value={progressValue} />
        <p className="text-xs text-slate-500">
          Card {index + 1} of {total}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Lesson {current.lessonNumber} · {current.lessonTitle}
          </p>
          <h2 className="text-2xl font-bold text-slate-900">{current.headline}</h2>
          <div className="border-t border-slate-200 pt-4">
            <MarkdownRenderer
              source={current.body}
              emptyPlaceholder="This card has no body."
            />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {RATINGS.map((r) => (
          <Button
            key={r.choice}
            type="button"
            variant="outline"
            onClick={() => handleRate(r.choice)}
            disabled={isPending}
            className={cn('flex h-auto flex-col gap-0.5 py-3', r.className)}
          >
            <span className="text-base font-semibold">{r.label}</span>
            <span className="text-xs font-normal opacity-80">{r.hint}</span>
          </Button>
        ))}
      </div>

      <p className="text-center text-xs text-slate-500">
        Rate honestly — the schedule adapts to how well you actually know each
        card.
      </p>
    </div>
  );
}
