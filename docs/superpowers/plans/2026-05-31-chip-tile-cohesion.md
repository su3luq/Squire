# Chip + Tile Cohesion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate ~20 files of hand-rolled chips onto the existing fixed-height `StatusChip` primitive (bronze = good), add a shared `GridTile`, and migrate every chip site so alignment can't drift.

**Architecture:** `StatusChip` (on shadcn `Badge`, fixed `h-5`) is the one chip; a new `GridTile` is the one card-grid tile. Migration is per-surface, each its own commit. No DB or behavior changes — visual/structural only.

**Tech Stack:** Next.js 16 RSC, TypeScript, Tailwind v4 (theme tokens), shadcn `Badge`.

**Spec:** `docs/superpowers/specs/2026-05-31-chip-tile-cohesion-design.md`

**Validation model (this repo):** no unit-test runner. Each task verifies with `npm run typecheck` (exit 0) and `npm run lint` (0 errors; the only acceptable pre-existing warnings are in `src/app/teacher/quests/quest-form.tsx` ×1 and `src/app/teacher/settings/page.tsx` ×4). UI tasks also get a browser smoke as the relevant role at `http://localhost:3000` (dev server already running — do NOT start another). Commit after each task.

**Tone mapping (use everywhere):**
| Meaning | `StatusChip` tone |
|---|---|
| positive / live / passing / unlocked / mastered / due / "+XP" / "New" | `good` (bronze) |
| at-risk / pending / awaiting-review / needs-a-question | `warn` (amber) |
| failed / blocked / resubmit-needed | `danger` (red) |
| neutral / draft / counts / enrolled | `muted` |

Inline status *text* (not pill-shaped — e.g. a card-tile "LIVE · 1 Q" line) is NOT a chip: retone it to `text-primary` (good) / `text-amber-600 dark:text-amber-400` (warn) and leave it inline.

---

## File Structure

**New:**
- `src/components/ui/grid-tile.tsx` — shared card-grid tile (filled + dashed-add variants, fixed min-height).

**Modified (primitive):**
- `src/components/status-chip.tsx` — retoken `info`; export a generic `recallTone()` if useful.

**Modified (migration, per surface):**
- Teacher Cards: `components/teacher-cards/status-bits.tsx`, `card-tile.tsx`, `lesson-group.tsx`
- Student Cards: `components/cards/card-chip.tsx`, `lesson-grid.tsx`, `continue-strip.tsx`
- Leaderboard: `components/leaderboard-podium.tsx`, `app/leaderboard/page.tsx`
- Home: `components/recent-wins.tsx`, `closest-rival.tsx`, `rank-hero.tsx`
- Student quests: `app/student/quests/page.tsx`, `app/student/quests/[id]/page.tsx`, `app/student/my-quests/[id]/page.tsx`
- Teacher quests/review/classes: `app/teacher/quests/page.tsx`, `app/teacher/quests/[id]/page.tsx`, `app/teacher/review/[id]/page.tsx`, `app/teacher/classes/page.tsx`, `app/teacher/classes/[id]/page.tsx`
- Analytics: `app/teacher/analytics/**`

**Out of scope (do NOT touch):** `sidebar-nav.tsx`, `bottom-tabs-nav.tsx`, `inbox-button.tsx` (count bubble), `toggle-chip-group.tsx`, `streak-widget.tsx`, `settings/theme-settings.tsx`.

---

## Task 1: Primitives — GridTile + StatusChip info retoken

**Files:**
- Create: `src/components/ui/grid-tile.tsx`
- Modify: `src/components/status-chip.tsx`

- [ ] **Step 1: Create `GridTile`**

