# Design — Teacher "Cards" authoring (Lessons rename + redesigned creation flow)

**Date:** 2026-05-30
**Status:** Approved (design); pending implementation plan
**Author:** Zakaria R'bih + Claude

First of the teacher-side cohesion redesigns. Establishes the **teacher design
language** (reused by the later Quests ⊕ Review sub-project) and rebuilds the
lesson/card authoring surface.

---

## 1. Summary & goals

Rename the teacher **Lessons** page to **Cards** and rebuild authoring around a
single workspace + a focused editor. Teacher UX principles (the through-line):

- **Actionable** — every screen surfaces live state and what to do next; no dead ends.
- **Ease of creation / access** — fast, well-organized authoring, not a wall of forms.
- **Engaging, not sterile** — polished and lively, but in service of getting work done (not gamified like the student side).

### Non-goals
- The Quests ⊕ Review merge (separate sub-project).
- Redesigning the unlock/class-access *flow* (we restyle it; behavior unchanged).
- Schema changes — none. `review_cards`, `card_quiz_questions`, `lesson_unlocks`, `lessons` and the `createCard`/`editCard` server actions + `card-schema` stay as-is.

---

## 2. Teacher design language (shared, codified here)

- **Numbers** — all stat/numeric displays use `tabular-nums` (now routed through JetBrains Mono globally). This includes surfaces that currently *don't*, e.g. `StatCard` — add `tabular-nums` to its value.
- **Radius** — `rounded-2xl` for top-level zones/cards, `rounded-xl`/`rounded-lg` for nested tiles/inputs. Align drifting `rounded-lg`/`rounded-md`.
- **Command zone** — an actionable header band: lightly bronze-tinted (`from-primary/8` gradient, `border-primary/30`), holding live counts + the primary create action. The teacher analogue of the student hero — lively but utilitarian.
- **Status chips** — reuse/extend the existing `StatusChip` component for `Live` (green, dark-variant), `Needs a question` (amber, dark-variant), `Unlocked ×N` (`bg-primary/15 text-primary`), `Draft` (muted). Per CLAUDE.md rule 19, semantic color literals are allowed **only** paired with a `dark:` variant.
- **No hardcoded shell colors** — eliminate every `slate-*`/`blue-*`/`amber-*`/`red-*` literal in the authoring tree; use `text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`, `text-destructive`, `text-primary`. (The current editor is full of these — the main reason it "feels off".)

---

## 3. Routing & nav

| Path | Today | After |
|---|---|---|
| `/teacher/cards` | — | **Workspace** (lessons-as-groups + cards) — replaces the lessons list |
| `/teacher/cards/[lessonId]` | — | Lesson management (class access / rename / delete), restyled |
| `/teacher/cards/[lessonId]/cards/new` | — | Redesigned card editor (new) |
| `/teacher/cards/[lessonId]/cards/[cardId]` | — | Redesigned card editor (edit) |
| `/teacher/lessons/**` | current | **permanent redirect → `/teacher/cards/**`** (incl. param mapping) |

- Move the `src/app/teacher/lessons/` tree to `src/app/teacher/cards/`; add `next.config.ts` redirects (`/teacher/lessons` → `/teacher/cards`, `/teacher/lessons/:id...` → `/teacher/cards/:id...`).
- **Nav** (`nav-items.ts`): teacher `lessons` entry → `{ href: '/teacher/cards', label: 'Cards', icon: 'cards' }`. Teacher nav becomes **Cards · Quests · Classes · Insights** (Review folds into Quests in the next sub-project; not this one).

---

## 4. The Workspace (`/teacher/cards`)

A Server Component page; the collapsible groups are a small client component.

**Command zone** (bronze-tinted band): stat tiles `N Cards · N Lessons · N Unlocked` (mono) + a single **New lesson** primary action. *No top-level "New card"* — cards only exist inside a lesson.

