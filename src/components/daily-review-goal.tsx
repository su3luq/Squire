import Link from 'next/link';
import { ArrowRight, BookOpen, Flame, ShieldCheck } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ReviewLauncher } from '@/components/review-launcher';
import { cn } from '@/lib/utils';
import type { EffectiveStreak } from '@/lib/streak';

export const DAILY_REVIEW_GOAL = 5;

interface DailyReviewGoalProps {
  dueCount: number;
  reviewsToday: number;
  nextDueAt: string | null;
  streak: EffectiveStreak;
  className?: string;
}

/**
 * Replaces the old "Today's review" card with a streak-aware goal card.
 * Each state shows a different copy + tone so the student knows exactly
 * what protects their streak right now:
 *
 *   - already cleared the goal → green "streak safe" framing
 *   - reviewing in progress    → progress bar with X/5 + "Y more"
 *   - haven't started + due    → "review N to keep your streak"
 *   - no cards due             → "streak safe — nothing due"
 *   - no streak yet            → "start your streak"
 */
export function DailyReviewGoal({
  dueCount,
  reviewsToday,
  nextDueAt,
  streak,
  className,
}: DailyReviewGoalProps) {
  const goalReached = reviewsToday >= DAILY_REVIEW_GOAL;
  const progress = Math.min(1, reviewsToday / DAILY_REVIEW_GOAL);
  const remaining = Math.max(0, DAILY_REVIEW_GOAL - reviewsToday);
  const hasStreak = streak.status === 'alive_today' || streak.status === 'in_danger';

  let title: string;
  let body: React.ReactNode;
  let tone: 'good' | 'urgent' | 'neutral';

  if (dueCount === 0 && reviewsToday === 0) {
    tone = 'good';
    title = 'No cards due — streak safe';
    body = (
      <>
        {hasStreak
          ? `Your ${streak.days}-day streak is safe — no due cards right now.`
          : 'Nothing due right now. Check back soon.'}
      </>
    );
  } else if (goalReached) {
    tone = 'good';
    title = hasStreak
      ? `Streak protected — ${streak.days} ${streak.days === 1 ? 'day' : 'days'}`
      : 'Daily goal cleared';
    body = (
      <>
        <span className="font-semibold tabular-nums text-foreground">
          {reviewsToday}
        </span>{' '}
        reviews today.{' '}
        {dueCount > 0
          ? `${dueCount} ${dueCount === 1 ? 'card' : 'cards'} still due — grind for more XP.`
          : 'All caught up.'}
      </>
    );
  } else if (reviewsToday > 0) {
    tone = 'urgent';
    title = `${reviewsToday}/${DAILY_REVIEW_GOAL} reviews today`;
    body = (
      <>
        <span className="font-semibold tabular-nums text-foreground">
          {remaining} more
        </span>{' '}
        to {hasStreak ? `keep your ${streak.days}-day streak alive` : 'start your streak'}.
      </>
    );
  } else if (streak.status === 'in_danger') {
    tone = 'urgent';
    title = `Streak at risk — ${streak.days} ${streak.days === 1 ? 'day' : 'days'}`;
    body = (
      <>
        Review{' '}
        <span className="font-semibold tabular-nums text-foreground">
          {DAILY_REVIEW_GOAL} cards
        </span>{' '}
        today to keep the flame alive.
      </>
    );
  } else if (streak.status === 'broken' || streak.status === 'none') {
    tone = 'neutral';
    title = 'Start your streak';
    body = (
      <>
        Review{' '}
        <span className="font-semibold tabular-nums text-foreground">
          {DAILY_REVIEW_GOAL} cards
        </span>{' '}
        today to begin a streak.
      </>
    );
  } else {
    tone = 'neutral';
    title = "Today's review";
    body = (
      <>
        {dueCount}{' '}
        {dueCount === 1 ? 'card is' : 'cards are'} due — keep your momentum.
      </>
    );
  }

  const Icon =
    tone === 'good' ? ShieldCheck : tone === 'urgent' ? Flame : BookOpen;

  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-card p-5',
        className,
      )}
    >
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              'mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
              tone === 'good' &&
                'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
              tone === 'urgent' &&
                'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
              tone === 'neutral' && 'bg-muted text-muted-foreground',
            )}
            aria-hidden
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </div>
        </div>
        <ReviewLauncher dueCount={dueCount} nextDueAt={nextDueAt} />
      </div>

      {!goalReached && dueCount > 0 && (
        <div className="mt-4 space-y-1.5">
          <Progress
            value={Math.round(progress * 100)}
            aria-label={`${reviewsToday} of ${DAILY_REVIEW_GOAL} daily reviews`}
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              {reviewsToday}/{DAILY_REVIEW_GOAL}
            </span>
            <Link
              href="/student/review"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Review now <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
