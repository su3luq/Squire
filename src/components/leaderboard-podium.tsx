import Link from 'next/link';
import { Crown, Medal } from 'lucide-react';
import { Avatar } from '@/components/avatar';
import { cn } from '@/lib/utils';
import type { RingConfig } from '@/lib/ranks-config';

export type PodiumRow = {
  id: string;
  full_name: string;
  xp_total: number;
  current_rank: number | null;
  avatar_url: string | null;
  class_id: string | null;
  ringConfig: RingConfig | null;
};

interface LeaderboardPodiumProps {
  rows: PodiumRow[]; // ordered [1st, 2nd, 3rd]
  viewerId: string;
  /** When true, names link to the teacher's student detail. */
  linkAsTeacher?: boolean;
  className?: string;
}

// Light-mode uses soft pastel washes into transparent. Dark mode needs
// more saturation against the dark shell — the silver in particular
// disappears against neutral charcoal in light-mode pastel form, so
// dark variants step down lightness and up saturation.
const PLACE_GRADIENT = {
  1: 'from-amber-300/60 via-amber-200/40 to-transparent dark:from-amber-500/30 dark:via-amber-400/15 dark:to-transparent',
  2: 'from-slate-300/60 via-slate-200/40 to-transparent dark:from-slate-400/30 dark:via-slate-300/15 dark:to-transparent',
  3: 'from-orange-300/60 via-orange-200/40 to-transparent dark:from-orange-500/30 dark:via-orange-400/15 dark:to-transparent',
} as const;

const PLACE_ICON_COLOR = {
  1: 'text-amber-500 dark:text-amber-400',
  2: 'text-slate-500 dark:text-slate-400',
  3: 'text-orange-600 dark:text-orange-400',
} as const;

/**
 * Top-3 podium displayed above the leaderboard list. 1st in the center
 * (slightly taller), 2nd to the left, 3rd to the right. Stacks vertically
 * on narrow viewports with 1st still first.
 *
 * Each podium tile pairs the avatar (with its rank ring already wired)
 * against a soft tier-tinted background, with a crown / medal icon, the
 * student's name, and XP.
 */
export function LeaderboardPodium({
  rows,
  viewerId,
  linkAsTeacher = false,
  className,
}: LeaderboardPodiumProps) {
  if (rows.length === 0) return null;
  const first = rows[0];
  const second = rows[1] ?? null;
  const third = rows[2] ?? null;

  return (
    <section
      aria-label="Top 3 leaderboard"
      className={cn(
        'grid gap-3 sm:grid-cols-3 sm:items-end',
        className,
      )}
    >
      {second && (
        <PodiumTile
          place={2}
          row={second}
          isViewer={second.id === viewerId}
          linkAsTeacher={linkAsTeacher}
        />
      )}
      <PodiumTile
        place={1}
        row={first}
        isViewer={first.id === viewerId}
        linkAsTeacher={linkAsTeacher}
        emphasised
      />
      {third && (
        <PodiumTile
          place={3}
          row={third}
          isViewer={third.id === viewerId}
          linkAsTeacher={linkAsTeacher}
        />
      )}
    </section>
  );
}

function PodiumTile({
  place,
  row,
  isViewer,
  linkAsTeacher,
  emphasised = false,
}: {
  place: 1 | 2 | 3;
  row: PodiumRow;
  isViewer: boolean;
  linkAsTeacher: boolean;
  emphasised?: boolean;
}) {
  const inner = (
    <div
      className={cn(
        'relative flex flex-col items-center gap-2 overflow-hidden rounded-2xl border border-border bg-card p-4 text-center transition-colors',
        emphasised ? 'sm:pt-6 sm:pb-5' : 'sm:pt-4',
        isViewer && 'ring-2 ring-primary/40',
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b',
          PLACE_GRADIENT[place],
        )}
        aria-hidden
      />
      <span
        className={cn(
          'relative inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider',
          PLACE_ICON_COLOR[place],
        )}
      >
        {place === 1 ? (
          <Crown className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Medal className="h-3.5 w-3.5" aria-hidden />
        )}
        #{place}
      </span>
      <div className="relative">
        <Avatar
          url={row.avatar_url}
          name={row.full_name}
          size={emphasised ? 'lg' : 'md'}
          rank={row.current_rank}
          ringConfig={row.ringConfig}
        />
      </div>
      <p
        className={cn(
          'relative truncate text-sm font-semibold',
          emphasised && 'text-base',
        )}
      >
        {row.full_name}
      </p>
      <p className="relative text-xs tabular-nums text-muted-foreground">
        <span className="font-semibold text-foreground">
          {row.xp_total.toLocaleString()}
        </span>{' '}
        XP
      </p>
      {isViewer && (
        <span className="relative rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
          you
        </span>
      )}
    </div>
  );

  if (linkAsTeacher && row.class_id) {
    return (
      <Link
        href={`/teacher/classes/${row.class_id}/students/${row.id}`}
        className="block transition-transform hover:-translate-y-0.5"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}
