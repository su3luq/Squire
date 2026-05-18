# Phase 2 — Lessons & Cards: Build Reference

Working reference document for Phase 2 commits. Reflects the unified-markdown content model decided after the initial Phase 2 plan was drafted. Source of truth for what gets built next.

**Phase 2 milestone (per `docs/PLAN.md`):** teacher teaches a lesson and students study the cards.

---

## Content model — unified markdown

After migration 011, all long-form content in the app is markdown text:

- `review_cards.body` — markdown, the card content shown in the detail modal
- `quests.description` — markdown, the quest brief
- `quest_submissions.text_content` — markdown, the student's submission (Phase 4)
- `quest_submissions.teacher_feedback` — markdown, the teacher's grading feedback (Phase 4)

Rendered with `react-markdown` + `remark-gfm`. Raw HTML disabled. Custom component map handles:
- YouTube URLs (`youtube.com/watch?v=…`, `youtu.be/…`) → `<iframe>` embed
- Direct video URLs (`.mp4`, `.webm`) → `<video controls>`
- Standard markdown images (`![](url)`) → `<img loading="lazy">`
- Everything else → plain `<a>` link

Images and media live on external hosts. No Supabase Storage bucket is created in Phase 2.

---

## Commit sequence

Each commit ships independently and can be validated end-to-end before moving on.

