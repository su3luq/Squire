# Design — Merge Library into Review as a single “Cards” page

**Date:** 2026-05-30
**Status:** Approved (design); pending implementation plan
**Author:** Zakaria R'bih + Claude

---

## 1. Summary

Today the student app has two separate destinations for review cards:

- **Review** (`/student/review`) — the FSRS-driven MCQ session over *due* cards.
- **Library** (`/student/library`) — a browse surface listing *all* unlocked cards by lesson, with a markdown reader modal.

We are merging them into **one library-led page at `/student/cards`**, nav label **Cards**. The review action becomes a prominent, gamified hero at the top; the card library lives beneath it as a scalable, collapsible browser.

### Goals (chosen by the user)

1. **Discoverability** — students rarely open Library today. Folding the cards into their daily destination surfaces the reading material.
2. **Connect read ↔ recall** — browsing shows each card's review state (due vs not), and the page flows directly into practice.

### Non-goals

- No on-demand practice of cards that aren't due (FSRS integrity stays; reading is always available, MCQs only when due).
- No per-card review sessions — one session is always the whole due queue (existing `list_review_session` RPC).
- No database schema changes — all required data already exists.
- No teacher-side changes. `/teacher/review` is untouched.
- No localization, audio, AI, or other v2-backlog items.

---

## 2. Information architecture & routing

| Path | Today | After |
|---|---|---|
| `/student/cards` | — | **New** merged page (the hero + browser) |
| `/student/cards/[cardId]` | — | Card reader (full page + intercepting modal), moved from library |
| `/student/review` | Review session page | **permanent redirect → `/student/cards`** |
| `/student/library` | Library browse | **permanent redirect → `/student/cards`** |
| `/student/library/cards/[cardId]` | Card reader | **permanent redirect → `/student/cards/[cardId]`** |

- Redirects implemented in `next.config.ts` (`redirects()` with `permanent: true` → HTTP 308), including the param mapping `/student/library/cards/:cardId → /student/cards/:cardId`.
- The card-reader parallel-route setup (`layout.tsx` with `children` + `modal` slots, `@modal/(.)cards/[cardId]`, and the full-page fallback) moves verbatim from `library/` to `cards/`.

### Navigation

`src/lib/nav-items.ts` — replace the two student entries (`review`, `library`) with one:

```ts
{ href: '/student/cards', label: 'Cards', icon: 'cards', badge: counts.dueReviews }
```

- New icon key `cards` resolved in `nav-icons.ts` to a stack/cards mark (proposed: Lucide `Layers`). **Note:** the nav icon is *not* the review-button icon — the review CTA uses `Zap`.
- Student nav goes 4 → 3 items: **Cards · Quests · Ranks**. Mobile bottom-tabs follow automatically.
- Due-count badge keeps its existing source (`counts.dueReviews`).

---

## 3. Page layout — three zones

A single Server Component page renders three stacked zones. Desktop is wide; the layout reflows for tablet and phone (Section 7).

```
┌─ Cards ─────────────────────────────────────────────┐
│  ZONE 1 · REVIEW HERO (command zone)                 │
│   [goal ring]  streak kick / "N cards ready" / meta   [ Start review ] │
│                                                       │
│  ZONE 2 · CONTINUE STRIP — current lesson's cards     │
│   [card] [card] [card] [card]                         │
│                                                       │
│  ZONE 3 · ALL LESSONS — grid of lesson folders   [search] │
│   [L12 ◔] [L11 ◔] [L10 ◔]                              │
│   [L9  ◔] [L8  ◔] [L7  ◔]  …                           │
└──────────────────────────────────────────────────────┘
```

### Zone 1 — Review hero (the hook)

A bronze-tinted command panel. Game-theory framing is the point.

