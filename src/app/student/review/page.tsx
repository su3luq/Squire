import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { ReviewSession } from './review-session';

// Server component: fetches all card_reviews where due_at <= now() for the
// current student, joined with the underlying card and lesson. RLS scopes
// to the signed-in student automatically.

export const dynamic = 'force-dynamic';

type RawRow = {
  id: string;
  due_at: string;
  review_cards: {
    headline: string;
    body: string;
    position: number;
    lessons: { title: string; lesson_number: number } | null;
  } | null;
};

export default async function ReviewPage() {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data } = await supabase
    .from('card_reviews')
    .select(
      'id, due_at, review_cards(headline, body, position, lessons(title, lesson_number))'
    )
    .lte('due_at', now)
    .order('due_at', { ascending: true });

  const rawRows = (data as RawRow[] | null) ?? [];

  // Filter out rows where the join is null (defensive; shouldn't happen in
  // practice) and shape for the client.
  const cards = rawRows
    .filter((r) => r.review_cards !== null)
    .map((r) => ({
      cardReviewId: r.id,
      headline: r.review_cards!.headline,
      body: r.review_cards!.body,
      lessonTitle: r.review_cards!.lessons?.title ?? '',
      lessonNumber: r.review_cards!.lessons?.lesson_number ?? 0,
    }));

  return (
    <main className="container mx-auto max-w-3xl p-6">
      <Link
        href="/student"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Home
      </Link>
      <h1 className="mb-1 text-3xl font-bold">Review</h1>
      <p className="mb-6 text-sm text-slate-600">
        Cards due now from your unlocked lessons.
      </p>

      {cards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-lg font-semibold text-slate-900">All caught up</p>
            <p className="text-sm text-slate-600">
              No cards due right now. Check back later.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ReviewSession cards={cards} />
      )}
    </main>
  );
}