| # | Commit message | Scope | Validation gate |
|---|---|---|---|
| 1 | `feat(db): migration 012 — unlock_lesson_cards RPC and lesson_card_counts view` | Migration adds `unlock_lesson_cards(p_lesson_id)` SECURITY DEFINER function (teacher-only) that sets `cards_unlocked_at` and inserts `card_reviews` rows with FSRS-initial state for every student-card pair, idempotent via `ON CONFLICT (student_id, card_id) DO NOTHING`. Plus a `lesson_card_counts` view returning `(lesson_id, card_count, question_count)` to avoid N+1 on the teacher lessons page. SQL committed to `supabase/migrations/012_*.sql`. `supabase/README.md` table updated. Types regenerated. `get_advisors` clean. | Advisors clean. RPC callable as teacher; rejected as student. View returns expected rows. |
| 2 | `feat(phase-2): teacher lesson CRUD` | `/teacher/lessons`, `/teacher/lessons/new`, `/teacher/lessons/[id]` (metadata only — no cards yet). Auto-suggest next `lesson_number`. Soft archive (set `archived_at` if we add it; otherwise hard delete with confirm modal). | Teacher creates a lesson via UI. `lessons` row visible via MCP. |
| 3 | `feat(phase-2): markdown editor component + card editor (headline + markdown body + MCQ form)` | Reusable `<MarkdownEditor />` component: side-by-side textarea + live preview pane (preview uses the renderer from commit #4 — develop them in lockstep). Card editor at `/teacher/lessons/[id]/cards/new` and `…/[cardId]`. Form: `headline` text input, `body` markdown editor, MCQ field array with `react-hook-form` `useFieldArray` + zod schema enforcing 3–10 questions, all choices non-empty, `correct_choice` ∈ `{a,b,c,d}`. Submit saves to `review_cards` + `card_quiz_questions`. | Teacher saves a card with markdown body and 4 MCQs. `tsc` + `lint` clean. |
| 4 | `feat(phase-2): markdown renderer component + YouTube/video embed support` | `<MarkdownRenderer source={...} />` component. Wraps `react-markdown` with `remark-gfm`, disables raw HTML, custom `components` map for `a` (YouTube/video detection + embed) and `img` (lazy-loaded `<img>`). Used by the card editor preview and by the student card detail modal. | Curl-grep + visual: a markdown source with a YouTube URL renders an iframe; an `.mp4` URL renders a `<video>`; plain link stays a plain link. |
| 5 | `feat(phase-2): teacher unlock action (wires unlock_lesson_cards RPC)` | "Unlock for class" button on `/teacher/lessons/[id]` with confirmation modal ("Unlock N cards for M students?"). Calls the RPC from commit #1, displays the returned counts, refreshes the page. Idempotent — re-clicking after adding more cards picks up the new ones. | Click unlocks; `card_reviews` rows visible via MCP. Re-click after adding a card creates new `card_reviews` rows for that card only. |
| 6 | `feat(phase-2): student card library + intercepting-route card detail modal + copy-markdown button` | `/student/library` — grid of unlocked cards grouped by lesson, showing only headline + small metadata badges. Click → Next.js intercepting route to `/student/library/cards/[cardId]` renders as modal overlay; direct nav / refresh renders as full page. Modal renders body via `<MarkdownRenderer />`. "Copy markdown" button copies raw `body` text to clipboard with brief "Copied!" toast. Browser back closes the modal. No prev/next buttons inside the modal (deferred). | Student sees unlocked cards from their class. Click renders body modal-style. Refresh on `/student/library/cards/[id]` renders full page with same content. Copy-markdown copies raw text. |
| 7 | `feat(phase-2): student FSRS review session with ts-fsrs and rating tests` | `/student/review` — fetches `card_reviews` where `due_at <= now()` and `student_id = auth.uid()`, ordered by `due_at`. Sequential UI: headline → tap to reveal body (rendered markdown) → 4-button rating (Again / Hard / Good / Easy = 1 / 2 / 3 / 4). On rating, run `ts-fsrs` against the row's current `(stability, difficulty, state, last_reviewed_at)`, update the row with the new values + `due_at` + `last_reviewed_at = now()` + `review_count = review_count + 1`. Empty-state when nothing due. Includes a unit test feeding a synthetic card through 10 known ratings to assert FSRS scheduling matches expectations. | Student rates a card; `card_reviews.due_at` advances per FSRS. Re-visit `/student/review` after rating; that card no longer appears until `due_at`. The synthetic-rating test passes. |

After commit #7, the Phase 2 milestone is met.

---

## Library decisions — retained

| Library | Use | Rationale |
|---|---|---|
| `ts-fsrs` | FSRS-4.5 spaced-repetition algorithm | Architect's pick. Typed, maintained, official TS port. Owning the algorithm is high-risk; using the lib is the obvious move. |
| `react-markdown` + `remark-gfm` | Markdown rendering with tables, task lists, autolinks | Default React choice. Disables raw HTML by default. Custom `components` map for embeds. |
| `react-hook-form` + `@hookform/resolvers` + `zod` | MCQ form (`useFieldArray` for the 3–10 questions array) and lesson/card forms | Already installed. `useFieldArray` is purpose-built for this exact case. zod gives one schema usable by RHF on the client and at submission validation. |
| Next.js intercepting routes (`(.)cards/[id]`) | Card detail modal that's also a real URL | Idiomatic Next.js App Router pattern. Modal overlay on grid; direct URL renders full page; browser back closes the modal. Replaces a global modal-state pattern. |

---

## Library decisions — dropped

These were considered earlier or in the original Phase 2 plan and have been **explicitly rejected** by the unified-markdown decision:

| Dropped option | Why dropped |
|---|---|
| Structured block editor (custom `{type, content, url?}` blocks) | Replaced by plain markdown textarea + live preview. No block management UI to build. |
| Tiptap / Lexical (ProseMirror-based rich text editors) | Markdown source-of-truth removes the need. Heavy bundle, customization overhead for image/audio blocks no longer relevant. |
| Image upload component (browser file picker → Supabase Storage) | No image upload pipeline at all. Markdown `![](url)` syntax with external hosting only. |
| Audio upload component (file picker for `.mp3` / `.m4a`) | No audio uploads anywhere in v1. Audio referenced as external markdown links (Vocaroo, etc.) if at all. |
| In-browser audio recording (MediaRecorder, react-audio-voice-recorder) | Out of v1 scope. Permission flows + format normalization not justified for the gain. |
| `card-media` Supabase Storage bucket | Not created. No storage RLS to write. Free-tier storage budget reserved for Phase 4 quest_submissions if those ever need files (they don't — Phase 4 is also markdown-only). |
| Audio MIME-type allowlists | N/A — no uploads. |

---

## Validation discipline (per commit, unchanged from prior plan)

1. `npm run typecheck` → exit 0
2. `npm run lint` → clean
3. `npm run dev` → start, curl key routes, grep expected strings
4. After any migration: `get_advisors security` → report any new lints
5. Commit + push

---

## Schema state going into Phase 2

After migrations 008–011, the relevant Phase 2 tables are:

- `lessons` — `(id, class_id, title, lesson_number, taught_at, cards_unlocked_at, created_at)`, UNIQUE `(class_id, lesson_number)`. RLS: teacher all, student read-own-class.
- `review_cards` — `(id, lesson_id, headline, body text NOT NULL DEFAULT '', position, created_at)`. RLS: teacher all, student read if lesson is unlocked.
- `card_quiz_questions` — `(id, card_id, question_text, choice_a..d, correct_choice, created_at)`. RLS: teacher all, students cannot read (consumed via snapshot in `daily_quiz_attempts` in Phase 3).
- `card_reviews` — `(id, student_id, card_id, stability, difficulty, due_at, last_reviewed_at, review_count, state, fsrs_params_version, created_at)`, UNIQUE `(student_id, card_id)`. RLS: teacher read, student CRUD own.

Migration 012 (Phase 2 commit #1) adds:
- `unlock_lesson_cards(p_lesson_id uuid)` RETURNS `jsonb`
- `lesson_card_counts` view

No further schema changes anticipated in Phase 2. Phase 3 will likely add a `daily_quiz_generation` Edge Function and possibly an RPC; Phase 4 adds quest creation and submission flows that reuse the markdown editor.

---

## Decisions still to confirm before commit #1

These were captured in the prior Phase 2 plan and remain open:

1. **Card editor save model:** explicit save button vs. autosave. **Recommendation: explicit save.** Simpler, no debounce/conflict layer.
2. **Card reordering UX:** explicit up/down buttons for v1, drag-and-drop later. **Recommendation: up/down buttons.**

Both are commit #3 concerns. Will surface for approval at that point if you haven't decided.