- **Goal ring** (left): animated circular progress = *today's reviews / daily goal* (goal = 5, matching the existing daily-review-goal concept). Rounded stroke caps, value (`2/5`) + `today` centered inside, a bronze “comet” light that runs the filled arc with a thumping pulse, plus a bronze glow. Value uses JetBrains Mono.
- **Middle**: a kick line (streak status, with a flame mark — loss aversion), a large title `N cards ready`, and a meta line (`Sharpen your memory · +30 XP · 3 to hit today's goal`).
- **Start review button** (right): big CTA filling a panel of the zone, Lucide **`Zap`** mark, glare sweep + bronze halo (reuses the `.rl-active-edge`/glow language already in the app). Subtext “defend your streak”.

**State-aware framing** (mirrors `daily-review-goal.tsx` states):

| Condition | Hero |
|---|---|
| Due cards present | `N cards ready` + active Start review; kick = streak status |
| Due present **and** no reviews yet today **and** streak > 0 | Emphasised “don't break your N-day streak” (loss aversion) |
| No cards due | Calm “✓ All caught up · Next review in `<countdown>`”; CTA hidden; ring still shows today's goal |
| No cards due **and** daily goal met | Celebratory variant |
| New student / no streak | Neutral framing, no streak loss language |

### Zone 2 — Continue strip

