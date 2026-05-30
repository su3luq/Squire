// Shared shapes for the merged Cards page (review hero + lesson browser).
// The server page (src/app/student/cards/page.tsx) derives these from the
// review session RPC, the lessons query, and the student's card_reviews.

export type CardChipData = {
  id: string;
  headline: string;
  /** Due now per FSRS — drives the bronze "Due" flag. */
  due: boolean;
};

export type LessonData = {
  id: string;
  lessonNumber: number;
  title: string;
  /** Cards in lesson order. */
  cards: CardChipData[];
  /** How many of this lesson's cards are due right now. */
  dueCount: number;
  /** Fraction of cards graduated to FSRS `review` state, 0..1. */
  mastery: number;
};

export type HeroData = {
  dueCount: number;
  reviewsToday: number;
  dailyGoal: number;
  nextDueAt: string | null;
  streakDays: number;
  streakStatus: 'alive_today' | 'in_danger' | 'broken' | 'none';
};
