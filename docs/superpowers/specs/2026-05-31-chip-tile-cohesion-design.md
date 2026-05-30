# Design — App-wide chip + tile cohesion

**Date:** 2026-05-31
**Status:** Approved (design); pending implementation plan
**Author:** Zakaria R'bih + Claude

The cohesion foundation that the Quests ⊕ Review merge (next sub-project) builds on. Consolidates ~20 files of hand-rolled chips onto one fixed-height primitive and adds a shared grid-tile, killing the alignment-drift class of bugs at the root.

---

## 1. Problem & goals

Chips/tags are hand-rolled across ~20 files (`rounded-full px-… text-[10px]`, content-driven heights), so they drift out of alignment (different heights when an icon is present, when wrapped in an inline `<a>`, etc.). A good primitive already exists — `StatusChip` (on shadcn `Badge`, fixed `h-5`, aligned) — but adoption is low (~5 files). Card-grid **tiles** have the same content-driven-height problem (empty "Add" tile ≠ filled tile when alone on a row).

**Goals:** (1) one chip primitive used everywhere; (2) one grid-tile primitive; (3) consistent color semantics; (4) the drift can't recur because sizing lives in the primitive, not call sites.

**Non-goals:** no new features; no behavior changes; not touching genuinely-different UI (nav badges, notification counts, interactive filter toggles, the streak flame).

---

## 2. Color semantics (decided)

One accent — bronze — per CLAUDE.md rule 19. `StatusChip` tone mapping is the standard everywhere:

| Tone | Use | Visual |
|---|---|---|
| `good` | positive / live / passing / unlocked / mastered | bronze (`bg-primary/15 text-primary`) |
| `warn` | at-risk / pending / awaiting-review / **needs-a-question** | amber (with `dark:`) |
| `danger` | failed / blocked / resubmit-needed | red (`destructive`) |
| `muted` | neutral / draft / counts | muted |
| `primary` | strong brand emphasis (sparingly) | bronze, stronger |
| `info` | rare neutral-info | **retoken from `slate-*` → `bg-muted text-foreground`** |

Consequence: the emerald "Live"/"good recall" chips I introduced in the Cards work become **bronze** (`good`). Inline status *text* (not pills), e.g. the card-tile "LIVE · 1 Q" line, is retoned to the same standard (`text-primary` / `text-amber-600 dark:text-amber-400`) but stays inline (only pill-shaped labels become `StatusChip`).

---

## 3. Chip primitive — `StatusChip`

Keep `StatusChip` as the single chip. It already provides fixed `h-5`, `inline-flex items-center`, `shrink-0`, `text-xs`, rounded, tone classes, and icon sizing (`[&>svg]:size-3` via Badge). Changes:

- **Retoken the `info` tone** off raw `slate-*`.
- **Standardize size** on the Badge default (`h-5`, `text-xs`). Migrated chips that were `text-[10px]` become `text-xs` — slightly larger, uniformly legible. No new size variants (YAGNI).
- **Icons via children** — `<StatusChip tone="warn"><AlertTriangle/> 1 needs a question</StatusChip>`.
- **Domain helpers stay** (`QuestStatusChip`) and route through `StatusChip`. Add small helpers only where a tier→tone mapping repeats:
  - `RecallChip` (move into the chip layer): `good`≥80 → `good`, 60–79 → `muted`, <60 → `warn`; renders `Recall {pct}%` (or `—`).

No new chip component — everything is `StatusChip` or a thin domain wrapper over it.

---

## 4. Tile primitive — `GridTile` (new)

`src/components/ui/grid-tile.tsx` — the shared shell for card-grid tiles so empty and filled tiles always match height.

```tsx
// A fixed-min-height tile for card grids. `add` renders the dashed
// centered "+ add" affordance; otherwise a bordered content tile.
// Always a link (href required) — both filled cards and add-tiles navigate.
export function GridTile({
  href, add = false, className, children,
}: { href: string; add?: boolean; className?: string; children: React.ReactNode }) { … }
```

- Shared `min-h-[4.5rem]`, `rounded-lg`, `transition-colors`.
- Default: `flex flex-col justify-between gap-2 border border-border bg-card p-3 hover:border-primary/40 hover:bg-muted/40`.
- `add`: `flex items-center justify-center gap-2 border border-dashed border-border text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground`.
- Consumers: teacher Cards (`CardTile` + the add-card tile both become `GridTile`), student Cards (`CardChip` + the lesson-folder/continue grids). The grid wrapper keeps `grid … gap-2` and default `align-items: stretch`, so same-row tiles match and the shared `min-h` covers the alone-on-a-row case.

---

## 5. Migration scope (all chip sites)

Per-surface, each its own commit + typecheck/lint + browser check:

| Surface | Files | Action |
|---|---|---|
| Teacher Cards | `components/teacher-cards/status-bits.tsx`, `card-tile.tsx`, `lesson-group.tsx` | chips → `StatusChip`; tiles → `GridTile` |
| Student Cards | `components/cards/card-chip.tsx`, `lesson-grid.tsx`, `continue-strip.tsx` | "Due"/due-pill → `StatusChip`; tiles → `GridTile` |
| Leaderboard | `components/leaderboard-podium.tsx`, `app/leaderboard/page.tsx` | place / "you" / rank chips → `StatusChip` |
| Recent wins / home | `components/recent-wins.tsx`, `closest-rival.tsx`, `rank-hero.tsx` | "+XP" / status pills → `StatusChip` |
| Student quests | `app/student/quests/page.tsx`, `quests/[id]`, `my-quests/[id]` | "New"/"Enrolled"/ad-hoc → `StatusChip` (status already uses `QuestStatusChip`) |
| Teacher quests/review/classes | `app/teacher/quests/*`, `review/[id]`, `classes/*` | status/label pills → `StatusChip` |
| Analytics | `app/teacher/analytics/**` | tag pills → `StatusChip` |

**Explicitly out of scope (left as distinct components):** `sidebar-nav.tsx` + `bottom-tabs-nav.tsx` nav badges, `inbox-button.tsx` notification **count** bubble, `toggle-chip-group.tsx` (interactive filters), `streak-widget.tsx` (flame identity), `settings/theme-settings.tsx` toggles.

---

## 6. Components inventory

- New: `src/components/ui/grid-tile.tsx`.
- Modified: `src/components/status-chip.tsx` (retoken `info`; house `RecallChip`), then each migrated surface above.
- Deleted/absorbed: the bespoke chip helpers in `teacher-cards/status-bits.tsx` and `cards/*` collapse into `StatusChip`/`GridTile` usage.

## 7. Verification
Per surface: `npm run typecheck` + `npm run lint` (0 errors) + a browser check that chips render the right tone and tiles align (incl. an alone-on-a-row add-tile). No DB or behavior changes.

## 8. Open items
- Whether `RecallChip` lives in `status-chip.tsx` or stays in a cards-domain file importing `StatusChip` (proposed: a small `recall` helper next to `StatusChip` since the tier→tone map is generic).
- Exact `info`-tone replacement (proposed: `bg-muted text-foreground`).
