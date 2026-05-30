import { BookOpen, Sword, Sparkles, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WinRow = {
  id: string;
  amount: number;
  reason: string;
  created_at: string;
};

interface RecentWinsProps {
  rows: WinRow[];
  className?: string;
}

type WinKind = 'review' | 'solo' | 'coop' | 'other';

/**
 * Match-history style feed: the student's last few XP awards rendered
 * in chronological order. Gives the student visible proof their grinding
 * is producing rewards, the way a ranked-game post-match screen does.
 */
export function RecentWins({ rows, className }: RecentWinsProps) {
  if (rows.length === 0) return null;
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-card',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">Recent wins</h2>
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          last 5
        </span>
      </header>
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const kind = classifyReason(r.reason);
          const Icon = ICONS[kind];
          return (
            <li
              key={r.id}
              className="flex items-center gap-3 px-5 py-3 text-sm"
            >
              <span
                className={cn(
                  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  TONE_BG[kind],
                )}
                aria-hidden
              >
                <Icon className={cn('h-4 w-4', TONE_FG[kind])} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {LABEL[kind]}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {formatRelative(r.created_at)}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
                +{r.amount}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const ICONS: Record<WinKind, LucideIcon> = {
  review: BookOpen,
  solo: Sword,
  coop: Users,
  other: Sparkles,
};

const TONE_BG: Record<WinKind, string> = {
  review: 'bg-primary/10 dark:bg-primary/15',
  solo: 'bg-amber-100 dark:bg-amber-950/50',
  coop: 'bg-violet-100 dark:bg-violet-950/50',
  other: 'bg-muted',
};

const TONE_FG: Record<WinKind, string> = {
  review: 'text-primary',
  solo: 'text-amber-700 dark:text-amber-300',
  coop: 'text-violet-700 dark:text-violet-300',
  other: 'text-muted-foreground',
};

const LABEL: Record<WinKind, string> = {
  review: 'Correct review',
  solo: 'Solo quest passed',
  coop: 'Co-op quest passed',
  other: 'XP awarded',
};

function classifyReason(reason: string): WinKind {
  const r = reason.toLowerCase();
  if (r.includes('review')) return 'review';
  if (r.includes('coop')) return 'coop';
  if (r.includes('solo') || r === 'quest_passed') return 'solo';
  return 'other';
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  if (diffMs < 60_000) return 'just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}
