import Link from 'next/link';
import { Library } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';

export default async function LibraryPage() {
  const supabase = await createClient();

  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, title, lesson_number, review_cards(id, headline, position)')
    .order('lesson_number', { ascending: true });

  const lessonsWithCards = (lessons ?? []).map((l) => ({
    ...l,
    review_cards: (l.review_cards ?? []).sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0)
    ),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Library"
        subtitle="Cards your teacher has unlocked for your class. Click a card to read it."
      />

      {lessonsWithCards.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No cards available yet"
          description="Your teacher will unlock them after class."
        />
      ) : (
        <div className="space-y-8">
          {lessonsWithCards.map((lesson) => (
            <section key={lesson.id}>
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Lesson {lesson.lesson_number}
                </h2>
                <span className="text-sm text-foreground">{lesson.title}</span>
              </div>
              {lesson.review_cards.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No cards in this lesson yet.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {lesson.review_cards.map((card) => (
                    <Link
                      key={card.id}
                      href={`/student/library/cards/${card.id}`}
                      scroll={false}
                      className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
                    >
                      <p className="text-sm font-medium text-foreground">
                        {card.headline}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground group-hover:text-primary">
                        Tap to read →
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
