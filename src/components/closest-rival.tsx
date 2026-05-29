import Link from 'next/link';
import { ArrowUp, Crown, Trophy } from 'lucide-react';
import { Avatar } from '@/components/avatar';
import { cn } from '@/lib/utils';
import type { RingConfig } from '@/lib/ranks-config';

export type RivalRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  xp_total: number;
  current_rank: number | null;
  class_id: string | null;
  ringConfig: RingConfig | null;
};

interface ClosestRivalProps {
  viewerXp: number;
  viewerPosition: number;
  rivalAbove: RivalRow | null;
  rivalBelow: RivalRow | null;
  /** Average XP per quest pass, used to frame the gap. Optional. */
  averageQuestXp?: number;
  className?: string;
}

/**
 * Compact "who's ahead of you" widget for the student home + leaderboard.
 * Frames the gap as motivation ("60 XP behind — 1 quest pass") rather than
 * a static ranking number. For #1, flips to "defend your spot" framing.
 */
export function ClosestRival({
  viewerXp,
  viewerPosition,
  rivalAbove,
  rivalBelow,
  averageQuestXp = 50,
  className,
}: ClosestRivalProps) {
  // #1 framing — defend
  if (viewerPosition === 1) {
    if (!rivalBelow) {
      return (
        <article
          className={cn(
            'rounded-xl border border-border bg-card p-4',
            className,
          )}
        >
          <header className="flex items-center gap-2 text-sm font-semibold">
            <Crown className="h-4 w-4 text-amber-500" aria-hidden />
            #1 — uncontested
          </header>
          <p className="mt-1 text-xs text-muted-foreground">
            No one else on the board yet. Defend your spot when they show up.
          </p>
        </article>
      );
    }
    const gap = viewerXp - rivalBelow.xp_total;
    return (
      <article
        className={cn(
          'rounded-xl border border-border bg-card p-4',
          className,
        )}
      >
        <header className="flex items-center gap-2 text-sm font-semibold">
          <Crown className="h-4 w-4 text-amber-500" aria-hidden />
          Holding #1
        </header>
        <div className="mt-2 flex items-center gap-3">
          <Avatar
            url={rivalBelow.avatar_url}
            name={rivalBelow.full_name}
            size="md"
            rank={rivalBelow.current_rank}
            ringConfig={rivalBelow.ringConfig}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {rivalBelow.full_name}
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">
                {gap.toLocaleString()}
              </span>{' '}
              XP behind
            </p>
          </div>
        </div>
      </article>
    );
  }

  // No rival above somehow (data anomaly) — render nothing.
  if (!rivalAbove) return null;

  const gap = rivalAbove.xp_total - viewerXp;
  const questsAway = Math.max(1, Math.ceil(gap / Math.max(1, averageQuestXp)));

  return (
    <article
      className={cn(
        'rounded-xl border border-border bg-card p-4',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Trophy className="h-4 w-4 text-primary" aria-hidden />
          Closest rival
        </div>
        <Link
          href="/leaderboard"
          className="text-xs font-medium text-primary hover:underline"
        >
          Climb →
        </Link>
      </header>
      <div className="mt-2 flex items-center gap-3">
        <Avatar
          url={rivalAbove.avatar_url}
          name={rivalAbove.full_name}
          size="md"
          rank={rivalAbove.current_rank}
          ringConfig={rivalAbove.ringConfig}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{rivalAbove.full_name}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowUp className="h-3 w-3" aria-hidden />
            <span className="font-semibold tabular-nums text-foreground">
              {gap.toLocaleString()}
            </span>{' '}
            XP to pass
          </p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {questsAway === 1
          ? '~1 quest pass away.'
          : `~${questsAway} quest passes away.`}
      </p>
    </article>
  );
}
