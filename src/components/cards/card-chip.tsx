import { cn } from '@/lib/utils';
import { StatusChip } from '@/components/status-chip';
import { GridTile } from '@/components/ui/grid-tile';
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
    <GridTile
      href={`/student/cards/${card.id}`}
      scroll={false}
      className={cn('group relative', className)}
    >
      {card.due && (
        <span className="absolute right-2.5 top-2.5">
          <StatusChip tone="good">Due</StatusChip>
        </span>
      )}
      <p className="pr-10 text-sm font-medium leading-snug line-clamp-2">{card.headline}</p>
      <p className="mt-1 text-xs text-muted-foreground group-hover:text-primary">
        Tap to read →
      </p>
    </GridTile>
  );
}
