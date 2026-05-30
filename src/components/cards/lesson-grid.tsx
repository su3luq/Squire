'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusChip } from '@/components/status-chip';
import { CardChip } from './card-chip';
import type { LessonData } from './types';

// The whole unlocked course as a grid of lesson "folders." Clicking a
// folder expands its cards in a panel below the grid (one open at a time),
// keeping everything on one URL. Scales to dozens of lessons without an
// endless flat card grid.

export function LessonGrid({ lessons }: { lessons: LessonData[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = lessons.find((l) => l.id === openId) ?? null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {lessons.map((lesson) => (
          <LessonFolder
            key={lesson.id}
            lesson={lesson}
            open={lesson.id === openId}
            onToggle={() =>
              setOpenId((cur) => (cur === lesson.id ? null : lesson.id))
            }
          />
        ))}
      </div>

      {open && (
        <div className="rounded-2xl border border-border bg-muted/20 p-4">
          <h4 className="mb-3 text-sm font-semibold">
            Lesson <span className="tabular-nums">{open.lessonNumber}</span> —{' '}
            {open.title}
          </h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {open.cards.map((card) => (
              <CardChip key={card.id} card={card} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LessonFolder({
  lesson,
  open,
  onToggle,
}: {
  lesson: LessonData;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        'rounded-2xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40',
        open ? 'border-primary/50' : 'border-border',
        lesson.dueCount > 0 && 'shadow-[inset_3px_0_0_var(--primary)]',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold tabular-nums text-muted-foreground">
          L{lesson.lessonNumber}
        </span>
        <MiniRing value={lesson.mastery} />
      </div>
      <h4 className="flex items-center gap-1 text-[0.95rem] font-semibold leading-tight">
        {lesson.title}
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </h4>
      <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{lesson.cards.length} cards</span>
        {lesson.dueCount > 0 && (
          <StatusChip tone="good">
            <span className="tabular-nums">{lesson.dueCount}</span> due
          </StatusChip>
        )}
      </p>
    </button>
  );
}

function MiniRing({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      className="grid h-7 w-7 place-items-center rounded-full"
      style={
        {
          background: `conic-gradient(var(--primary) ${pct * 3.6}deg, var(--muted) 0)`,
        } as CSSProperties
      }
      aria-hidden
    >
      <span className="grid h-[1.35rem] w-[1.35rem] place-items-center rounded-full bg-card text-[0.5rem] tabular-nums text-muted-foreground">
        {pct}%
      </span>
    </div>
  );
}
