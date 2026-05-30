# Teacher Cards Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the teacher "Lessons" surface to "Cards" and rebuild authoring into a scannable workspace (lessons-as-groups, actionable command zone, per-lesson needs-a-question + Recall signals) plus a focused, themed card editor.

**Architecture:** Next.js App Router (RSC) + Supabase. Move `src/app/teacher/lessons/**` → `src/app/teacher/cards/**` with redirects; the workspace is a server page feeding a small client component for collapse state; the editor is the existing RHF+zod form, restyled and re-laid-out. One new read-only Postgres view (`card_recall_stats`) powers the Recall metric.

**Tech Stack:** Next.js 16 RSC, TypeScript, Tailwind v4 (theme tokens), shadcn/ui, react-hook-form + zod, Supabase (RLS + a security_invoker view), MDXEditor.

**Spec:** `docs/superpowers/specs/2026-05-30-teacher-cards-authoring-design.md`

**Validation model (this repo):** no unit-test runner. Each task verifies with `npm run typecheck` (exit 0), `npm run lint` (0 errors), and where UI is involved a browser smoke as a **teacher** (`scudway@gmail.com` / `rbih0000`) via the running dev server on `http://localhost:3000`. Commit after each task.

---

## File Structure

**New:**
- `supabase/migrations/055_card_recall_stats_view.sql` — the Recall aggregate view.
- `src/lib/recall.ts` — recall %, tier, and gating helpers (pure, reusable).
- `src/components/teacher-cards/types.ts` — workspace data shapes.
- `src/components/teacher-cards/cards-workspace.tsx` — client; command zone + collapsible groups.
- `src/components/teacher-cards/lesson-group.tsx` — one lesson group (header chips + card grid).
- `src/components/teacher-cards/card-tile.tsx` — one card chip (status + recall), links to editor.
- `src/components/teacher-cards/status-bits.tsx` — small shared chip atoms (Live/Needs/Unlocked/Draft/Recall).

**Moved (git mv) then rebuilt:**
- `src/app/teacher/lessons/**` → `src/app/teacher/cards/**`
- `cards/page.tsx` (rebuilt = workspace), `cards/[id]/page.tsx` (restyled lesson management), `cards/[id]/cards/card-editor-form.tsx` (rebuilt editor).

**Modified:**
- `next.config.ts` — redirects.
- `src/components/nav-items.ts` — teacher `lessons` → `cards`.
- `src/components/stat-card.tsx` — `tabular-nums` on the value.

---

## Task 1: Recall aggregate view (DB)

**Files:**
- Create: `supabase/migrations/055_card_recall_stats_view.sql`

- [ ] **Step 1: Draft the migration and get explicit approval**

Per the repo's HARD RULE, do NOT apply SQL without the user typing "approved". Present this SQL:

```sql
-- 055_card_recall_stats_view.sql
-- Per-card recall stats for the teacher Cards workspace difficulty signal.
-- security_invoker = true so review_attempts RLS still applies (teacher sees
-- all; nobody else can read others' attempts). Read-only aggregate.
create or replace view public.card_recall_stats
  with (security_invoker = true) as
  select card_id,
         count(*)::int                           as attempts,
         count(*) filter (where is_correct)::int as correct
  from public.review_attempts
  group by card_id;
```

- [ ] **Step 2: Apply after approval**

Apply via `mcp__claude_ai_Supabase__apply_migration` name `055_card_recall_stats_view`. Then write the SQL above to `supabase/migrations/055_card_recall_stats_view.sql`.

- [ ] **Step 3: Verify the view returns rows and respects RLS**

Run (read-only) `select * from card_recall_stats limit 5;` — expect `card_id, attempts, correct` rows. Run `get_advisors type=security` — expect no new ERROR-level lint for the view (security_invoker views are fine).

- [ ] **Step 4: Regenerate types**

Use `mcp__claude_ai_Supabase__generate_typescript_types`, write to `src/lib/database.types.ts`. Confirm `card_recall_stats` appears under `Views`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/055_card_recall_stats_view.sql src/lib/database.types.ts
git commit -m "db: card_recall_stats view for teacher recall metric (migration 055)"
```

---

## Task 2: Recall helper (pure logic)

**Files:**
- Create: `src/lib/recall.ts`

- [ ] **Step 1: Write the helper**

```ts
// Recall = % of review-question answers correct. Used by the teacher Cards
// workspace as a "what content is hard" signal. Gated below MIN_ATTEMPTS so
// a tiny sample can't mislead.
export const MIN_RECALL_ATTEMPTS = 8;

