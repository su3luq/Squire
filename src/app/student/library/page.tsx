import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// Student card library. Lists lessons (filtered by RLS to those unlocked for
// the student's class) and the cards within each lesson. Click a card →
// intercepting route opens the detail modal.

export default async function LibraryPage() {
  const supabase = await createClient();

  // RLS handles filtering: only lessons unlocked for the student's class come
  // through, and only the cards in those lessons.
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
    <main className="container mx-auto max-w-4xl p-6">
      <Link
        href="/student"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Home
      </Link>
      <h1 className="mb-2 text-3xl font-bold">Library</h1>
      <p className="mb-6 text-sm text-slate-600">
        Cards your teacher has unlocked for your class. Click a card to read it.
      </p>

      {lessonsWithCards.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-slate-600">No cards available yet.</p>
            <p className="mt-2 text-sm text-slate-500">
              Your teacher will unlock them after class.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {lessonsWithCards.map((lesson) => (
            <section key={lesson.id}>
              <h2 className="mb-3 border-b border-slate-200 pb-1 text-lg font-semibold text-slate-900">
                Lesson {lesson.lesson_number} · {lesson.title}
              </h2>
              {lesson.review_cards.length === 0 ? (
                <p className="text-sm text-slate-500">No cards in this lesson yet.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {lesson.review_cards.map((card) => (
                    <Link
                      key={card.id}
                      href={`/student/library/cards/${card.id}`}
                      scroll={false}
                    >
                      <Card className="h-full transition-colors hover:border-blue-300 hover:bg-blue-50/30">
                        <CardHeader>
                          <CardTitle className="text-base">{card.headline}</CardTitle>
                          <CardDescription className="text-xs">
                            Tap to read
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
