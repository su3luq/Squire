import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EditLessonForm } from './edit-lesson-form';
import { DeleteLessonButton } from './delete-lesson-button';
import { UnlockLessonButton } from './unlock-button';

export default async function LessonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: lesson } = await supabase
    .from('lessons')
    .select('*, classes(id, name)')
    .eq('id', id)
    .single();

  if (!lesson) notFound();

  const { data: counts } = await supabase
    .from('lesson_card_counts')
    .select('card_count, question_count')
    .eq('lesson_id', id)
    .maybeSingle();

  const cardCount = counts?.card_count ?? 0;
  const questionCount = counts?.question_count ?? 0;

  const { data: cards } = await supabase
    .from('review_cards')
    .select('id, headline, position')
    .eq('lesson_id', id)
    .order('position');

  const { count: studentCountRaw } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', lesson.class_id)
    .eq('role', 'student');
  const studentCount = studentCountRaw ?? 0;

  return (
    <main className="container mx-auto max-w-2xl p-6">
      <Link
        href="/teacher/lessons"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Lessons
      </Link>

      <h1 className="mb-2 text-3xl font-bold">{lesson.title}</h1>
      <p className="mb-6 text-sm text-slate-600">
        Lesson {lesson.lesson_number} · {lesson.classes?.name}
      </p>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Cards</CardTitle>
              <Link
                href={`/teacher/lessons/${id}/cards/new`}
                className={buttonVariants({ size: 'sm' })}
              >
                Add card
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">
              {cardCount} {cardCount === 1 ? 'card' : 'cards'} · {questionCount} quiz{' '}
              {questionCount === 1 ? 'question' : 'questions'}
            </p>
            {lesson.cards_unlocked_at ? (
              <p className="mt-2 text-sm font-medium text-green-700">
                Unlocked for class on{' '}
                {new Date(lesson.cards_unlocked_at).toLocaleDateString()}
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                Cards not yet unlocked for students. Add cards and click &quot;Unlock for
                class&quot; (Phase 2 commit #5).
              </p>
            )}

            {cards && cards.length > 0 && (
              <ul className="mt-4 divide-y divide-slate-200 rounded-md border border-slate-200">
                {cards.map((card) => (
                  <li key={card.id}>
                    <Link
                      href={`/teacher/lessons/${id}/cards/${card.id}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-slate-50"
                    >
                      <span className="truncate font-medium text-slate-900">
                        {card.headline}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">Edit →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4">
              <UnlockLessonButton
                lessonId={id}
                cardCount={cardCount}
                studentCount={studentCount}
                alreadyUnlocked={Boolean(lesson.cards_unlocked_at)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Edit lesson</CardTitle>
          </CardHeader>
          <CardContent>
            <EditLessonForm lesson={lesson} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-red-700">Danger zone</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-slate-600">
              Deleting this lesson permanently removes it
              {cardCount > 0 ? `, all ${cardCount} cards, and any review state for students` : ''}.
              This cannot be undone.
            </p>
            <DeleteLessonButton lessonId={lesson.id} cardCount={cardCount} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
