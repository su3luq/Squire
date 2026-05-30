import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusChip, type ChipTone } from '@/components/status-chip';
import type { RecallStat } from '@/lib/recall';

export function NeedsChip({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <StatusChip tone="warn">
      <AlertTriangle className="size-3" aria-hidden />
      <span className="tabular-nums">{count}</span> needs a question
    </StatusChip>
  );
}

export function UnlockChip({ count }: { count: number }) {
  return count > 0 ? (
    <StatusChip tone="good">
      Unlocked ×<span className="tabular-nums">{count}</span>
    </StatusChip>
  ) : (
    <StatusChip tone="muted">Draft · not unlocked</StatusChip>
  );
}

const RECALL_TONE: Record<RecallStat['tier'], ChipTone> = {
  good: 'good',
  mid: 'muted',
  low: 'warn',
  none: 'muted',
};

export function RecallChip({ recall }: { recall: RecallStat }) {
  return (
    <StatusChip tone={RECALL_TONE[recall.tier]}>
      <span className="font-semibold opacity-80">Recall</span>
      <span className="tabular-nums">
        {recall.pct === null ? '—' : `${recall.pct}%`}
      </span>
    </StatusChip>
  );
}

export function CardStatus({
  questionCount,
  recall,
}: {
  questionCount: number;
  recall: RecallStat;
}) {
  const live = questionCount > 0;
  return (
    <div className="flex items-center justify-between">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wide',
          live ? 'text-primary' : 'text-amber-600 dark:text-amber-400',
        )}
      >
        {live ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Live ·{' '}
            <span className="tabular-nums">{questionCount}</span> Q
          </>
        ) : (
          <>
            <AlertTriangle className="h-3 w-3" /> Needs a question
          </>
        )}
      </span>
      <span
        className={cn(
          'text-[10px] font-bold tabular-nums',
          recall.tier === 'good' && 'text-primary',
          recall.tier === 'low' && 'text-amber-600 dark:text-amber-400',
          (recall.tier === 'mid' || recall.tier === 'none') &&
            'text-muted-foreground',
        )}
      >
        {recall.pct === null ? '—' : `${recall.pct}%`}
      </span>
    </div>
  );
}
