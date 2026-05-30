'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardTile } from './card-tile';
import { NeedsChip, UnlockChip, RecallChip } from './status-bits';
import type { LessonRow } from './types';

export function LessonGroup({ lesson, defaultOpen }: { lesson: LessonRow; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn('overflow-hidden rounded-2xl border bg-card', lesson.needsCount > 0 ? 'border-amber-300/40 dark:border-amber-800/40' : 'border-border')}>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-left" aria-expanded={open}>
          <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-90')} />
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">L{lesson.lessonNumber}</span>
          <span className="text-sm font-semibold">{lesson.title}</span>
        </button>
        <span className="text-xs text-muted-foreground"><span className="tabular-nums">{lesson.cards.length}</span> cards</span>
        <RecallChip recall={lesson.recall} />
        <NeedsChip count={lesson.needsCount} />
        <Link href={`/teacher/cards/${lesson.id}`} title="Manage / unlock" className="inline-flex items-center"><UnlockChip count={lesson.unlockCount} /></Link>
        <Link href={`/teacher/cards/${lesson.id}/cards/new`} aria-label={`Add a card to ${lesson.title}`} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted">
          <Plus className="h-3.5 w-3.5" /> Add card
        </Link>
      </div>
      {open && (
        <div className="grid grid-cols-1 gap-2 p-4 pt-0 sm:grid-cols-2 lg:grid-cols-3">
          {lesson.cards.map((c) => <CardTile key={c.id} lessonId={lesson.id} card={c} />)}
          <Link href={`/teacher/cards/${lesson.id}/cards/new`} className="flex min-h-[4.5rem] items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
            <Plus className="h-4 w-4" /> Add card
          </Link>
        </div>
      )}
    </div>
  );
}
