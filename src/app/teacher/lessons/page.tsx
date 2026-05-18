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

export default async function LessonsListPage() {
  const supabase = await createClient();

  const { data: lessons } = await supabase
    .from('lessons')
    .select('*, classes(id, name)')
    .order('lesson_number', { ascending: true });

  return (
    <main className="container mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/teacher"
            className="mb-2 inline-block text-sm text-blue-600 hover:underline"
          >
            ← Dashboard
          </Link>
          <h1 className="text-3xl font-bold">Lessons</h1>
        </div>
        <Link href="/teacher/lessons/new" className={buttonVariants()}>
          New lesson
        </Link>
      </div>

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
          {lessons.map((lesson) => (
            <Link key={lesson.id} href={`/teacher/lessons/${lesson.id}`}>
              <Card className="transition-colors hover:bg-slate-50">
                <CardHeader>
                  <CardTitle>{lesson.title}</CardTitle>
                  <CardDescription>
                    Lesson {lesson.lesson_number} · {lesson.classes?.name ?? 'Unknown class'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 text-sm text-slate-600">
                    {lesson.cards_unlocked_at ? (
                      <span className="font-medium text-green-700">Unlocked</span>
                    ) : (
                      <span className="text-slate-500">Draft</span>
                    )}
                    {lesson.taught_at && (
                      <>
                        <span>·</span>
                        <span>Taught {new Date(lesson.taught_at).toLocaleDateString()}</span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
