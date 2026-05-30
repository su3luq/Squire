import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { CardsWorkspace } from '@/components/teacher-cards/cards-workspace';
import { computeRecall } from '@/lib/recall';
import type { LessonRow } from '@/components/teacher-cards/types';

export const dynamic = 'force-dynamic';

export default async function TeacherCardsPage() {
  const supabase = await createClient();

  const [{ data: lessonsRaw }, { data: recallRows }] = await Promise.all([
    supabase
      .from('lessons')
      .select('id, title, lesson_number, review_cards(id, headline, position, card_quiz_questions(count)), lesson_unlocks(class_id)')
      .order('lesson_number', { ascending: false }),
    supabase.from('card_recall_stats').select('card_id, attempts, correct'),
  ]);

  const recallByCard = new Map(
    (recallRows ?? []).map((r) => [r.card_id, { attempts: r.attempts ?? 0, correct: r.correct ?? 0 }]),
  );

  const lessons: LessonRow[] = (lessonsRaw ?? []).map((l) => {
    const cards = (l.review_cards ?? [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((c) => {
        const r = recallByCard.get(c.id) ?? { attempts: 0, correct: 0 };
        // PostgREST returns count aggregates as [{ count: number }]; cast since generated
        // types only know the full row shape, not the aggregate shorthand.
        const questionCount = Array.isArray(c.card_quiz_questions)
          ? ((c.card_quiz_questions as unknown as { count: number }[])[0]?.count ?? 0)
          : 0;
        return { id: c.id, headline: c.headline, questionCount, recall: computeRecall(r.attempts, r.correct) };
      });
    const unlockCount = l.lesson_unlocks?.length ?? 0;
    const agA = cards.reduce((s, c) => s + (recallByCard.get(c.id)?.attempts ?? 0), 0);
    const agC = cards.reduce((s, c) => s + (recallByCard.get(c.id)?.correct ?? 0), 0);
    return {
      id: l.id, lessonNumber: l.lesson_number, title: l.title, cards,
      needsCount: cards.filter((c) => c.questionCount === 0).length,
      unlockCount, recall: computeRecall(agA, agC),
    };
  });

  const totalCards = lessons.reduce((s, l) => s + l.cards.length, 0);
  const unlockedLessons = lessons.filter((l) => l.unlockCount > 0).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Cards" subtitle="Author cards, group them into lessons, unlock each lesson per class." />
      <CardsWorkspace
        lessons={lessons}
        totalCards={totalCards}
        unlockedLessons={unlockedLessons}
        newLessonHref="/teacher/cards/new"
      />
    </div>
  );
}
