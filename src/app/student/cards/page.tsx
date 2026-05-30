import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { saigonDay, computeEffectiveStreak } from '@/lib/streak';
import { DAILY_REVIEW_GOAL } from '@/components/daily-review-goal';
import { CardsView } from '@/components/cards/cards-view';
import type { SessionCard } from '@/components/cards/review-session';
import type { LessonData } from '@/components/cards/types';

// Merged Cards page: the gamified review hero (due-queue session, taken
// over in place) + the lesson browser (all unlocked cards). Replaces the
// old /student/review and /student/library. See
// docs/superpowers/specs/2026-05-30-cards-review-merge-design.md.

export const dynamic = 'force-dynamic';

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ review?: string }>;
}) {
  const { review } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const nowIso = new Date().toISOString();
  const today = saigonDay();
  const todayStartIso = new Date(`${today}T00:00:00+07:00`).toISOString();

  const [
    sessionRes,
    { data: lessonsRaw },
    { data: reviews },
    { count: reviewsTodayRaw },
    { data: nextRow },
    { data: profile },
  ] = await Promise.all([
    // Single source of "due" — powers the hero count, the session, and the
    // grid/strip Due flags so the numbers can never disagree.
    supabase.rpc('list_review_session'),
    supabase
      .from('lessons')
      .select('id, title, lesson_number, review_cards(id, headline, position)')
      .order('lesson_number', { ascending: true }),
    supabase.from('card_reviews').select('card_id, state, due_at'),
    supabase
      .from('review_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', user.id)
      .gte('answered_at', todayStartIso),
    supabase
      .from('card_reviews')
      .select('due_at')
      .gt('due_at', nowIso)
      .order('due_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('streak_days, streak_last_day')
      .eq('id', user.id)
      .single(),
  ]);

  const sessionResult =
    (sessionRes.data as { ok: boolean; cards?: SessionCard[] } | null) ?? {
      ok: false,
    };
  const sessionCards = sessionResult.cards ?? [];
  const dueIds = new Set(sessionCards.map((c) => c.card_id));

  const stateByCard = new Map<string, string>();
  for (const r of reviews ?? []) stateByCard.set(r.card_id, r.state);

  const lessons: LessonData[] = (lessonsRaw ?? [])
    .map((l) => {
      const cards = (l.review_cards ?? [])
        .slice()
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((c) => ({
          id: c.id,
          headline: c.headline,
          due: dueIds.has(c.id),
        }));
      const dueCount = cards.filter((c) => c.due).length;
      const graduated = cards.filter(
        (c) => stateByCard.get(c.id) === 'review',
      ).length;
      const mastery = cards.length > 0 ? graduated / cards.length : 0;
      return {
        id: l.id,
        lessonNumber: l.lesson_number,
        title: l.title,
        cards,
        dueCount,
        mastery,
      };
    })
    // Only lessons with unlocked cards (RLS scopes review_cards to the
    // student's unlocked lessons).
    .filter((l) => l.cards.length > 0);

  // Current lesson = highest-numbered unlocked lesson.
  const currentLessonId =
    lessons.length > 0
      ? lessons.reduce((a, b) => (b.lessonNumber > a.lessonNumber ? b : a)).id
      : null;

  const streak = computeEffectiveStreak(
    profile?.streak_days ?? 0,
    profile?.streak_last_day ?? null,
    today,
  );

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Cards</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review what&apos;s due, and read any card your teacher has unlocked.
        </p>
      </header>
      <CardsView
        sessionCards={sessionCards}
        lessons={lessons}
        currentLessonId={currentLessonId}
        hero={{
          dueCount: sessionCards.length,
          reviewsToday: reviewsTodayRaw ?? 0,
          dailyGoal: DAILY_REVIEW_GOAL,
          nextDueAt: nextRow?.due_at ?? null,
          streakDays: streak.days,
          streakStatus: streak.status,
        }}
        autoStart={review === '1'}
      />
    </div>
  );
}
