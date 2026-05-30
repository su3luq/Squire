import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/teacher/cards"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Cards
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">New lesson</h1>

      <Card>
        <CardContent className="pt-6">
          <NewLessonForm
            nextLessonNumber={nextLessonNumber}
            defaultTitle={defaultTitle}
          />
        </CardContent>
      </Card>
    </div>
  );
}