The **current lesson** (the highest-`lesson_number` unlocked for the student's class) shown as a horizontal row of its card chips. One-tap reading of the active material. Due cards flagged. On phone this becomes a horizontal swipe row.

### Zone 3 — All lessons (scalable browser)

The whole unlocked course as a **grid of lesson “folders.”** Each folder tile shows:

- Lesson number chip (mono), title.
- A **mastery mini-ring** = fraction of the lesson's cards in FSRS `review` state (graduated) / total cards.
- Card count + a **“N due” pill** when the lesson has due cards.
- Due lessons get a bronze inset edge.

**Interaction:** clicking a folder **expands a full-width panel beneath the grid** showing that lesson's card chips (one open at a time; active folder highlighted). This keeps everything on one URL (SPA feel), no new routes, and matches the “open the folder” metaphor. Card chips link to the reader modal.

**Search:** a search input filters across all unlocked cards by headline; while searching, the grid is replaced by a flat list of matching card chips (each links to the reader). Clearing search restores the grid. An optional **Due** filter chip narrows to due cards only.

This structure scales to 40 weeks × dozens of lessons: collapsed folders, not an endless flat grid.

---

## 4. Review flow — in-place takeover

“Start review” (hero CTA, or a due card's “Review now”) **replaces the browse content with the existing `ReviewSession` MCQ flow on the same screen** — one URL, client state. On session completion the page returns to the browse view and calls `router.refresh()` so the due count, hero framing, and card flags update.

- One session = the entire due queue (existing `list_review_session` RPC). No per-card sessions.
- The session payload is fetched by the page on load (same single RPC the old review page used) and handed to the client view, so Start is instant. *(Optimization option: lazy-load the payload on Start via a route handler; deferred unless the page proves heavy.)*
- `ReviewSession` is reused unchanged; we control its mount/unmount via the client view toggle, which sidesteps the remount-key concern the standalone page had.

---

## 5. Read ↔ recall — the card reader

The card reader (markdown body via `MarkdownRenderer`, plus `CopyMarkdownButton`) is the existing `CardDetailPage`, moved to `cards/`. Addition:

- The reader fetches the viewer's `card_reviews` row for that card.
- **If the card is due** → a bronze **“Review now”** action that enters the review session (closes the modal / routes to `/student/cards?review=1` which auto-starts the queue).
- **If not due** → muted text **“Next review in `<countdown>`.”**

Reading is always available regardless of due state; MCQs never appear off-schedule.

---

## 6. Data model & consistency

No schema changes. The page (Server Component) fetches in parallel:

1. `list_review_session()` → due cards (ids + MCQ payload). **Single source of “due.”** Drives: hero count, the session, per-lesson due pills, and grid/strip due flags (a card is flagged due iff its id is in this set). This guarantees the hero number always equals the count of flagged cards.
2. `lessons` + `review_cards` (RLS scopes to the student's unlocked lessons, exactly as Library does today) → the grid + strip content.
3. `card_reviews` (student-own rows) → per-card `state` and `due_at`, used for **per-lesson mastery %** (`# state='review' / total`) and the reader's next-review timing.
4. Today's `review_attempts` count (Saigon day) → the daily-goal ring numerator.
5. `profiles` streak fields (`streak_days`, `streak_last_day`) via the existing `computeEffectiveStreak()` helper → streak kick line.

“Current lesson” = max `lesson_number` among the student's unlocked lessons.

---

## 7. Responsive behavior

| Zone | Desktop | iPad (~820px) | Phone (~390px) |
|---|---|---|---|
| Hero | ring + text + side button (fills panel) | same row, sized button | **stacked**: ring + text, then **full-width** button |
| Continue strip | 4-up | 3-up | **horizontal swipe** (cards peek) |
| Lesson grid | 3-up | 2-up | 2-up |
| Nav | sidebar | sidebar | existing bottom tab bar |

Same components, responsive columns. The goal-ring value stays centered inside the ring at every size (mono numerals remain legible at the 64px mobile ring).

---

## 8. Design-system changes (app-wide)

These extend beyond the Cards page deliberately:

1. **JetBrains Mono for numbers.** Add `JetBrains_Mono` via `next/font/google` in `layout.tsx` alongside Inter, expose as `--font-mono`, map Tailwind `font-mono` to it in `globals.css` `@theme`. Apply (with `tabular-nums`) to numeric displays across the app — XP, ranks, leaderboard figures, streak counts, due counts, percentages, timers. Recommend a small `<Num>` helper or a `.tabular` utility class for consistency.
2. **Lighter display weights.** Hero title ≈800→700; card/lesson titles ≈700→600. Scoped to these components to avoid broad heading regressions.
3. **Font anti-aliasing.** Add to `body` in `globals.css`: `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;`. Improves light-on-dark rendering (macOS/WebKit only; harmless elsewhere).
4. **Ring glare/glow clip fix.** The progress-ring glow must not sit inside an `overflow:hidden` ancestor. Keep the hero's clipping on a background pseudo-element (for the radial wash + glare sweep) and render the ring + its glow above without a clipping parent (or pad it off the clipped edge). SVG ring uses `overflow:visible`.

---

## 9. Component inventory

New (under `src/components/cards/` unless noted):

- `src/app/student/cards/page.tsx` — Server Component; all data fetching (Section 6); passes props to the client view.
- `cards-view.tsx` — client orchestrator; toggles **browse ↔ session**; owns expanded-lesson + search state.
- `review-hero.tsx` — the gamified hero (state-aware framing + CTA).
- `goal-ring.tsx` — animated SVG progress ring (rounded caps, centered mono value, comet sweep, glow).
- `continue-strip.tsx` — current-lesson card row.
- `lesson-grid.tsx` + `lesson-folder.tsx` — folder tiles (mastery mini-ring + due pill) and the inline-expand card panel.
- `card-chip.tsx` — a single card tile with the Due flag, links to the reader.

Reused: `ReviewSession`, `MarkdownRenderer`, `CopyMarkdownButton`, `computeEffectiveStreak`, `NextReviewCountdown`, shadcn primitives.

Removed/redirected: `app/student/review/*`, `app/student/library/*` (replaced by redirects; reader sub-tree moved to `cards/`).

---

## 10. What stays unchanged

FSRS scheduling and `ts-fsrs` writeback, `submit_mcq_answer` (XP chokepoint), `xp_ledger`, the streak trigger, all RLS, the markdown content model and reader, the leaderboard/ranks/quests, and the entire teacher side. This is a student-facing consolidation + surfacing layer plus a typography pass.

---

## 11. Decisions (resolved during implementation)

- Nav icon for **Cards**: Lucide `Layers`. ✓
- Lesson mastery %: `state='review' / total` (cards graduated to FSRS review). Kept — 0% on a fresh lesson is the correct semantics. ✓
- Session payload: loaded with the page (single `list_review_session` RPC), handed to the client view. ✓
- Lesson-folder interaction: inline-expand, one open at a time (no extra route). ✓

Shipped in commit `67b94bd`.
