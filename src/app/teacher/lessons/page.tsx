import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { quickStartLesson } from './actions';

export default async function LessonsListPage() {
  const supabase = await createClient();

  const { data: lessons } = await supabase
    .from('lessons')
    .select('*, lesson_unlocks(class_id)')
    .order('lesson_number', { ascending: true });

  return (
    <main className="container mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link
            href="/teacher"
            className="mb-2 inline-block text-sm text-blue-600 hover:underline"
          >
            ← Dashboard
          </Link>
          <h1 className="text-3xl font-bold">Lessons</h1>
        </div>
        <div className="flex gap-2">
          <form action={quickStartLesson}>
            <button type="submit" className={buttonVariants()}>
              Quick start
            </button>
          </form>
          <Link
            href="/teacher/lessons/new"
            className={buttonVariants({ variant: 'outline' })}
          >
            New lesson
          </Link>
        </div>
      </div>

      <p className="mb-6 text-xs text-slate-500">
        Quick start creates an untitled lesson and jumps you straight into a card.
        Lessons are class-agnostic — when you teach a lesson, you unlock it for the
        specific class on the lesson&apos;s detail page.
      </p>

      {!lessons || lessons.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-slate-600">No lessons yet.</p>
            <p className="mt-2 text-sm text-slate-500">
              Create your first lesson to start building cards.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {lessons.map((lesson) => {
            const unlockedForCount = lesson.lesson_unlocks?.length ?? 0;
            return (
              <Link key={lesson.id} href={`/teacher/lessons/${lesson.id}`}>
                <Card className="transition-colors hover:bg-slate-50">
                  <CardHeader>
                    <CardTitle>{lesson.title}</CardTitle>
                    <CardDescription>Lesson {lesson.lesson_number}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-600">
                      {unlockedForCount === 0 ? (
                        <span className="text-slate-500">Not unlocked for any class yet</span>
                      ) : (
                        <span className="font-medium text-green-700">
                          Unlocked for {unlockedForCount}{' '}
                          {unlockedForCount === 1 ? 'class' : 'classes'}
                        </span>
                      )}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
