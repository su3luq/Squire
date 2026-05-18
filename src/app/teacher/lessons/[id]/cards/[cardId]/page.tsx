import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CardEditorForm } from '../card-editor-form';
import { LessonTitleRename } from '../lesson-title-rename';
import { DeleteCardButton } from './delete-card-button';
import { updateCard } from './actions';
import type { CardFormValues, Mcq } from '@/lib/card-schema';

export default async function EditCardPage({
  params,
}: {
  params: Promise<{ id: string; cardId: string }>;
}) {
  const { id, cardId } = await params;
  const supabase = await createClient();

  const { data: lesson } = await supabase
    .from('lessons')
    .select('id, title, lesson_number')
    .eq('id', id)
    .single();

  if (!lesson) notFound();

  const { data: card } = await supabase
    .from('review_cards')
    .select('id, headline, body, lesson_id')
    .eq('id', cardId)
    .single();

  if (!card || card.lesson_id !== id) notFound();

  const { data: questions } = await supabase
    .from('card_quiz_questions')
    .select('question_text, choice_a, choice_b, choice_c, choice_d, correct_choice')
    .eq('card_id', cardId)
    .order('created_at');

  const initial: CardFormValues = {
    headline: card.headline,
    body: card.body,
    questions: (questions ?? []).map<Mcq>((q) => ({
      question_text: q.question_text,
      choice_a: q.choice_a,
      choice_b: q.choice_b,
      choice_c: q.choice_c,
      choice_d: q.choice_d,
      correct_choice: q.correct_choice as 'a' | 'b' | 'c' | 'd',
    })),
  };

  async function action(values: CardFormValues) {
    'use server';
    return updateCard(id, cardId, values);
  }

  return (
    <main className="container mx-auto max-w-4xl p-6">
      <Link
        href={`/teacher/lessons/${id}`}
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Lesson
      </Link>

      <div className="mb-2">
        <LessonTitleRename lessonId={id} initialTitle={lesson.title} />
      </div>
      <p className="mb-6 text-sm text-slate-600">
        Lesson {lesson.lesson_number} · Edit card
      </p>

      <Card>
        <CardContent className="pt-6">
          <CardEditorForm
            lessonId={id}
            initial={initial}
            mode="edit"
            action={action}
          />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-red-700">Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-slate-600">
            Deleting this card removes it, its quiz questions, and any student review
            progress associated with it.
          </p>
          <DeleteCardButton lessonId={id} cardId={cardId} />
        </CardContent>
      </Card>
    </main>
  );
}