export type RecallTier = 'good' | 'mid' | 'low' | 'none';

export type RecallStat = {
  /** 0..100, or null when below the attempts gate. */
  pct: number | null;
  tier: RecallTier;
  attempts: number;
};

export function computeRecall(attempts: number, correct: number): RecallStat {
  if (attempts < MIN_RECALL_ATTEMPTS) {
    return { pct: null, tier: 'none', attempts };
  }
  const pct = Math.round((correct / attempts) * 100);
  const tier: RecallTier = pct >= 80 ? 'good' : pct >= 60 ? 'mid' : 'low';
  return { pct, tier, attempts };
}
```

- [ ] **Step 2: Verify**

Run `npm run typecheck` — expect exit 0. (No call sites yet; this just type-checks.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/recall.ts
git commit -m "feat(cards): recall metric helper"
```

---

## Task 3: Design-language nudge — StatCard mono numbers

**Files:**
- Modify: `src/components/stat-card.tsx`

- [ ] **Step 1: Add `tabular-nums` to the value**

In `stat-card.tsx`, change the value paragraph:

```tsx
// from:
<p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
// to:
<p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
```

- [ ] **Step 2: Verify**

Run `npm run typecheck && npm run lint` — expect exit 0 / no new errors. (`tabular-nums` routes through the mono font globally, so teacher-dashboard stat numbers now match the app.)

- [ ] **Step 3: Commit**

```bash
git add src/components/stat-card.tsx
git commit -m "style: route StatCard numbers through tabular-nums (mono)"
```

---

## Task 4: Move routes lessons→cards, redirects, nav rename

**Files:**
- Move: `src/app/teacher/lessons/` → `src/app/teacher/cards/`
- Modify: `next.config.ts`, `src/components/nav-items.ts`

- [ ] **Step 1: Move the route folder (preserve git history)**

```bash
git mv src/app/teacher/lessons src/app/teacher/cards
```

- [ ] **Step 2: Fix internal route strings inside the moved tree**

Replace `'/teacher/lessons'` → `'/teacher/cards'` across `src/app/teacher/cards/**` (links, redirects in actions, back-links). Search:

Run: `grep -rn "teacher/lessons" src/app/teacher/cards`
Edit every hit to `teacher/cards`. (Includes `createCard`'s `redirect(\`/teacher/lessons/${lessonId}\`)` → `/teacher/cards/${lessonId}`, the `quickStartLesson`/new-lesson redirects, and back-links.)

- [ ] **Step 3: Add redirects so old URLs still resolve**

In `next.config.ts`, add to the `redirects()` array (alongside the existing student ones):

```ts
{ source: '/teacher/lessons', destination: '/teacher/cards', permanent: true },
{ source: '/teacher/lessons/:path*', destination: '/teacher/cards/:path*', permanent: true },
```

- [ ] **Step 4: Rename the nav entry**

In `src/components/nav-items.ts`, the teacher nav `lessons` entry becomes:

```ts
{ href: '/teacher/cards', label: 'Cards', icon: 'cards' },
```

(`cards` icon key already exists in `nav-icons.tsx` → `Layers`.)

- [ ] **Step 5: Verify**

Run `npm run typecheck && npm run lint` — exit 0. Then browser smoke: dev server up, log in as teacher, confirm nav shows **Cards**, `/teacher/cards` loads (old, not-yet-rebuilt page is fine here), and `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/teacher/lessons` returns `308`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(teacher): move lessons routes to /teacher/cards + redirects + nav rename"
```

---

## Task 5: Workspace data shapes + chips

**Files:**
- Create: `src/components/teacher-cards/types.ts`
- Create: `src/components/teacher-cards/status-bits.tsx`

- [ ] **Step 1: Types**

```ts
import type { RecallStat } from '@/lib/recall';

export type CardRow = {
  id: string;
  headline: string;
  questionCount: number;
  recall: RecallStat;
};

export type LessonRow = {
  id: string;
  lessonNumber: number;
  title: string;
  cards: CardRow[];
  needsCount: number;   // cards with 0 questions
  unlockCount: number;  // lesson_unlocks rows
  recall: RecallStat;   // lesson-aggregate recall
};
```

- [ ] **Step 2: Shared chip atoms (theme tokens only)**

```tsx
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecallStat } from '@/lib/recall';

export function NeedsChip({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
      <AlertTriangle className="h-3 w-3" aria-hidden />
      <span className="tabular-nums">{count}</span> needs a question
    </span>
  );
}