```tsx
import Link from 'next/link';
import { cn } from '@/lib/utils';

// The one card-grid tile. Both filled cards and the "add" affordance use
// it so empty and filled tiles always share a height (grid rows stretch to
// the tallest; the shared min-height covers a tile alone on its own row).
export function GridTile({
  href,
  add = false,
  className,
  children,
  ...rest
}: {
  href: string;
  add?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, 'href' | 'className' | 'children'>) {
  return (
    <Link
      href={href}
      className={cn(
        'flex min-h-[4.5rem] rounded-lg border transition-colors',
        add
          ? 'items-center justify-center gap-2 border-dashed border-border text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground'
          : 'flex-col justify-between gap-2 border-border bg-card p-3 hover:border-primary/40 hover:bg-muted/40',
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}
```

(The `...rest` spread lets callers pass `aria-label`, `scroll`, etc. through to the `Link`.)

- [ ] **Step 2: Retoken the `info` tone in `status-chip.tsx`**

In the `TONE_CLASSES` map, replace the `info` line:
```ts
// from:
info: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
// to:
info: 'bg-muted text-foreground',
```

- [ ] **Step 3: Verify**

`npm run typecheck && npm run lint` — exit 0 / only pre-existing warnings.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/grid-tile.tsx src/components/status-chip.tsx
git commit -m "feat(ui): GridTile primitive + retoken StatusChip info off slate"
```

---

## Task 2: Migrate teacher Cards

**Files:**
- Modify: `src/components/teacher-cards/status-bits.tsx`, `card-tile.tsx`, `lesson-group.tsx`

- [ ] **Step 1: Rewrite `status-bits.tsx` over `StatusChip`**

Replace the bespoke chip spans. The header chips become `StatusChip`; `CardStatus` stays an inline status line (retoned, not a pill). Full file:

```tsx
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
```

(Removes the local `CHIP` constant + emerald usages — "Live"/good-recall are now bronze `text-primary`.)

- [ ] **Step 2: `card-tile.tsx` → `GridTile`**

```tsx
import { GridTile } from '@/components/ui/grid-tile';
import { CardStatus } from './status-bits';
import type { CardRow } from './types';

export function CardTile({ lessonId, card }: { lessonId: string; card: CardRow }) {
  return (
    <GridTile href={`/teacher/cards/${lessonId}/cards/${card.id}`}>
      <p className="line-clamp-2 text-sm font-medium leading-snug">{card.headline}</p>
      <CardStatus questionCount={card.questionCount} recall={card.recall} />
    </GridTile>
  );
}
```

- [ ] **Step 3: `lesson-group.tsx` add-card tile → `GridTile add`**

Replace the dashed add-card `<Link>` in the expanded grid with:
```tsx
<GridTile href={`/teacher/cards/${lesson.id}/cards/new`} add aria-label={`Add a card to ${lesson.title}`}>
  <Plus className="h-4 w-4" /> Add card
