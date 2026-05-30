import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { CardEditorForm } from '../card-editor-form';
import { LessonTitleRename } from '../lesson-title-rename';
import { createCard } from './actions';
import type { CardFormValues } from '@/lib/card-schema';

export default async function NewCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: lesson } = await supabase
    .from('lessons')
    .select('id, title, lesson_number')
    .eq('id', id)
    .single();

  if (!lesson) notFound();

  async function action(values: CardFormValues) {
    'use server';
    return createCard(id, values);
  }

  return (
    <main className="container mx-auto max-w-4xl p-6">
      <Link
        href={`/teacher/cards/${id}`}
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Lesson
      </Link>

      <div className="mb-2">
        <LessonTitleRename lessonId={id} initialTitle={lesson.title} />
      </div>
      <p className="mb-6 text-sm text-slate-600">
        Lesson {lesson.lesson_number} · New card
      </p>

      <Card>
        <CardContent className="pt-6">
          <CardEditorForm lessonId={id} mode="new" action={action} />
        </CardContent>
      </Card>
    </main>
  );
}