export function UnlockChip({ count }: { count: number }) {
  return count > 0 ? (
    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
      Unlocked ×<span className="tabular-nums">{count}</span>
    </span>
  ) : (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
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
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold', RECALL_TONE[recall.tier])}>
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
          <><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live · <span className="tabular-nums">{questionCount}</span> Q</>
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
```

> Note: emerald/amber literals are paired with `dark:` variants — allowed for semantic status chips per CLAUDE.md rule 19.

- [ ] **Step 3: Verify**

`npm run typecheck && npm run lint` — exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/teacher-cards/types.ts src/components/teacher-cards/status-bits.tsx
git commit -m "feat(cards): workspace types + status/recall chip atoms"
```

---

## Task 6: Workspace components (group + card tile + client shell)

**Files:**
- Create: `src/components/teacher-cards/card-tile.tsx`
- Create: `src/components/teacher-cards/lesson-group.tsx`
- Create: `src/components/teacher-cards/cards-workspace.tsx`

- [ ] **Step 1: Card tile**

```tsx
import Link from 'next/link';
import { CardStatus } from './status-bits';
import type { CardRow } from './types';

export function CardTile({ lessonId, card }: { lessonId: string; card: CardRow }) {
  return (
    <Link
      href={`/teacher/cards/${lessonId}/cards/${card.id}`}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <p className="text-sm font-medium leading-snug">{card.headline}</p>
      <CardStatus questionCount={card.questionCount} recall={card.recall} />
    </Link>
  );
}
```

- [ ] **Step 2: Lesson group (client — owns open/close)**

```tsx
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
        {/* unlock chip links to lesson management */}
        <Link href={`/teacher/cards/${lesson.id}`} title="Manage / unlock"><UnlockChip count={lesson.unlockCount} /></Link>
        <Link href={`/teacher/cards/${lesson.id}/cards/new`} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted">
          <Plus className="h-3.5 w-3.5" /> Add card
        </Link>
      </div>
      {open && (
        <div className="grid grid-cols-1 gap-2 p-4 pt-0 sm:grid-cols-2 lg:grid-cols-3">
          {lesson.cards.map((c) => <CardTile key={c.id} lessonId={lesson.id} card={c} />)}
          <Link href={`/teacher/cards/${lesson.id}/cards/new`} className="flex min-h-[3.5rem] items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
            <Plus className="h-4 w-4" /> Add card
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Workspace shell (command zone + groups)**

```tsx
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
```

- [ ] **Step 4: Verify**

`npm run typecheck && npm run lint` — exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/teacher-cards/
git commit -m "feat(cards): teacher workspace components (group, tile, command zone)"
```

---

## Task 7: Workspace page (data → components)

**Files:**
- Modify (rewrite): `src/app/teacher/cards/page.tsx`
- Reference: `src/app/teacher/cards/actions.ts` (existing `quickStartLesson` / new-lesson action — reuse for "New lesson")

- [ ] **Step 1: Replace the lessons-list page with the workspace**

```tsx
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { CardsWorkspace } from '@/components/teacher-cards/cards-workspace';
import { computeRecall } from '@/lib/recall';
import type { LessonRow } from '@/components/teacher-cards/types';

export const dynamic = 'force-dynamic';

export default async function TeacherCardsPage() {
  const supabase = await createClient();

  const [{ data: lessonsRaw }, { data: recallRows }] = await Promise.all([
    supabase
      .from('lessons')
      .select('id, title, lesson_number, review_cards(id, headline, position, card_quiz_questions(count)), lesson_unlocks(class_id)')
      .order('lesson_number', { ascending: false }),
    supabase.from('card_recall_stats').select('card_id, attempts, correct'),
  ]);

  const recallByCard = new Map(
    (recallRows ?? []).map((r) => [r.card_id, { attempts: r.attempts ?? 0, correct: r.correct ?? 0 }]),
  );

  let totalCards = 0;
  let unlockedLessons = 0;

  const lessons: LessonRow[] = (lessonsRaw ?? []).map((l) => {
    const cards = (l.review_cards ?? [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((c) => {
        const r = recallByCard.get(c.id) ?? { attempts: 0, correct: 0 };
        // PostgREST returns nested count as [{ count }]
        const questionCount = Array.isArray(c.card_quiz_questions)
          ? (c.card_quiz_questions[0]?.count ?? 0)
          : 0;
        return { id: c.id, headline: c.headline, questionCount, recall: computeRecall(r.attempts, r.correct) };
      });
    totalCards += cards.length;
    const unlockCount = l.lesson_unlocks?.length ?? 0;
    if (unlockCount > 0) unlockedLessons += 1;
    // lesson-aggregate recall
    let agA = 0, agC = 0;
    for (const c of cards) {
      const r = recallByCard.get(c.id);
      if (r) { agA += r.attempts; agC += r.correct; }
    }
    return {
      id: l.id, lessonNumber: l.lesson_number, title: l.title, cards,
      needsCount: cards.filter((c) => c.questionCount === 0).length,
      unlockCount, recall: computeRecall(agA, agC),
    };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Cards" subtitle="Author cards, group them into lessons, unlock each lesson per class." />
      <CardsWorkspace
        lessons={lessons}
        totalCards={totalCards}
        unlockedLessons={unlockedLessons}
        newLessonHref="/teacher/cards/new"
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify the `card_quiz_questions(count)` shape**

Run a quick check in the dev server logs / a scratch query: confirm nested count returns `[{ count: N }]`. If the generated type for the nested count differs, adjust the `questionCount` extraction accordingly (it's the one fragile spot).

- [ ] **Step 3: Verify**

`npm run typecheck && npm run lint` — exit 0. Browser smoke as teacher: `/teacher/cards` shows the command zone (Cards/Lessons/Unlocked), lesson groups with Recall + needs chips, cards expand, "Add card" + "New lesson" links resolve.

- [ ] **Step 4: Commit**

```bash
git add src/app/teacher/cards/page.tsx
git commit -m "feat(cards): teacher Cards workspace page (data + recall)"
```

---

## Task 8: Rebuild the card editor

**Files:**
- Modify (rewrite): `src/app/teacher/cards/[id]/cards/card-editor-form.tsx`
- Modify: `src/app/teacher/cards/[id]/cards/new/page.tsx` and `.../[cardId]/page.tsx` — restyle the wrapper (drop hardcoded `text-blue-600`/`text-slate-600`; use `PageHeader`/theme tokens; `max-w-3xl`).

- [ ] **Step 1: Rebuild `card-editor-form.tsx`**

Keep the existing props (`lessonId`, `initial?`, `mode`, `action`), RHF + `cardSchema` + `useFieldArray`, and the submit/transition logic **unchanged**. Replace the JSX/styling with the sectioned layout and the click-to-mark-correct choice rows. Key differences from current:

- Remove every `text-red-600` / `text-slate-*` / `bg-slate-*` / `border-amber-*` literal → theme tokens (`text-destructive`, `border-border`, `bg-card`, `bg-muted`, `text-muted-foreground`).
- Wrap content in two sections (`Content`, `Quiz`) as `rounded-2xl border border-border bg-card` cards with a header row.
- Headline input gets `text-base font-semibold` styling (title feel).
- Replace `ChoiceRow`'s separate radio with a clickable row: the whole row is a `button type="button"` that calls `field.onChange(letter)` on the `correct_choice` Controller; when selected it gets `border-primary bg-primary/10` + a bronze check; an inline text `Input` for the choice text sits inside (stop propagation so typing doesn't toggle).
- Add a sticky action bar: `<div className="sticky bottom-0 ...">` with Cancel (Link to `/teacher/cards/${lessonId}`) + submit.
- Add a status line near the top: when `fields.length === 0`, show a themed note "No questions yet — this card stays a draft until you add one." (replace the amber box).

Complete `ChoiceRow` replacement:

```tsx
function ChoiceRow({ idx, letter, register, control, error, disabled }: {
  idx: number; letter: 'a'|'b'|'c'|'d';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any; // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any; error?: string; disabled?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={`questions.${idx}.correct_choice` as const}
      render={({ field }) => {
        const correct = field.value === letter;
        return (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => field.onChange(letter)}
              disabled={disabled}
              aria-pressed={correct}
              aria-label={`Mark choice ${letter.toUpperCase()} correct`}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                correct ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted/40',
              )}
            >
              <span className={cn('grid h-4 w-4 shrink-0 place-items-center rounded-full border-2', correct ? 'border-primary bg-primary' : 'border-muted-foreground/40')}>
                {correct && <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />}
              </span>
              <span className={cn('text-xs font-bold', correct ? 'text-primary' : 'text-muted-foreground')}>{letter.toUpperCase()}</span>
              <input
                {...register(`questions.${idx}.choice_${letter}` as const)}
                disabled={disabled}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder={`Choice ${letter.toUpperCase()}`}
              />
              {correct && <span className="text-[9px] font-bold uppercase tracking-wide text-primary">Correct</span>}
            </button>
            {error && <p className="ml-6 text-xs text-destructive">{error}</p>}
          </div>
        );
      }}
    />
  );
}
```

Add `import { Check } from 'lucide-react'` and keep `cn`. (Note: the choice text `<input>` is nested in the `<button>`; `stopPropagation` prevents a click in the field from re-marking correct — clicking the field still works to type. Marking correct is via clicking the radio/letter/empty area.)

- [ ] **Step 2: Restyle the two editor wrapper pages**

`new/page.tsx` and `[cardId]/page.tsx`: replace the `text-blue-600` back-link + `text-slate-600` subtitle + `container ... p-6` with:

```tsx
<div className="mx-auto max-w-3xl space-y-4">
  <Link href={`/teacher/cards/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
    <ArrowLeft className="h-4 w-4" /> Cards
  </Link>
  <CardEditorForm ... />
</div>
```

(Import `ArrowLeft`. Keep the existing data fetch + `action`.)

- [ ] **Step 3: Verify**

`npm run typecheck && npm run lint` — exit 0. Browser smoke as teacher: open a lesson's "Add card", confirm two sections render with theme colors (no slate/blue/amber), click a choice → it highlights bronze + "Correct", type in choice fields, add/remove a question, the sticky save bar saves and returns to `/teacher/cards`.

- [ ] **Step 4: Commit**

```bash
git add src/app/teacher/cards/
git commit -m "feat(cards): rebuilt themed card editor with click-to-mark-correct"
```

---

## Task 9: Restyle lesson management + drop its card list

**Files:**
- Modify: `src/app/teacher/cards/[id]/page.tsx`

- [ ] **Step 1: Remove the "Cards" card and keep class-access / edit / danger**

The workspace now owns the card list. In the lesson-detail page delete the entire `<Card>` block that renders the per-lesson card list + "Add card" (lines rendering `cards.map(...)`), and remove the now-unused `cards` query + `cardCount`-only usages that were only for that block (keep `cardCount` if still used by the delete copy/`ClassAccessRow`). Keep **Class access**, **Edit lesson**, **Danger zone**. Ensure all shadcn `Card` usages and `PageHeader` already use tokens (they do). Add a back link to `/teacher/cards`.

- [ ] **Step 2: Verify**

`npm run typecheck && npm run lint` — exit 0. Browser smoke: from a workspace group's unlock chip, land on `/teacher/cards/[id]`; confirm Class access (unlock toggles), Edit lesson, Danger zone all present and themed; no duplicate card list.

- [ ] **Step 3: Commit**

```bash
git add src/app/teacher/cards/[id]/page.tsx
git commit -m "refactor(cards): lesson management page (drop card list, themed)"
```

---

## Task 10: Final validation + advisors

- [ ] **Step 1: Full static checks**

Run `npm run typecheck` (exit 0) and `npm run lint` (0 errors; pre-existing warnings in `quest-form.tsx` / `teacher/settings/page.tsx` are acceptable).

- [ ] **Step 2: Browser regression (teacher + student)**

Dev server up. As teacher: `/teacher/cards` workspace, create a lesson, add a card with a correct choice, see it go Live, see Recall where data exists. Confirm `/teacher/lessons` → 308 → `/teacher/cards`. As student: `/student/cards` still works (no regression from shared changes).

- [ ] **Step 3: DB advisors**

`get_advisors type=performance` and `type=security` — confirm no new lints from the `card_recall_stats` view.

- [ ] **Step 4: Update CLAUDE.md**

Note the teacher "Lessons → Cards" rename + the workspace/editor + the `card_recall_stats` view in the relevant sections (Conventions / a Phase row), mirroring how the student Cards merge was recorded.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: record teacher Cards authoring in CLAUDE.md"
```

---

## Open items resolved (from spec §10)
- **Quick start:** retire. "New lesson" (`/teacher/cards/new`) creates the lesson and returns to the workspace (newest lesson is `defaultOpen`, so its empty group with the dashed "Add card" tile is the prompt). If `quickStartLesson` is now unused, remove it and its button.
- **Lesson management entry:** the group header's **unlock chip** links to `/teacher/cards/[id]` (Step in Task 6).
- **Recall:** label "Recall", gate `MIN_RECALL_ATTEMPTS = 8`, tiers ≥80 / 60–79 / <60 (Task 2).
