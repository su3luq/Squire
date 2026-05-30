'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { Check, Sparkles, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { scheduleNext, type DbCardReview } from '@/lib/fsrs';
import { NextReviewCountdown } from '@/components/next-review-countdown';
import type { Database } from '@/lib/database.types';

type Choice = 'a' | 'b' | 'c' | 'd';
type DbState = Database['public']['Enums']['card_review_state'];

export type SessionCard = {
  card_review_id: string;
  card_id: string;
  headline: string;
  body: string;
  lesson_title: string;
  lesson_number: number;
  fsrs: {
    state: DbState;
    stability: number;
    difficulty: number;
    due_at: string;
    last_reviewed_at: string | null;
    review_count: number;
  };
  mcqs: Array<{
    id: string;
    question_text: string;
    choice_a: string;
    choice_b: string;
    choice_c: string;
    choice_d: string;
  }>;
};

type Answer = {
  selected: Choice;
  is_correct: boolean;
  correct_choice: Choice;
  xp_awarded: number;
};

type CardProgress = {
  answers: Answer[];
  completed: boolean;
  nextDueAt: string | null;
  nextState: DbState | null;
};

const CHOICES: Choice[] = ['a', 'b', 'c', 'd'];

export function ReviewSession({
  cards,
  onExit,
}: {
  cards: SessionCard[];
  /** When provided, the summary screen returns here (in-place merge on the
   *  Cards page) instead of linking Home / refreshing the standalone page. */
  onExit?: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [cardIndex, setCardIndex] = useState(0);
  const [mcqStepIndex, setMcqStepIndex] = useState(0);
  const [progress, setProgress] = useState<Record<string, CardProgress>>(() =>
    Object.fromEntries(
      cards.map((c) => [
        c.card_review_id,
        { answers: [], completed: false, nextDueAt: null, nextState: null },
      ]),
    ),
  );
  const [pendingChoice, setPendingChoice] = useState<Choice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startSubmit] = useTransition();

  const totalCards = cards.length;
  const sessionDone = cardIndex >= totalCards;
  const currentCard: SessionCard | undefined = cards[cardIndex];
  const currentProgress = currentCard ? progress[currentCard.card_review_id] : undefined;

  const allAnswers: Answer[] = sessionDone
    ? cards.flatMap((c) => progress[c.card_review_id]?.answers ?? [])
    : [];
  const totalXp = allAnswers.reduce((sum, a) => sum + a.xp_awarded, 0);
  const totalCorrect = allAnswers.filter((a) => a.is_correct).length;
  const totalAnswered = allAnswers.length;

  async function completeCard(card: SessionCard, finalAnswers: Answer[]) {
    try {
      const allCorrect = finalAnswers.every((a) => a.is_correct);
      const choice = allCorrect ? 'good' : 'again';

      const row: DbCardReview = {
        difficulty: card.fsrs.difficulty,
        stability: card.fsrs.stability,
        state: card.fsrs.state,
        due_at: card.fsrs.due_at,
        last_reviewed_at: card.fsrs.last_reviewed_at,
        review_count: card.fsrs.review_count,
      };

      const update = scheduleNext(row, choice);

      const { error: updateError } = await supabase
        .from('card_reviews')
        .update({
          difficulty: update.difficulty,
          stability: update.stability,
          due_at: update.due_at,
          last_reviewed_at: update.last_reviewed_at,
          review_count: update.review_count,
          state: update.state,
        })
        .eq('id', card.card_review_id);

      if (updateError) {
        setError(`Failed to save schedule: ${updateError.message}`);
        return;
      }

      setProgress((prev) => ({
        ...prev,
        [card.card_review_id]: {
          ...prev[card.card_review_id],
          completed: true,
          nextDueAt: update.due_at,
          nextState: update.state,
        },
      }));
    } catch (err) {
      setError(
        `Schedule update threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  function submitAnswer(choice: Choice) {
    if (!currentCard || !currentProgress) return;
    const mcq = currentCard.mcqs[mcqStepIndex];
    if (!mcq) return;

    setError(null);
    setPendingChoice(choice);

    startSubmit(async () => {
      const { data, error: rpcError } = await supabase.rpc('submit_mcq_answer', {
        p_quiz_question_id: mcq.id,
        p_selected_choice: choice,
      });

      if (rpcError) {
        setError(`Failed to submit: ${rpcError.message}`);
        setPendingChoice(null);
        return;
      }

      const result = data as {
        ok: boolean;
        is_correct?: boolean;
        correct_choice?: Choice;
        xp_awarded?: number;
        error?: string;
      };

      if (!result.ok) {
        setError(result.error ?? 'Submit failed.');
        setPendingChoice(null);
        return;
      }

      const answer: Answer = {
        selected: choice,
        is_correct: result.is_correct ?? false,
        correct_choice: (result.correct_choice ?? choice) as Choice,
        xp_awarded: result.xp_awarded ?? 0,
      };

      if (answer.is_correct && answer.xp_awarded > 0) {
        toast(`+${answer.xp_awarded} XP`, {
          icon: <Sparkles className="h-4 w-4" aria-hidden />,
          duration: 1500,
          // Bronze celebratory styling — overrides Sonner default to
          // tint the toast with the brand accent. Keeps the win feeling
          // distinct from the neutral popover-toned notification toasts.
          style: {
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
            borderColor: 'transparent',
          },
        });
      }

      const newAnswers = [...currentProgress.answers, answer];

      setProgress((prev) => ({
        ...prev,
        [currentCard.card_review_id]: {
          ...prev[currentCard.card_review_id],
          answers: newAnswers,
        },
      }));
      setPendingChoice(null);

      if (newAnswers.length === currentCard.mcqs.length) {
        await completeCard(currentCard, newAnswers);
      }
    });
  }

  function advanceCard() {
    setCardIndex((i) => i + 1);
    setMcqStepIndex(0);
    setPendingChoice(null);
  }

  // Auto-advance to the next question 1 second after an answer is recorded.
  const currentStepAnswer = currentProgress?.answers[mcqStepIndex];
  useEffect(() => {
    if (!currentStepAnswer) return;
    const timer = setTimeout(() => {
      setMcqStepIndex((i) => i + 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [currentStepAnswer, mcqStepIndex]);

  // -- RENDER --

  if (sessionDone) {
    const accuracy =
      totalAnswered === 0 ? 0 : Math.round((totalCorrect / totalAnswered) * 100);
    const sessionNextDueAt = cards
      .map((c) => progress[c.card_review_id]?.nextDueAt)
      .filter((d): d is string => !!d)
      .sort()[0];
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-6 py-12 text-center">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">
              Review complete
            </h2>
            <p className="text-sm text-muted-foreground">
              Nicely done. Here&apos;s how the session went.
            </p>
          </div>
          <div className="grid w-full max-w-md grid-cols-3 gap-4">
            <SummaryStat label={totalCards === 1 ? 'card' : 'cards'} value={totalCards} />
            <SummaryStat label={`${totalCorrect}/${totalAnswered} correct`} value={`${accuracy}%`} />
            <SummaryStat label="XP earned" value={`+${totalXp}`} accent />
          </div>
          {sessionNextDueAt ? (
            <p className="text-xs text-muted-foreground">
              Next card <NextReviewCountdown dueAt={sessionNextDueAt} />
            </p>
          ) : null}
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {onExit ? (
              <button
                type="button"
                onClick={onExit}
                className={buttonVariants()}
              >
                Back to cards
              </button>
            ) : (
              <>
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
                  Continue
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!currentCard || !currentProgress) return null;

  const allMcqsAnswered = mcqStepIndex >= currentCard.mcqs.length;
  const currentMcq = !allMcqsAnswered ? currentCard.mcqs[mcqStepIndex] : undefined;
  const currentAnswer: Answer | undefined = currentProgress.answers[mcqStepIndex];

  const progressValue = (cardIndex / totalCards) * 100;

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <Progress value={progressValue} />
        <p className="text-xs text-muted-foreground">
          Card {cardIndex + 1} of {totalCards}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Lesson {currentCard.lesson_number} · {currentCard.lesson_title}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">
            {currentCard.headline}
          </h2>
          {!allMcqsAnswered ? (
            <p className="text-xs text-muted-foreground">
              Question {mcqStepIndex + 1} of {currentCard.mcqs.length}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {!allMcqsAnswered && currentMcq ? (
        <McqStep
          mcq={currentMcq}
          pendingChoice={pendingChoice}
          answer={currentAnswer ?? null}
          onSubmit={submitAnswer}
        />
      ) : (
        <CardWrapUp
          card={currentCard}
          answers={currentProgress.answers}
          completed={currentProgress.completed}
          nextDueAt={currentProgress.nextDueAt}
          nextState={currentProgress.nextState}
          onNextCard={advanceCard}
        />
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div>
      <p
        className={cn(
          'text-2xl font-semibold tracking-tight tabular-nums',
          accent ? 'text-primary' : '',
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function McqStep({
  mcq,
  pendingChoice,
  answer,
  onSubmit,
}: {
  mcq: SessionCard['mcqs'][number];
  pendingChoice: Choice | null;
  answer: Answer | null;
  onSubmit: (choice: Choice) => void;
}) {
  const isAnswered = answer !== null;
  const isPending = pendingChoice !== null && answer === null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <p className="text-base font-medium">{mcq.question_text}</p>

        <div className="grid grid-cols-1 gap-2">
          {CHOICES.map((letter) => {
            const isSelected = answer?.selected === letter;
            const isPendingThis = pendingChoice === letter && answer === null;

            // We never reveal the correct answer through button styling — the
            // student stays in the dark about which choice was right, so
            // they're forced to think the next time the card surfaces.
            let stateClasses = '';
            let icon: React.ReactNode = null;

            if (isAnswered && isSelected) {
              if (answer.is_correct) {
                stateClasses =
                  'border-primary/50 bg-primary/10 text-primary';
                icon = <Check className="h-4 w-4 text-primary" />;
              } else {
                stateClasses =
                  'border-destructive/40 bg-destructive/5 text-destructive';
                icon = <X className="h-4 w-4 text-destructive" />;
              }
            } else if (isAnswered && !isSelected) {
              stateClasses = 'border-border bg-muted/50 text-muted-foreground opacity-70';
            } else if (isPendingThis) {
              stateClasses = 'border-border bg-muted text-foreground';
              icon = <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
            } else if (isPending) {
              stateClasses = 'border-border bg-card text-muted-foreground opacity-60';
            }

            return (
              <button
                key={letter}
                type="button"
                onClick={() => onSubmit(letter)}
                disabled={isAnswered || isPending}
                className={cn(
                  'flex items-center gap-3 rounded-md border bg-card px-4 py-3 text-left text-sm transition-colors',
                  'disabled:cursor-default',
                  !isAnswered && !isPending &&
                    'border-border text-foreground hover:border-primary/40 hover:bg-muted/40',
                  stateClasses,
                )}
              >
                <span className="font-semibold text-muted-foreground">
                  {letter.toUpperCase()}
                </span>
                <span className="flex-1">
                  {mcq[`choice_${letter}` as const]}
                </span>
                {icon}
              </button>
            );
          })}
        </div>

        {isAnswered && answer ? (
          <p
            className={cn(
              'border-t border-border pt-3 text-sm font-medium',
              answer.is_correct ? 'text-primary' : 'text-destructive',
            )}
          >
            {answer.is_correct ? `Correct — +${answer.xp_awarded} XP` : 'Wrong'}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CardWrapUp({
  card,
  answers,
  completed,
  nextDueAt,
  nextState,
  onNextCard,
}: {
  card: SessionCard;
  answers: Answer[];
  completed: boolean;
  nextDueAt: string | null;
  nextState: DbState | null;
  onNextCard: () => void;
}) {
  const correctCount = answers.filter((a) => a.is_correct).length;
  const total = answers.length;
  const allCorrect = correctCount === total;

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
            <p className="text-sm font-medium">
              {correctCount} of {total} correct
            </p>
            <p
              className={cn(
                'text-xs font-medium',
                allCorrect ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {allCorrect ? 'Rating: Good' : 'Rating: Again'}
            </p>
          </div>
          {completed && nextDueAt ? (
            <p className="text-xs text-muted-foreground">
              Next review for this card: {formatRelativeDate(nextDueAt)}
              {nextState ? ` · state: ${nextState}` : null}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating schedule…
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What you should remember
          </p>
          <MarkdownRenderer
            source={card.body}
            emptyPlaceholder="This card has no body."
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="button" onClick={onNextCard} disabled={!completed}>
          {completed ? 'Next card' : 'Saving…'}
        </Button>
      </div>
    </>
  );
}

function formatRelativeDate(iso: string): string {
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = target - now;
  if (diffMs <= 0) return 'soon';
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hours / 24);
  return `in ${days} ${days === 1 ? 'day' : 'days'}`;
}
