import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { saigonShortDate } from '@/lib/saigon-date';
import { NewLessonForm } from './new-lesson-form';

export default async function NewLessonPage() {
  const supabase = await createClient();

  // lesson_number is globally unique now — auto-suggest the next one.
  const { data: maxLesson } = await supabase
    .from('lessons')
    .select('lesson_number')
    .order('lesson_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextLessonNumber = (maxLesson?.lesson_number ?? 0) + 1;
  const defaultTitle = `Untitled lesson — ${saigonShortDate()}`;

  return (
    <main className="container mx-auto max-w-2xl p-6">
      <Link
        href="/teacher/lessons"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Lessons
      </Link>
      <h1 className="mb-6 text-3xl font-bold">New lesson</h1>

      <Card>
        <CardContent className="pt-6">
          <NewLessonForm
            nextLessonNumber={nextLessonNumber}
            defaultTitle={defaultTitle}
          />
        </CardContent>
      </Card>
    </main>
  );
}
