import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecallStat } from '@/lib/recall';

// All header tags share one height/shape so their tops + bottoms line up
// (not just their centers) — keeps the lesson-header chip row clean.
const CHIP = 'inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold leading-none';

export function NeedsChip({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className={cn(CHIP, 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300')}>
      <AlertTriangle className="h-3 w-3" aria-hidden />
      <span className="tabular-nums">{count}</span> needs a question
    </span>
  );
}

export function UnlockChip({ count }: { count: number }) {
  return count > 0 ? (
    <span className={cn(CHIP, 'bg-primary/15 text-primary')}>
      Unlocked ×<span className="tabular-nums">{count}</span>
    </span>
  ) : (
    <span className={cn(CHIP, 'bg-muted text-muted-foreground')}>
      Draft · not unlocked
    </span>
  );
}

const RECALL_TONE: Record<RecallStat['tier'], string> = {
  good: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  mid: 'bg-muted text-muted-foreground',
  low: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  none: 'bg-muted text-muted-foreground',
};

export function RecallChip({ recall }: { recall: RecallStat }) {
  return (
    <span className={cn(CHIP, 'gap-1.5', RECALL_TONE[recall.tier])}>
      <span className="font-semibold opacity-80">Recall</span>
      <span className="tabular-nums">{recall.pct === null ? '—' : `${recall.pct}%`}</span>
    </span>
  );
}

export function CardStatus({ questionCount, recall }: { questionCount: number; recall: RecallStat }) {
  const live = questionCount > 0;
  return (
    <div className="flex items-center justify-between">
      <span className={cn('inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wide', live ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
        {live ? (
          <><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" /> Live · <span className="tabular-nums">{questionCount}</span> Q</>
        ) : (
          <><AlertTriangle className="h-3 w-3" /> Needs a question</>
        )}
      </span>
      <span className={cn('text-[10px] font-bold tabular-nums', recall.tier === 'good' && 'text-emerald-600 dark:text-emerald-400', recall.tier === 'low' && 'text-amber-600 dark:text-amber-400', (recall.tier === 'mid' || recall.tier === 'none') && 'text-muted-foreground')}>
        {recall.pct === null ? '—' : `${recall.pct}%`}
      </span>
    </div>
  );
}