**Lesson groups** (collapsible, newest first; one or many open):
- Header: caret, `L{lesson_number}`, title, `N cards`, an **`⚠ N needs a question`** chip when any card has 0 MCQs (visible even collapsed; lessons needing attention get a `border-primary/40`-style accent), the unlock status chip (`Unlocked ×N` / `Draft · not unlocked`), and an **Add card** button.
- Body (when open): a grid of card chips, each showing headline + status (`Live · N Q` green / `Needs a question` amber), plus a dashed **Add card** tile. Clicking a card → editor; Add card → new-card editor.
- The unlock chip / a "Manage" affordance links to `/teacher/cards/[lessonId]` (lesson management).

**New lesson** creates the lesson (existing action) and lands back on the workspace with it expanded and an "add your first card" prompt.

---

## 5. The Card editor (`…/cards/new` & `…/[cardId]`)

Rebuild `card-editor-form.tsx` (same RHF + zod + `CardFormValues`; same `createCard`/`editCard` actions) into a focused, sectioned page:

- **Top bar** — `← Cards` back + a **status pill** (`⚠ Needs a question to go live` / `● Live`). Lesson context line: `In lesson L{n} · {title}`.
- **Content section** (card): **Headline** as a large title input; **Body** = the existing `MdxEditor` in a framed container with the markdown hint.
- **Quiz section** (card): header `Quiz · {n} of 10` + **Add question**. Each question is a card: question-text input, four choice rows where **clicking a choice marks it correct** (bronze highlight + check + "Correct" label) — replacing the separate radio column. Remove-question control. Empty state when 0 questions (themed, not an amber box): "No questions yet — this card stays a draft until you add one."
- **Sticky save bar** (bottom): contextual note + **Cancel** / **Create card** (or **Save changes**).

The click-to-mark-correct writes `questions[i].correct_choice` via the RHF `Controller`; validation (≥1 of A–D filled, a correct choice set) unchanged from `card-schema`.

---

## 6. Lesson management (`/teacher/cards/[lessonId]`)

The existing lesson-detail page, **restyled** to the design language and **with its card list removed** (cards now live in the workspace). Keeps: **Class access** (unlock per class — unchanged behavior), **Edit lesson** (title/number), **Danger zone** (delete). Reached from a group's manage/unlock affordance.

---

## 7. Data & status derivation

Workspace query (one round-trip, RLS = teacher-all):

```
lessons
  .select('id, title, lesson_number,
           review_cards(id, headline, position, card_quiz_questions(count)),
           lesson_unlocks(class_id)')
  .order('lesson_number', { ascending: false })
```

- Per card: `questionCount = card_quiz_questions[0].count` → `Live` (≥1) or `Needs a question` (0).
- Per lesson: `needsCount` = cards with 0 questions; `unlockCount = lesson_unlocks.length` → `Unlocked ×N` / `Draft`.
- Command-zone stats: total cards, total lessons, lessons with `unlockCount > 0`.

Sort cards within a lesson by `position`.

---

## 8. Component inventory

New (`src/components/teacher-cards/` unless noted):
- `cards-workspace.tsx` — client; command zone + collapsible groups + expand state.
- `lesson-group.tsx` / `card-tile.tsx` — group header (status chips, add card) + card chip.
- Rebuilt `card-editor-form.tsx` (stays near its route) — sectioned layout, click-to-correct `ChoiceRow`, sticky save bar, status pill.

Reused: `PageHeader`, `StatusChip` (extended tones), `MdxEditor`, `EmptyState`, shadcn primitives, `createCard`/`editCard` actions, `card-schema`. `StatCard` gets `tabular-nums`.

Removed/redirected: `src/app/teacher/lessons/**` (moved to `cards/`).

---

## 9. Unchanged
`unlock_lesson_cards` RPC + the strict-≥1-MCQ rule, `card_quiz_questions`/`review_cards` schema, RLS, the markdown model + `MdxEditor`, the student side. This is a teacher-facing rename + authoring rebuild + the shared design-language pass.

---

## 10. Open items to confirm during planning
- Keep the old "Quick start" (lesson+card in one) or retire it in favor of New lesson → add card? (Proposed: retire; New lesson lands with an add-first-card prompt.)
- Lesson management reached via the unlock chip vs an explicit "Manage" button in the group header (proposed: the unlock chip is the link, with a small manage icon).
