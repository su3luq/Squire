import { createClient } from '@/lib/supabase/server';
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

function ReviewHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
      {subtitle ? (
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      ) : null}
    </header>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <p className="text-sm text-destructive">{message}</p>
      </CardContent>
    </Card>
  );
}

export default async function ReviewPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('list_review_session');

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <ReviewHeader />
        <ErrorPanel message={`Failed to load review session: ${error.message}`} />
      </div>
    );
  }

  const result = (data as SessionResult | null) ?? { ok: false, error: 'No data' };

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-3xl">
        <ReviewHeader />
        <ErrorPanel message={result.error ?? 'Failed to load review session.'} />
      </div>
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
  // screen sticks instead of starting the new session.
  // eslint-disable-next-line react-hooks/purity
  const sessionKey = Date.now().toString();

  return (
    <div className="mx-auto max-w-3xl">
      <ReviewHeader
        subtitle={
          cards.length > 0
            ? 'Answer the questions for each due card. Each correct answer earns 5 XP.'
            : undefined
        }
      />

      {cards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <p className="text-lg font-semibold">All caught up</p>
            <p className="text-sm text-muted-foreground">
              No cards due right now.
              {nextDueAt ? (
                <>
                  {' '}
                  Next review <NextReviewCountdown dueAt={nextDueAt} />.
                </>
              ) : null}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ReviewSession key={sessionKey} cards={cards} />
      )}
    </div>
  );
}
