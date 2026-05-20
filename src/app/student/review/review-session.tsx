'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { scheduleNext, type DbCardReview } from '@/lib/fsrs';
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
  // answers[i] is the result for mcqs[i]
  answers: Answer[];
  // True after FSRS state has been written back for this card.
  completed: boolean;
  nextDueAt: string | null;
  nextState: DbState | null;
};

const CHOICES: Choice[] = ['a', 'b', 'c', 'd'];

export function ReviewSession({ cards }: { cards: SessionCard[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [cardIndex, setCardIndex] = useState(0);
  const [mcqStepIndex, setMcqStepIndex] = useState(0);
  const [progress, setProgress] = useState<Record<string, CardProgress>>(() =>
    Object.fromEntries(
      cards.map((c) => [
        c.card_review_id,
        { answers: [], completed: false, nextDueAt: null, nextState: null },
      ])
    )
  );
  // Choice the student just clicked, before the RPC returns. Drives the
  // pending visual state on the MCQ button.
  const [pendingChoice, setPendingChoice] = useState<Choice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startSubmit] = useTransition();

  const totalCards = cards.length;
  const sessionDone = cardIndex >= totalCards;
  const currentCard: SessionCard | undefined = cards[cardIndex];
  const currentProgress = currentCard ? progress[currentCard.card_review_id] : undefined;

  // ---- Session-level derived totals (for summary screen) ----
  const allAnswers: Answer[] = sessionDone
    ? cards.flatMap((c) => progress[c.card_review_id]?.answers ?? [])
    : [];
  const totalXp = allAnswers.reduce((sum, a) => sum + a.xp_awarded, 0);
  const totalCorrect = allAnswers.filter((a) => a.is_correct).length;
  const totalAnswered = allAnswers.length;

  // ---- Compute & write FSRS state for the card. Returns when done. ----
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
        `Schedule update threw: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // ---- Submit one MCQ answer ----
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

      const newAnswers = [...currentProgress.answers, answer];

      setProgress((prev) => ({
        ...prev,
        [currentCard.card_review_id]: {
          ...prev[currentCard.card_review_id],
          answers: newAnswers,
        },
      }));
      setPendingChoice(null);

      // If this was the last MCQ for the card, kick off the FSRS state write
      // immediately so the wrap-up has it ready (or close to ready) by the
      // time the student clicks Continue.
      if (newAnswers.length === currentCard.mcqs.length) {
        await completeCard(currentCard, newAnswers);
      }
    });
  }

  function advanceMcq() {
    setMcqStepIndex((i) => i + 1);
  }

  function advanceCard() {
    setCardIndex((i) => i + 1);
    setMcqStepIndex(0);
    setPendingChoice(null);
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (sessionDone) {
    const accuracy =
      totalAnswered === 0 ? 0 : Math.round((totalCorrect / totalAnswered) * 100);
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <h2 className="text-2xl font-bold text-slate-900">Review complete</h2>
          <div className="grid grid-cols-3 gap-6 text-sm">
            <div>
              <p className="text-2xl font-bold text-slate-900">{totalCards}</p>
              <p className="text-xs text-slate-500">
                {totalCards === 1 ? 'card' : 'cards'} reviewed
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{accuracy}%</p>
              <p className="text-xs text-slate-500">
                {totalCorrect}/{totalAnswered} correct
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700">+{totalXp}</p>
              <p className="text-xs text-slate-500">XP earned</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Link href="/student" className={buttonVariants({ variant: 'outline' })}>
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

  if (!currentCard || !currentProgress) return null;

  const allMcqsAnswered = mcqStepIndex >= currentCard.mcqs.length;
  const currentMcq = !allMcqsAnswered ? currentCard.mcqs[mcqStepIndex] : undefined;
  const currentAnswer: Answer | undefined = currentProgress.answers[mcqStepIndex];

  const progressValue = (cardIndex / totalCards) * 100;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Progress value={progressValue} />
        <p className="text-xs text-slate-500">
          Card {cardIndex + 1} of {totalCards}
        </p>
      </div>

      {/* Card header — headline only, body hidden until all MCQs answered. */}
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Lesson {currentCard.lesson_number} · {currentCard.lesson_title}
          </p>
          <h2 className="text-2xl font-bold text-slate-900">{currentCard.headline}</h2>
          {!allMcqsAnswered && (
            <p className="text-xs text-slate-500">
              Question {mcqStepIndex + 1} of {currentCard.mcqs.length}
            </p>
          )}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!allMcqsAnswered && currentMcq ? (
        <McqStep
          mcq={currentMcq}
          pendingChoice={pendingChoice}
          answer={currentAnswer ?? null}
          onSubmit={submitAnswer}
          onContinue={advanceMcq}
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

// ============================================================================
// McqStep — buttons + inline feedback all in one card
// ============================================================================

function McqStep({
  mcq,
  pendingChoice,
  answer,
  onSubmit,
  onContinue,
}: {
  mcq: SessionCard['mcqs'][number];
  pendingChoice: Choice | null;
  answer: Answer | null;
  onSubmit: (choice: Choice) => void;
  onContinue: () => void;
}) {
  const isAnswered = answer !== null;
  const isPending = pendingChoice !== null && answer === null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <p className="text-base font-medium text-slate-900">{mcq.question_text}</p>

        <div className="grid grid-cols-1 gap-2">
          {CHOICES.map((letter) => {
            const isSelected = answer?.selected === letter;
            const isCorrect = answer?.correct_choice === letter;
            const isPendingThis = pendingChoice === letter && answer === null;

            // Style by phase. Order matters: answered > pending > idle.
            let styleClasses = '';
            let icon: React.ReactNode = null;

            if (isAnswered) {
              if (isCorrect && isSelected) {
                styleClasses = 'border-green-400 bg-green-50 text-green-900';
                icon = <Check className="size-4 text-green-700" />;
              } else if (isCorrect && !isSelected) {
                // Reveal correct answer when user got it wrong
                styleClasses = 'border-green-400 bg-green-50/60 text-green-900';
                icon = <Check className="size-4 text-green-700" />;
              } else if (!isCorrect && isSelected) {
                styleClasses = 'border-red-400 bg-red-50 text-red-900';
                icon = <X className="size-4 text-red-700" />;
              } else {
                styleClasses = 'border-slate-200 bg-slate-50 text-slate-500 opacity-60';
              }
            } else if (isPendingThis) {
              styleClasses = 'border-blue-400 bg-blue-50 text-blue-900';
              icon = <Loader2 className="size-4 animate-spin text-blue-700" />;
            } else if (isPending) {
              // Another choice is pending — dim this one
              styleClasses = 'border-slate-200 bg-white text-slate-400 opacity-50';
            }

            return (
              <button
                key={letter}
                type="button"
                onClick={() => onSubmit(letter)}
                disabled={isAnswered || isPending}
                className={cn(
                  'flex items-center gap-3 rounded-md border bg-white px-4 py-3 text-left text-sm transition-colors',
                  'disabled:cursor-default',
                  !isAnswered && !isPending &&
                    'border-slate-200 text-slate-900 hover:border-blue-300 hover:bg-blue-50/40',
                  styleClasses
                )}
              >
                <span className="font-semibold text-slate-500">
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

        {isAnswered && answer && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
            <p
              className={cn(
                'text-sm font-medium',
                answer.is_correct ? 'text-green-700' : 'text-red-700'
              )}
            >
              {answer.is_correct
                ? `Correct — +${answer.xp_awarded} XP`
                : `Wrong — the answer was ${answer.correct_choice.toUpperCase()}`}
            </p>
            <Button type="button" size="sm" onClick={onContinue}>
              Continue
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Wrap-up — body reveal + FSRS outcome + next card button
// ============================================================================

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
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <p className="text-sm font-medium text-slate-900">
              {correctCount} of {total} correct
            </p>
            <p
              className={cn(
                'text-xs font-medium',
                allCorrect ? 'text-green-700' : 'text-amber-800'
              )}
            >
              {allCorrect ? 'Rating: Good' : 'Rating: Again'}
            </p>
          </div>
          {completed && nextDueAt ? (
            <p className="text-xs text-slate-600">
              Next review for this card: {formatRelativeDate(nextDueAt)}
              {nextState && ` · state: ${nextState}`}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="size-3 animate-spin" />
              Updating schedule…
            </p>
          )}
        </CardContent>
      </Card>

      {/* Card body — revealed only after MCQs are answered. */}
      <Card>
        <CardContent className="pt-6">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
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
