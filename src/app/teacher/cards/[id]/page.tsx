import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { EditLessonForm } from './edit-lesson-form';
import { DeleteLessonButton } from './delete-lesson-button';
import { ClassAccessRow } from './class-access-row';

export default async function LessonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: lesson } = await supabase
    .from('lessons')
    .select('*')
    .eq('id', id)
    .single();

  if (!lesson) notFound();

  const { data: counts } = await supabase
    .from('lesson_card_counts')
    .select('card_count')
    .eq('lesson_id', id)
    .maybeSingle();

  const cardCount = counts?.card_count ?? 0;

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name')
    .is('archived_at', null)
    .order('name');

  const { data: unlocks } = await supabase
    .from('lesson_unlocks')
    .select('class_id, unlocked_at')
    .eq('lesson_id', id);

  const classIds = (classes ?? []).map((c) => c.id);
  let studentCountsByClass = new Map<string, number>();
  if (classIds.length > 0) {
    const { data: students } = await supabase
      .from('profiles')
      .select('class_id')
      .eq('role', 'student')
      .in('class_id', classIds);
    studentCountsByClass = (students ?? []).reduce((acc, s) => {
      if (s.class_id) acc.set(s.class_id, (acc.get(s.class_id) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
  }

  const unlockedByClass = new Map<string, string>(
    (unlocks ?? []).map((u) => [u.class_id, u.unlocked_at])
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/teacher/cards"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Cards
      </Link>

      <PageHeader
        title={lesson.title}
        subtitle={`Lesson ${lesson.lesson_number}`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Class access</CardTitle>
        </CardHeader>
        <CardContent>
          {classes && classes.length > 0 ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {classes.map((cls) => (
                <ClassAccessRow
                  key={cls.id}
                  lessonId={id}
                  classId={cls.id}
                  className={cls.name}
                  unlockedAt={unlockedByClass.get(cls.id) ?? null}
                  cardCount={cardCount}
                  studentCount={studentCountsByClass.get(cls.id) ?? 0}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No classes available.
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Unlock this lesson for each class on the day you teach it. Re-syncing
            picks up any cards or students added since the last unlock.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edit lesson</CardTitle>
        </CardHeader>
        <CardContent>
          <EditLessonForm lesson={lesson} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Deleting this lesson permanently removes it
            {cardCount > 0
              ? `, all ${cardCount} cards, and any review state for students`
              : ''}
            . This cannot be undone.
          </p>
          <DeleteLessonButton lessonId={lesson.id} cardCount={cardCount} />
        </CardContent>
      </Card>
    </div>
  );
}
