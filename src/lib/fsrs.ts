// FSRS-4.5 adapter that wraps `ts-fsrs` and reads/writes the columns we
// actually persist on `card_reviews`. Used by the student review session.
//
// Schema gap (acceptable for v1): we don't persist `lapses` or
// `learning_steps`. FSRS tracks both internally for finer scheduling but
// the drift over a 40-week course with a single student per class is small.
// If the teacher reports unexpected scheduling later, add columns + repath
// the adapter — that's a 1-line ALTER plus updates here.

import {
  fsrs as makeFsrs,
  createEmptyCard,
  Rating,
  State,
  type Card,
  type Grade,
} from 'ts-fsrs';
import type { Database } from './database.types';

type DbState = Database['public']['Enums']['card_review_state'];

const scheduler = makeFsrs({ enable_fuzz: true });

const dbStateToFsrs: Record<DbState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const fsrsStateToDb: Record<State, DbState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

export const RATING_CHOICES = ['again', 'hard', 'good', 'easy'] as const;
export type RatingChoice = (typeof RATING_CHOICES)[number];

const choiceToGrade: Record<RatingChoice, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export type DbCardReview = {
  difficulty: number;
  stability: number;
  state: DbState;
  due_at: string;
  last_reviewed_at: string | null;
  review_count: number;
};

export type ScheduledUpdate = {
  difficulty: number;
  stability: number;
  due_at: string;
  last_reviewed_at: string;
  review_count: number;
  state: DbState;
};

// Compute the next FSRS state for a card given the student's rating.
// `row` is the existing card_reviews row; `choice` is the rating selected.
// Returns the column values to write back to the row.
export function scheduleNext(
  row: DbCardReview,
  choice: RatingChoice,
  now: Date = new Date()
): ScheduledUpdate {
  const grade = choiceToGrade[choice];

  // For freshly-unlocked cards (state='new' with no review history) we let
  // FSRS initialize from scratch. For any card with prior history we hand
  // FSRS the stored values so it continues from the right point on the
  // forgetting curve.
  const isFreshNewCard =
    row.state === 'new' && row.last_reviewed_at === null;

  const card: Card = isFreshNewCard
    ? createEmptyCard(now)
    : {
        due: new Date(row.due_at),
        stability: row.stability,
        difficulty: row.difficulty,
        elapsed_days: row.last_reviewed_at
          ? Math.max(
              0,
              (now.getTime() - new Date(row.last_reviewed_at).getTime()) /
                86_400_000
            )
          : 0,
        scheduled_days: 0,
        learning_steps: 0,
        reps: row.review_count,
        lapses: 0,
        state: dbStateToFsrs[row.state],
        last_review: row.last_reviewed_at
          ? new Date(row.last_reviewed_at)
          : undefined,
      };

  const result = scheduler.next(card, now, grade);

  return {
    difficulty: result.card.difficulty,
    stability: result.card.stability,
    due_at: result.card.due.toISOString(),
    last_reviewed_at: now.toISOString(),
    review_count: result.card.reps,
    state: fsrsStateToDb[result.card.state],
  };
}
