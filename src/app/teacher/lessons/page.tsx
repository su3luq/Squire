import Link from 'next/link';
import { BookOpen, Plus, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { quickStartLesson } from './actions';

export default async function LessonsListPage() {
  const supabase = await createClient();

  const { data: lessons } = await supabase
    .from('lessons')
    .select('*, lesson_unlocks(class_id)')
    .order('lesson_number', { ascending: true });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Lessons"
        subtitle="Quick start creates an untitled lesson and jumps you straight into a card. Lessons are class-agnostic — unlock each one per class when you teach it."
        actions={
          <>
            <form action={quickStartLesson}>
              <button type="submit" className={buttonVariants({ size: 'sm' })}>
                <Zap className="h-4 w-4" />
                Quick start
              </button>
            </form>
            <Link
              href="/teacher/lessons/new"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Plus className="h-4 w-4" />
              New lesson
            </Link>
          </>
        }
      />

      {!lessons || lessons.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No lessons yet"
          description="Create your first lesson to start building cards."
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {lessons.map((lesson) => {
            const unlockedForCount = lesson.lesson_unlocks?.length ?? 0;
            return (
              <li key={lesson.id}>
                <Link
                  href={`/teacher/lessons/${lesson.id}`}
                  className="block p-5 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Lesson {lesson.lesson_number}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-medium">
                        {lesson.title}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        unlockedForCount === 0
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {unlockedForCount === 0
                        ? 'Locked'
                        : `Unlocked × ${unlockedForCount}`}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
