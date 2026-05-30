import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <Link
        href={`/teacher/cards/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Cards
      </Link>

      <div>
        <LessonTitleRename lessonId={id} initialTitle={lesson.title} />
        <p className="text-sm text-muted-foreground">
          Lesson {lesson.lesson_number} · New card
        </p>
      </div>

      <CardEditorForm lessonId={id} mode="new" action={action} />
    </main>
  );
}
