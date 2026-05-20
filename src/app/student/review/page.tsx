import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { NextReviewCountdown } from '@/components/next-review-countdown';
import { ReviewSession, type SessionCard } from './review-session';

// Server component. Pulls the full review payload via list_review_session RPC
// (migration 016) — one round-trip returns due cards, their MCQs (no
// correct_choice), and FSRS state. The client component then walks the
// student through one card at a time.

export const dynamic = 'force-dynamic';

type SessionResult = {
  ok: boolean;
  cards?: SessionCard[];
  error?: string;
};

export default async function ReviewPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('list_review_session');

  if (error) {
    return (
      <main className="container mx-auto max-w-3xl p-6">
        <Link
          href="/student"
          className="mb-4 inline-block text-sm text-blue-600 hover:underline"
        >
          ← Home
        </Link>
        <h1 className="mb-2 text-3xl font-bold">Review</h1>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-red-600">
              Failed to load review session: {error.message}
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const result = (data as SessionResult | null) ?? { ok: false, error: 'No data' };

  if (!result.ok) {
    return (
      <main className="container mx-auto max-w-3xl p-6">
        <Link
          href="/student"
          className="mb-4 inline-block text-sm text-blue-600 hover:underline"
        >
          ← Home
        </Link>
        <h1 className="mb-2 text-3xl font-bold">Review</h1>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-red-600">{result.error ?? 'Failed.'}</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const cards = result.cards ?? [];

  // For the "all caught up — next review in N" hint, get the soonest future due.
  // Cheap query, runs under student-own-RLS on card_reviews.
  let nextDueAt: string | null = null;
  if (cards.length === 0) {
    const { data: nextRow } = await supabase
      .from('card_reviews')
      .select('due_at')
      .gt('due_at', new Date().toISOString())
      .order('due_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    nextDueAt = nextRow?.due_at ?? null;
  }

  // Fresh key per server render. router.refresh() from the client triggers a
  // new server render → new key → ReviewSession remounts with empty internal
  // state. Without this, after a "Wrong"-rated card re-surfaces as still due,
  // ReviewSession keeps its previous cardIndex/sessionDone and the summary
  // screen sticks instead of starting the new session. The page is
  // force-dynamic so this runs per request, which is the intended behavior.
  // eslint-disable-next-line react-hooks/purity
  const sessionKey = Date.now().toString();

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
        Answer the questions for each due card. Each correct answer earns 5 XP.
      </p>

      {cards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-lg font-semibold text-slate-900">All caught up</p>
            <p className="text-sm text-slate-600">
              No cards due right now.
              {nextDueAt && (
                <>
                  {' '}
                  Next review <NextReviewCountdown dueAt={nextDueAt} />.
                </>
              )}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ReviewSession key={sessionKey} cards={cards} />
      )}
    </main>
  );
}
