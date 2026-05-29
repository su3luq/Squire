import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { RankEmblem } from '@/components/rank-emblem';
import { Progress } from '@/components/ui/progress';
import type { RankProgress } from '@/lib/ranks-config';
import { cn } from '@/lib/utils';

interface RankHeroProps {
  fullName: string;
  xp: number;
  tier: number;
  progress: RankProgress;
  className?: string;
}

/**
 * Hero card for the student home. The student's rank emblem is the
 * centerpiece — not a number buried in a subtitle. Surfaces XP-to-next
 * prominently and previews the next emblem to climb toward, so every
 * visit reinforces the ladder.
 *
 * For top-rank students the framing flips from "climb" to "defend".
 */
export function RankHero({
  fullName,
  xp,
  tier,
  progress,
  className,
}: RankHeroProps) {
  const atTop = progress.next === null;
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-card p-5 sm:p-6',
        className,
      )}
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-stretch sm:gap-6">
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <RankEmblem
            tier={tier}
            rank={progress.current}
            size="xl"
            pulse={atTop}
          />
          {progress.current?.name && (
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {progress.current.name}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center text-center sm:text-left">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {atTop ? 'Top rank' : `Rank ${tier}`}
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
            {fullName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">
              {xp.toLocaleString()}
            </span>{' '}
            XP earned
          </p>

          {atTop ? (
            <p className="mt-3 text-sm font-medium text-primary">
              Top rank reached — defend your spot.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-foreground">
                  <span className="font-semibold tabular-nums">
                    {progress.xpToNext.toLocaleString()}
                  </span>{' '}
                  XP to Rank {progress.next?.tier ?? '?'}
                </p>
                {progress.next && (
                  <div className="flex items-center gap-1.5">
                    <ArrowUpRight
                      className="h-3.5 w-3.5 text-muted-foreground"
                      aria-hidden
                    />
                    <RankEmblem
                      tier={progress.next.tier}
                      rank={progress.next}
                      size="xs"
                    />
                  </div>
                )}
              </div>
              <Progress
                value={Math.round(progress.progress * 100)}
                aria-label={`${Math.round(progress.progress * 100)}% to next rank`}
              />
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:justify-start">
            <Link
              href="/leaderboard"
              className="font-medium text-primary hover:underline"
            >
              See leaderboard →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
