import type { RecallStat } from '@/lib/recall';

export type CardRow = {
  id: string;
  headline: string;
  questionCount: number;
  recall: RecallStat;
};

export type LessonRow = {
  id: string;
  lessonNumber: number;
  title: string;
  cards: CardRow[];
  needsCount: number;   // cards with 0 questions
  unlockCount: number;  // lesson_unlocks rows
  recall: RecallStat;   // lesson-aggregate recall
};
