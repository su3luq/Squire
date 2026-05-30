import Link from 'next/link';
import { Plus } from 'lucide-react';
import { LessonGroup } from './lesson-group';
import type { LessonRow } from './types';

export function CardsWorkspace({
  lessons, totalCards, unlockedLessons, newLessonHref,
}: { lessons: LessonRow[]; totalCards: number; unlockedLessons: number; newLessonHref: string }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/[0.09] to-primary/[0.02] p-4">
        <div className="flex flex-wrap gap-6">
          <Stat n={totalCards} label="Cards" />
          <Stat n={lessons.length} label="Lessons" />
          <Stat n={unlockedLessons} label="Unlocked" />
        </div>
        <Link href={newLessonHref} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90">
          <Plus className="h-4 w-4" /> New lesson
        </Link>
      </div>
      {lessons.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No lessons yet. Create your first lesson to start adding cards.</p>
      ) : (
        lessons.map((l, i) => <LessonGroup key={l.id} lesson={l} defaultOpen={i === 0} />)
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-lg font-bold tabular-nums">{n}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}
