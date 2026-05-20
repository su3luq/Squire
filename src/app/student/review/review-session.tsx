'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { Check, X } from 'lucide-react';
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
  const [progress, setProgress] = useState<Record<string, CardProgress>>(() =>
    Object.fromEntries(
      cards.map((c) => [
        c.card_review_id,
        { answers: [], completed: false, nextDueAt: null, nextState: null },
      ])
    )
  );
  // When non-null, we're showing the feedback overlay for the answer at this index.
  // User clicks "Continue" to dismiss, which advances to the next MCQ (or wrap-up).
  const [feedbackForIndex, setFeedbackForIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();
  // Track which card_review_ids are currently having their FSRS state written.
  // Prevents the auto-complete effect from double-firing.
  const completingRef = useRef<Set<string>>(new Set());
  const [completingTick, setCompletingTick] = useState(0); // forces re-render after Set mutation

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

  // ---- Auto-complete FSRS state once all MCQs for a card are answered and feedback dismissed ----
  useEffect(() => {
    if (!currentCard || !currentProgress) return;
    if (currentProgress.completed) return;
    if (currentProgress.answers.length < currentCard.mcqs.length) return;
    if (feedbackForIndex !== null) return;
    if (completingRef.current.has(currentCard.card_review_id)) return;

    completingRef.current.add(currentCard.card_review_id);
    setCompletingTick((t) => t + 1);

    void (async () => {
      const allCorrect = currentProgress.answers.every((a) => a.is_correct);
      const choice = allCorrect ? 'good' : 'again';

      const row: DbCardReview = {
        difficulty: currentCard.fsrs.difficulty,
        stability: currentCard.fsrs.stability,
        state: currentCard.fsrs.state,
        due_at: currentCard.fsrs.due_at,
        last_reviewed_at: currentCard.fsrs.last_reviewed_at,
        review_count: currentCard.fsrs.review_count,
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
        .eq('id', currentCard.card_review_id);

      completingRef.current.delete(currentCard.card_review_id);
      setCompletingTick((t) => t + 1);

      if (updateError) {
        setError(`Failed to save FSRS state: ${updateError.message}`);
        return;
      }

      setProgress((prev) => {
        const cur = prev[currentCard.card_review_id];
        return {
          ...prev,
          [currentCard.card_review_id]: {
            ...cur,
            completed: true,
            nextDueAt: update.due_at,
            nextState: update.state,
          },
        };
      });
    })();
  }, [
    currentCard,
    currentProgress,
    feedbackForIndex,
    supabase,
    completingTick,
  ]);

  // ---- Submit one MCQ answer ----
  function submitAnswer(mcqId: string, choice: Choice) {
    if (!currentCard || !currentProgress) return;
    setError(null);

    startSubmit(async () => {
      const { data, error: rpcError } = await supabase.rpc('submit_mcq_answer', {
        p_quiz_question_id: mcqId,
        p_selected_choice: choice,
      });

      if (rpcError) {
        setError(`Failed to submit: ${rpcError.message}`);
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
        return;
      }

      const answer: Answer = {
        selected: choice,
        is_correct: result.is_correct ?? false,
        correct_choice: (result.correct_choice ?? choice) as Choice,
        xp_awarded: result.xp_awarded ?? 0,
      };

      let newAnswerIndex = -1;
      setProgress((prev) => {
        const cur = prev[currentCard.card_review_id];
        newAnswerIndex = cur.answers.length;
        return {
          ...prev,
          [currentCard.card_review_id]: {
            ...cur,
            answers: [...cur.answers, answer],
          },
        };
      });
      // Show feedback for the just-given answer.
      setFeedbackForIndex(newAnswerIndex);
    });
  }

  function dismissFeedback() {
    setFeedbackForIndex(null);
  }

  function advanceToNextCard() {
    setCardIndex((i) => i + 1);
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

  const mcqIndex = currentProgress.answers.length;
  const allMcqsAnswered = mcqIndex >= currentCard.mcqs.length;
  const showingFeedback = feedbackForIndex !== null;
  const feedbackAnswer =
    feedbackForIndex !== null ? currentProgress.answers[feedbackForIndex] : null;
  const currentMcq = !allMcqsAnswered ? currentCard.mcqs[mcqIndex] : undefined;

  const progressValue = (cardIndex / totalCards) * 100;

  // Display the 1-based index of the question the user is on (or just answered).
  const displayedQuestionNumber = showingFeedback
    ? (feedbackForIndex ?? 0) + 1
    : Math.min(mcqIndex + 1, currentCard.mcqs.length);

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
              Question {displayedQuestionNumber} of {currentCard.mcqs.length}
            </p>
          )}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Branch on session state: feedback, MCQ, or wrap-up. */}
      {showingFeedback && feedbackAnswer ? (
        <AnswerFeedback answer={feedbackAnswer} onNext={dismissFeedback} />
      ) : !allMcqsAnswered && currentMcq ? (
        <McqStep
          key={currentMcq.id}
          mcq={currentMcq}
          onSubmit={(choice) => submitAnswer(currentMcq.id, choice)}
          disabled={isSubmitting}
        />
      ) : (
        <CardWrapUp
          card={currentCard}
          answers={currentProgress.answers}
          completed={currentProgress.completed}
          nextDueAt={currentProgress.nextDueAt}
          nextState={currentProgress.nextState}
          onNextCard={advanceToNextCard}
          pending={!currentProgress.completed}
        />
      )}
    </div>
  );
}

// ============================================================================
// MCQ step — 4 choice buttons
// ============================================================================

function McqStep({
  mcq,
  onSubmit,
  disabled,
}: {
  mcq: SessionCard['mcqs'][number];
  onSubmit: (choice: Choice) => void;
  disabled: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <p className="text-base font-medium text-slate-900">{mcq.question_text}</p>
        <div className="grid grid-cols-1 gap-2">
          {CHOICES.map((letter) => (
            <Button
              key={letter}
              type="button"
              variant="outline"
              onClick={() => onSubmit(letter)}
              disabled={disabled}
              className="h-auto justify-start whitespace-normal py-3 text-left"
            >
              <span className="mr-2 font-semibold text-slate-500">
                {letter.toUpperCase()}
              </span>
              <span>{mcq[`choice_${letter}` as const]}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Feedback after an MCQ — Continue dismisses
// ============================================================================

function AnswerFeedback({ answer, onNext }: { answer: Answer; onNext: () => void }) {
  return (
    <Card
      className={cn(
        answer.is_correct
          ? 'border-green-300 bg-green-50/40'
          : 'border-red-300 bg-red-50/40'
      )}
    >
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {answer.is_correct ? (
            <>
              <Check className="size-5 text-green-700" />
              <span className="text-sm font-medium text-green-800">
                Correct — +{answer.xp_awarded} XP
              </span>
            </>
          ) : (
            <>
              <X className="size-5 text-red-700" />
              <span className="text-sm font-medium text-red-800">
                Wrong — the answer was {answer.correct_choice.toUpperCase()}
              </span>
            </>
          )}
        </div>
        <Button type="button" size="sm" onClick={onNext}>
          Continue
        </Button>
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
  pending,
}: {
  card: SessionCard;
  answers: Answer[];
  completed: boolean;
  nextDueAt: string | null;
  nextState: DbState | null;
  onNextCard: () => void;
  pending: boolean;
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
            <p className="text-xs text-slate-500">Updating schedule…</p>
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
        <Button type="button" onClick={onNextCard} disabled={pending}>
          {pending ? 'Saving…' : 'Next card'}
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
