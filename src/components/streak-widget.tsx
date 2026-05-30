import Link from 'next/link';
import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EffectiveStreak } from '@/lib/streak';

interface StreakWidgetProps {
  streak: EffectiveStreak;
  variant?: 'sidebar-full' | 'sidebar-icon' | 'inline';
  className?: string;
}

/**
 * Persistent streak indicator: flame icon + day count, with tone
 * shifting based on whether the streak is alive, at risk, or broken.
 * Lives in the student sidebar (full + icon variants) and on the home
 * page (inline variant) so the student sees the streak everywhere they
 * land — the entire dopamine point of habit-forming streaks.
 *
 * Clicks through to /student/review since reviewing is what protects it.
 */
export function StreakWidget({
  streak,
  variant = 'sidebar-full',
  className,
}: StreakWidgetProps) {
  const danger = streak.status === 'in_danger';
  const alive = streak.status === 'alive_today';
  const hidden = streak.status === 'broken' || streak.status === 'none';

  if (variant === 'sidebar-icon') {
    return (
      <Link
        href="/student/cards"
        title={
          alive
            ? `${streak.days}-day streak`
            : danger
              ? `${streak.days}-day streak — at risk today`
              : 'Start your streak'
        }
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors',
          alive &&
            'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:hover:bg-amber-900/60',
          danger &&
            'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:hover:bg-orange-900/60',
          hidden && 'bg-muted text-muted-foreground hover:bg-muted/70',
          className,
        )}
      >
        <Flame className="h-4 w-4" aria-hidden />
        {!hidden && (
          <span className="sr-only">
            {streak.days}-day streak{danger ? ', at risk' : ''}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      href="/student/cards"
      className={cn(
        'group inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
        variant === 'sidebar-full' && 'w-full justify-start',
        alive &&
          'bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:hover:bg-amber-900/60',
        danger &&
          'bg-orange-100 text-orange-900 hover:bg-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:hover:bg-orange-900/60',
        hidden && 'bg-muted text-muted-foreground hover:bg-muted/70',
        className,
      )}
      aria-label={
        alive
          ? `${streak.days}-day streak alive`
          : danger
            ? `${streak.days}-day streak at risk — review today to keep it`
            : 'No active streak'
      }
    >
      <Flame
        className={cn(
          'h-4 w-4 shrink-0',
          alive && 'fill-amber-500 text-amber-600 dark:fill-amber-400 dark:text-amber-300',
          danger && 'fill-orange-400 text-orange-600 dark:fill-orange-400 dark:text-orange-300',
        )}
        aria-hidden
      />
      {hidden ? (
        <span>Start your streak</span>
      ) : (
        <span className="tabular-nums">
          {streak.days} {streak.days === 1 ? 'day' : 'days'}
          {danger && (
            <span className="ml-1 font-normal opacity-80">· today?</span>
          )}
        </span>
      )}
    </Link>
  );
}