</GridTile>
```
Add `import { GridTile } from '@/components/ui/grid-tile';`. (`GridTile` spreads `...rest` onto the `Link`, so `aria-label` passes through.) The header chips already use `RecallChip`/`NeedsChip`/`UnlockChip` — no header change needed beyond Step 1.

- [ ] **Step 4: Verify**

`npm run typecheck && npm run lint` — exit 0. Browser (teacher `/teacher/cards`): chips are bronze/amber/muted and uniform; expand a lesson — card tiles + the add tile match height; a lesson whose add-tile is alone on a row still matches.

- [ ] **Step 5: Commit**

```bash
git add src/components/teacher-cards/
git commit -m "refactor(cards): teacher Cards chips/tiles onto StatusChip + GridTile"
```

---

## Task 3: Migrate student Cards

**Files:**
- Modify: `src/components/cards/card-chip.tsx`, `lesson-grid.tsx`, `continue-strip.tsx`

- [ ] **Step 1: Read all three**, then migrate:
  - `card-chip.tsx`: the "Due" pill → `<StatusChip tone="good">Due</StatusChip>`; the tile wrapper `<Link>` → `<GridTile href={…}>`. Keep the headline (`line-clamp-2`) + the "Tap to read" line as children.
  - `lesson-grid.tsx`: the per-lesson "N due" pill → `<StatusChip tone="good"><span className="tabular-nums">{n}</span> due</StatusChip>`. The card grid inside a folder uses `CardChip` (already `GridTile` via card-chip) — if it renders an "add"-style or empty tile, leave it (students don't add). The lesson-folder *tiles* themselves are a different visual (mastery ring) — leave their sizing, only swap the due pill.
  - `continue-strip.tsx`: it renders `CardChip`s — no change beyond what card-chip gives.

- [ ] **Step 2: Verify**

`npm run typecheck && npm run lint` — exit 0. Browser (student `/student/cards`): "Due" chips bronze + uniform; card tiles aligned; nothing regressed (review hero, folders).

- [ ] **Step 3: Commit**

```bash
git add src/components/cards/
git commit -m "refactor(cards): student Cards chips/tiles onto StatusChip + GridTile"
```

---

## Task 4: Migrate leaderboard

**Files:**
- Modify: `src/components/leaderboard-podium.tsx`, `src/app/leaderboard/page.tsx`

- [ ] **Step 1:** Read both. Replace hand-rolled pill spans (the "you" badge, any rank/place label pills, the `#N` chips if pill-shaped) with `StatusChip` + the tone map (`you` → `good`; neutral rank labels → `muted`). Leave the podium emblem/medal/crown visuals, the avatar rings, and the `rl-*` effect classes untouched — only the text *pills* migrate. Keep `tabular-nums` on numbers.

- [ ] **Step 2: Verify** — `npm run typecheck && npm run lint` exit 0; browser `/leaderboard` (student) — podium + list chips bronze/muted + aligned; effects intact.

- [ ] **Step 3: Commit**
```bash
git add src/components/leaderboard-podium.tsx src/app/leaderboard/page.tsx
git commit -m "refactor(leaderboard): chips onto StatusChip"
```

---

## Task 5: Migrate home (recent-wins, closest-rival, rank-hero)

**Files:**
- Modify: `src/components/recent-wins.tsx`, `src/components/closest-rival.tsx`, `src/components/rank-hero.tsx`

- [ ] **Step 1:** Read each. Replace pill-shaped labels with `StatusChip`:
  - recent-wins: the `+{amount}` XP pill → `<StatusChip tone="good">+<span className="tabular-nums">{amount}</span></StatusChip>`.
  - closest-rival / rank-hero: any "X XP behind / ahead" or rank pills → `StatusChip` (`muted` for neutral context, `good` for positive). Inline running text that isn't a pill stays inline (retone any emerald → `text-primary`).

- [ ] **Step 2: Verify** — typecheck/lint exit 0; browser student `/student` home — recent-wins +XP chips + rival/hero chips bronze + aligned.

- [ ] **Step 3: Commit**
```bash
git add src/components/recent-wins.tsx src/components/closest-rival.tsx src/components/rank-hero.tsx
git commit -m "refactor(home): chips onto StatusChip"
```

---

## Task 6: Migrate student quests

**Files:**
- Modify: `src/app/student/quests/page.tsx`, `src/app/student/quests/[id]/page.tsx`, `src/app/student/my-quests/[id]/page.tsx`

- [ ] **Step 1:** Read each. Status chips already use `QuestStatusChip` — keep. Migrate the remaining hand-rolled pills:
  - the `New` badge → `<StatusChip tone="good">New</StatusChip>` (drop the emerald literal).
  - `Enrolled` / "Already accepted" style pills → `<StatusChip tone="muted">…</StatusChip>` (or `QuestStatusChip` where a status exists).
  - any "+{xp} XP" / type pills → `StatusChip` with the tone map.
  Leave the `LiveCountdown`, section headers, and `ToggleChipGroup` filter chips.

- [ ] **Step 2: Verify** — typecheck/lint exit 0; browser student `/student/quests` (+ a quest detail) — chips bronze/muted/amber + aligned; filters untouched.

