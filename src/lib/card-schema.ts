import { z } from 'zod';

export const mcqSchema = z.object({
  question_text: z.string().trim().min(1, 'Question is required'),
  choice_a: z.string().trim().min(1, 'Choice A is required'),
  choice_b: z.string().trim().min(1, 'Choice B is required'),
  choice_c: z.string().trim().min(1, 'Choice C is required'),
  choice_d: z.string().trim().min(1, 'Choice D is required'),
  correct_choice: z.enum(['a', 'b', 'c', 'd']),
});

export type Mcq = z.infer<typeof mcqSchema>;

// Cards can be saved with 0 MCQs (draft state) but cannot enter the review
// system without at least one. The unlock_lesson_cards RPC enforces the
// strict-MCQ rule at unlock time: cards with 0 MCQs are skipped and
// reported back to the teacher. See migration 016.
export const cardSchema = z.object({
  headline: z.string().trim().min(1, 'Headline is required'),
  body: z.string(),
  questions: z
    .array(mcqSchema)
    .max(10, 'Maximum 10 questions per card'),
});

export type CardFormValues = z.infer<typeof cardSchema>;

export const emptyMcq: Mcq = {
  question_text: '',
  choice_a: '',
  choice_b: '',
  choice_c: '',
  choice_d: '',
  correct_choice: 'a',
};

export const emptyCard: CardFormValues = {
  headline: '',
  body: '',
  questions: [],
};
