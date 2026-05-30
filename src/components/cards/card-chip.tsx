import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { CardChipData } from './types';

// A single readable card tile. Links to the reader (intercepting modal on
// click, full page on deep-link). Due cards carry a bronze flag + border;
// everything else stays calm.

export function CardChip({
  card,
  className,
}: {
  card: CardChipData;
  className?: string;
}) {
  return (
    <Link
      href={`/student/cards/${card.id}`}
      scroll={false}
      className={cn(
        'group relative flex min-h-[3.75rem] flex-col justify-between rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40',
        card.due ? 'border-primary/60' : 'border-border',
        className,
      )}
    >
      {card.due && (
        <span className="absolute right-2.5 top-2.5 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
          Due
        </span>
      )}
      <p className="pr-10 text-sm font-medium leading-snug">{card.headline}</p>
      <p className="mt-1 text-xs text-muted-foreground group-hover:text-primary">
        Tap to read →
      </p>
    </Link>
  );
}