- [ ] **Step 3: Commit**
```bash
git add src/app/student/quests/ src/app/student/my-quests/
git commit -m "refactor(quests): student quest chips onto StatusChip"
```

---

## Task 7: Migrate teacher quests / review / classes

**Files:**
- Modify: `src/app/teacher/quests/page.tsx`, `src/app/teacher/quests/[id]/page.tsx`, `src/app/teacher/review/[id]/page.tsx`, `src/app/teacher/classes/page.tsx`, `src/app/teacher/classes/[id]/page.tsx`

- [ ] **Step 1:** Read each. Replace hand-rolled status/label pills with `StatusChip` per the tone map (submission status → `QuestStatusChip` where applicable, e.g. `pending_review`→warn, `passed`→good, `failed`→danger; class/roster count pills → `muted`). Leave non-pill UI (tables, headers, buttons).

- [ ] **Step 2: Verify** — typecheck/lint exit 0; browser teacher `/teacher/quests`, a quest detail, `/teacher/classes` — chips consistent + aligned.

- [ ] **Step 3: Commit**
```bash
git add src/app/teacher/quests/ src/app/teacher/review/ src/app/teacher/classes/
git commit -m "refactor(teacher): quest/review/class chips onto StatusChip"
```

---

## Task 8: Migrate analytics

**Files:**
- Modify: `src/app/teacher/analytics/page.tsx`, `src/app/teacher/analytics/content/page.tsx`, `src/app/teacher/analytics/quests/page.tsx`, `src/app/teacher/analytics/quests/all/page.tsx`, `src/app/teacher/analytics/at-risk/page.tsx`

- [ ] **Step 1:** Read each. Replace hand-rolled tag/label pills with `StatusChip` per the tone map. Leave charts, bars, heatmaps, and the `RetentionList`/sparkline visuals — only text *pills* migrate. (Some bars use `bg-destructive/70` etc. — those are data viz, not chips; leave them.)

- [ ] **Step 2: Verify** — typecheck/lint exit 0; browser teacher `/teacher/analytics` (+ subpages) — label chips consistent; charts intact.

- [ ] **Step 3: Commit**
```bash
git add src/app/teacher/analytics/
git commit -m "refactor(analytics): label chips onto StatusChip"
```

---

## Task 9: Final sweep + validation

- [ ] **Step 1: Confirm no stray hand-rolled status chips remain**

Run: `grep -rn "rounded-full[^\"']*px-[^\"']*text-\[\?\(10px\|xs\|9\)" src/ | grep -v "status-chip\|ui/badge\|sidebar-nav\|bottom-tabs-nav\|inbox-button\|toggle-chip-group\|streak-widget\|theme-settings\|grid-tile"`
Review each remaining hit: it should be either (a) an intentionally out-of-scope component, or (b) a genuine non-status pill. If any are status/label chips that were missed, migrate them.

- [ ] **Step 2: Full static checks** — `npm run typecheck` (exit 0) + `npm run lint` (0 errors).

- [ ] **Step 3: Browser regression** — as student: `/student`, `/student/cards`, `/student/quests`, `/leaderboard`. As teacher: `/teacher`, `/teacher/cards`, `/teacher/quests`, `/teacher/analytics`. Confirm chips are uniform (bronze/amber/red/muted), tiles aligned, no emerald stragglers, effects/charts intact.

- [ ] **Step 4: Update CLAUDE.md** — add a short note (Conventions or a phase row) that `StatusChip` (bronze=good) is the canonical chip and `GridTile` the canonical card-grid tile, replacing hand-rolled chips/tiles app-wide.

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "docs: record chip/tile cohesion in CLAUDE.md"
```

---

## Open items resolved (from spec §8)
- **RecallChip** lives in `src/components/teacher-cards/status-bits.tsx` (teacher-only domain) implemented over `StatusChip` — keeps the UI primitive free of a `@/lib/recall` dependency.
- **`info` tone** → `bg-muted text-foreground` (Task 1).
