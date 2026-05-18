import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EditLessonForm } from './edit-lesson-form';
import { DeleteLessonButton } from './delete-lesson-button';

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
            <CardTitle>Cards</CardTitle>
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
                class&quot;.
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <Button disabled variant="outline" size="sm">
                Add cards (Phase 2 commit #3)
              </Button>
              <Button disabled variant="outline" size="sm">
                Unlock for class (Phase 2 commit #5)
              </Button>
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
