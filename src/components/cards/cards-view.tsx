'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search } from 'lucide-react';
import { ReviewHero } from './review-hero';
import { ReviewSession, type SessionCard } from './review-session';
import { ContinueStrip } from './continue-strip';
import { LessonGrid } from './lesson-grid';
import { CardChip } from './card-chip';
import type { HeroData, LessonData } from './types';

// Orchestrates the merged Cards page: a browse view (hero + continue strip
// + lesson browser) that takes over in place with the review session, then
// returns to browse on finish. One URL, client state.

export function CardsView({
  sessionCards,
  lessons,
  currentLessonId,
  hero,
  autoStart,
}: {
  sessionCards: SessionCard[];
  lessons: LessonData[];
  currentLessonId: string | null;
  hero: HeroData;
  autoStart: boolean;
}) {
  const router = useRouter();
  const [inSession, setInSession] = useState(autoStart && sessionCards.length > 0);
  const [query, setQuery] = useState('');

  const currentLesson = lessons.find((l) => l.id === currentLessonId) ?? null;

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const matches = useMemo(() => {
    if (!searching) return [];
    return lessons.flatMap((l) =>
      l.cards.filter((c) => c.headline.toLowerCase().includes(q)),
    );
  }, [lessons, q, searching]);

  function exitSession() {
    setInSession(false);
    // Drop any ?review=1 deep-link param and re-fetch fresh due state.
    router.replace('/student/cards');
    router.refresh();
  }

  if (inSession) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <button
          type="button"
          onClick={exitSession}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to cards
        </button>
        <ReviewSession cards={sessionCards} onExit={exitSession} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ReviewHero {...hero} onStart={() => setInSession(true)} />

      {currentLesson && !searching && <ContinueStrip lesson={currentLesson} />}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold">All lessons</h3>
          <div className="relative sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cards…"
              aria-label="Search cards"
              className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        </div>

        {searching ? (
          matches.length === 0 ? (
            <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              No cards match “{query}”.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {matches.map((card) => (
                <CardChip key={card.id} card={card} />
              ))}
            </div>
          )
        ) : lessons.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No cards unlocked yet. Your teacher will unlock them after class.
          </p>
        ) : (
          <LessonGrid lessons={lessons} />
        )}
      </section>
    </div>
  );
}
