'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

type QuestType = 'all' | 'solo' | 'coop';

const OPTIONS: { value: QuestType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'solo', label: 'Solo' },
  { value: 'coop', label: 'Co-op' },
];

interface QuestFilterChipsProps {
  soloAvailable: number;
  coopAvailable: number;
}

/**
 * Pill chips that toggle the ?type= search param above the student
 * quest board. Server reads ?type= and renders the matching section(s).
 */
export function QuestFilterChips({
  soloAvailable,
  coopAvailable,
}: QuestFilterChipsProps) {
  const search = useSearchParams();
  const current = (search.get('type') ?? 'all') as QuestType;

  function buildHref(next: QuestType): string {
    const params = new URLSearchParams(search.toString());
    if (next === 'all') params.delete('type');
    else params.set('type', next);
    const qs = params.toString();
    return qs ? `/student/quests?${qs}` : '/student/quests';
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {OPTIONS.map((o) => {
        const active = o.value === current;
        const count =
          o.value === 'all'
            ? soloAvailable + coopAvailable
            : o.value === 'solo'
              ? soloAvailable
              : coopAvailable;
        return (
          <Link
            key={o.value}
            href={buildHref(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-foreground text-background'
                : 'border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {o.label}
            <span
              className={cn(
                'rounded-full px-1.5 text-[10px] tabular-nums',
                active ? 'bg-background/20' : 'bg-muted/80',
              )}
            >
              {count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
