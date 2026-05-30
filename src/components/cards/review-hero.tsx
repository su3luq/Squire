'use client';

import { Flame, ShieldCheck, Zap } from 'lucide-react';
import { GoalRing } from './goal-ring';
import { NextReviewCountdown } from '@/components/next-review-countdown';
import type { HeroData } from './types';

// The gamified review command zone. Loss-aversion (streak), goal-gradient
// (daily-goal ring), and reward (XP) framing, with a big Zap CTA that
// takes over the page in place. Calm "all caught up" state when nothing's
// due. State copy mirrors the daily-review-goal logic used on the home.

export function ReviewHero({
  dueCount,
  reviewsToday,
  dailyGoal,
  nextDueAt,
  streakDays,
  streakStatus,
  onStart,
}: HeroData & { onStart: () => void }) {
  const hasStreak = streakStatus === 'alive_today' || streakStatus === 'in_danger';
  const remaining = Math.max(0, dailyGoal - reviewsToday);
  const caughtUp = dueCount === 0;

  const kick = caughtUp
    ? hasStreak
      ? `${streakDays}-day streak · safe`
      : 'All clear'
    : streakStatus === 'in_danger'
      ? `Streak at risk · keep your ${streakDays}-day streak`
      : hasStreak
        ? `${streakDays}-day streak · don't break it`
        : 'Start your streak today';

  const title = caughtUp ? 'All caught up' : `${dueCount} cards ready`;

  const meta = caughtUp ? (
    nextDueAt ? (
      <>
        Next review <NextReviewCountdown dueAt={nextDueAt} /> · read any card
        below
      </>
    ) : (
      'Nothing due right now — read any card below.'
    )
  ) : (
    <>
      Sharpen your memory · <span className="tabular-nums">+{dueCount * 5}</span>{' '}
      XP{remaining > 0 ? <> · {remaining} to hit today&apos;s goal</> : null}
    </>
  );

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-primary/40 p-5 shadow-[0_0_40px_-12px_rgba(204,126,81,0.3)] sm:p-6"
      style={{
        background:
          'radial-gradient(130% 150% at 0% 0%, color-mix(in oklch, var(--primary) 18%, transparent), transparent 55%)',
      }}
    >
      <div className="flex flex-col items-stretch gap-5 sm:flex-row sm:items-center">
        <GoalRing
          value={Math.min(reviewsToday, dailyGoal)}
          goal={dailyGoal}
          className="self-center"
        />

        <div className="flex-1 self-center text-center sm:text-left">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary/90">
            <Flame className="h-3.5 w-3.5" aria-hidden />
            {kick}
          </span>
          <h2 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
        </div>

        {caughtUp ? (
          <div className="flex flex-col items-center justify-center gap-1 self-center rounded-xl border border-border bg-card/70 px-6 py-4 text-center sm:w-48 sm:self-stretch">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
            <span className="text-sm font-semibold">Caught up</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStart}
            className="rl-shine relative flex w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-primary px-6 py-3.5 text-primary-foreground shadow-[0_0_0_1px_var(--primary),0_12px_30px_-8px_rgba(204,126,81,0.5)] transition-transform hover:-translate-y-0.5 sm:w-48 sm:self-stretch"
          >
            <Zap className="h-6 w-6" aria-hidden />
            <span className="text-base font-extrabold">Start review</span>
            <span className="text-[10px] font-semibold opacity-80">
              defend your streak
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
