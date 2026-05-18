import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { saigonShortDate } from '@/lib/saigon-date';
import { NewLessonForm } from './new-lesson-form';

export default async function NewLessonPage() {
  const supabase = await createClient();

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name')
    .is('archived_at', null)
    .order('name');

  if (!classes || classes.length === 0) {
    return (
      <main className="container mx-auto max-w-2xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>No classes available</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">
              You need at least one class before creating lessons. Classes are seeded via the
              admin tooling.
            </p>
            <Link href="/teacher/lessons" className={buttonVariants({ className: 'mt-4' })}>
              Back to lessons
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  // Auto-suggest next lesson number for the first class (most common path: single class)
  const defaultClassId = classes[0].id;
  const { data: maxLesson } = await supabase
    .from('lessons')
    .select('lesson_number')
    .eq('class_id', defaultClassId)
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
            classes={classes}
            nextLessonNumber={nextLessonNumber}
            defaultTitle={defaultTitle}
          />
        </CardContent>
      </Card>
    </main>
  );
}
