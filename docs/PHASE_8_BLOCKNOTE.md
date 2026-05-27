# Phase 8 — BlockNote Editor + Co-op Per-Member Drafts

**Status:** Planned, ready to implement
**Owner:** Single-developer build
**Estimated effort:** 4–5 working days
**Last updated:** 2026-05-27

---

## Goals

1. Replace the current markdown textarea+preview editor with **BlockNote** across all five authoring surfaces, giving teachers and students a Notion-style "click the line, get options" experience.
2. Restructure co-op quest submissions so **every team member writes their own draft** (instead of the captain-only flow). Add a dropdown to read teammates' drafts, per-member submit/unsubmit, automatic finalization when the last member submits.
3. Add a **team notes sidebar** — async shared scratchpad with auto-save, visible only to the team during drafting and to the teacher after submission.

Non-goals: real-time multi-cursor collab (rejected in favor of simpler per-member drafts), block-level commenting inside the draft (deferred), structural rich blocks beyond Notion's standard set (callouts, columns, etc. — deferred).

---

## Affected surfaces

### Authoring (5 places replacing `MarkdownEditor`)
| Surface | File | Role |
|---|---|---|
| Card body | `src/app/teacher/lessons/[id]/cards/card-editor-form.tsx` | Teacher |
| Quest description | `src/app/teacher/quests/quest-form.tsx` | Teacher |
| Teacher feedback on review | `src/app/teacher/review/[id]/review-form.tsx` | Teacher |
| Teacher notes on student | `src/app/teacher/classes/[id]/students/[studentId]/notes-section.tsx` | Teacher |
| Solo quest submission | `src/app/student/my-quests/submission-form.tsx` | Student |

### New co-op workspace
| Surface | File | Role |
|---|---|---|
| Team draft workspace | `src/app/student/my-quests/[id]/page.tsx` (split + new component) | Student |
| Per-member draft editor | New | Student |
| Teammates dropdown (read-only) | New | Student |
| Team notes sidebar | New | Student |
| Teacher review (per-member sections) | `src/app/teacher/review/[id]/page.tsx` | Teacher |

### Renderer
**Unchanged.** `src/components/markdown-renderer.tsx` continues to render markdown for all read paths. Our YouTube/video embed magic stays in the renderer (Option 2 — lone URLs render as iframes in published view, plain text in the editor).

---

## Storage

### Existing tables (additive columns only)
Add `body_json jsonb null` to each of:
- `review_cards.body` → also `body_json`
- `quests.description` → also `description_json`
- `quest_submissions.text_content` → also `text_content_json`
- `quest_submissions.teacher_feedback` → also `teacher_feedback_json`
- `teacher_notes.note` → also `note_json`

**`body_json` is the BlockNote source-of-truth while editing.** On save, serialize to markdown and write `body_md` (the existing column). The renderer reads `body_md` and is untouched.

**Migration is lazy.** Existing markdown stays in `body_md` only. On first edit, the BlockNote editor parses markdown → blocks → JSON, populates `body_json`, and both fields stay in sync going forward. Old, never-edited content never gets a `body_json`.

### New tables

```sql
create table public.coop_member_drafts (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.coop_quest_instances(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  body_json jsonb,
  body_md text default '',
  submitted_at timestamptz null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (instance_id, student_id)
);

create table public.coop_team_notes (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.coop_quest_instances(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now(),
  unique (instance_id, student_id)
);
```

### RLS (per migration draft, requires user approval before apply)

**`coop_member_drafts`:**
- `SELECT`: students in the same instance, plus teacher.
- `UPDATE`: only `student_id = auth.uid()`, only when `instance_id` is in `forming`/`active` status. Locked after team finalization.
- `INSERT`: server-side via RPC when an instance forms.

**`coop_team_notes`:**
- `SELECT`: students in the same instance during drafting. Teacher gains access only when `quest_submissions.status` for the instance is one of `pending_review`/`passed`/`failed`.
- `UPDATE`: only `student_id = auth.uid()`, only while the instance is unlocked.

---

## Lifecycle: per-member draft → team finalize → review

```
forming → active → (each member writes a draft)
                 → (each member toggles submitted_at when ready)
                 → (last member submits triggers finalize_team_submission RPC)
                 → quest_submissions row created (pending_review)
                 → drafts and notes lock
                 → teacher reviews
                    ├── PASS → quest_acceptances.status = 'passed' for all members, XP awarded each
                    └── FAIL → submission status = 'failed', clear submitted_at on all drafts,
                               unlock notes, members revise, repeat
```

**Finalize RPC** (`finalize_team_submission(instance_id uuid)`, SECURITY DEFINER):
1. Verify all member drafts have non-null `submitted_at`.
2. Concatenate per-member sections into a single markdown blob:
   ```
   ## Student Name
   <member's body_md>

   ## Other Student
   <body_md>
   ```
3. Insert one `quest_submissions` row, status `pending_review`, `instance_id` set, `text_content` = the concatenation, `submitted_by` = the last member to submit (for audit trail).
4. The finalize is idempotent — re-calling on an already-finalized instance is a no-op.

**Force-submit (teacher override):** new RPC `force_finalize_team_submission(instance_id uuid)` callable only by teachers. Bypasses the all-members check; empty drafts get a placeholder section like `*(No draft submitted)*`.

**Failure unlock RPC** (`unlock_team_drafts(submission_id uuid)`): runs when a teacher marks a submission failed. Clears `submitted_at` on all drafts for the instance, leaves `body_json` / `body_md` intact so members can revise.

---

## Team notes sidebar

### UX

**Desktop (≥768px):** right sidebar, 320–360px wide, expandable to ~50% width. Header has the team count ("Team notes (4)"), a collapse button, and a tiny indicator showing "Visible to teacher after submission." Each member's note is a card with their name, relative timestamp, and the note body. The viewer's own note is editable inline; teammates' notes are read-only.

**Mobile (<768px):** sidebar hidden by default. A pill at the bottom of the screen labeled "Team notes (4) ▲" expands into a bottom-sheet covering ~70% of the viewport. Same content, same edit/read pattern.

**Empty state:** "No notes yet — share thoughts, questions, links with your team."

### Sync

- **Realtime:** Supabase Realtime Postgres Changes subscription on `coop_team_notes` filtered by `instance_id`. Inserted/updated rows push to all subscribers automatically via RLS.
- **Auto-save:** debounce 1.5s after last keystroke → `UPDATE coop_team_notes SET body = $1, updated_at = now() WHERE id = $2`.
- **Page-exit safety:** flush pending writes on `pagehide` and `visibilitychange` via `navigator.sendBeacon` to a tiny `/api/team-notes/flush` route handler, or via a synchronous Supabase write. The unmount safety net catches the "student closes the tab mid-keystroke" case.
- **No polling.** Realtime is sufficient.

### Locking
- Comments freeze when the team's `quest_submissions` row is created.
- Comments unfreeze if the teacher fails the submission (handled by the same trigger that unlocks drafts).
- Locked state is RLS-enforced; the UI also disables the textarea.

---

## BlockNote integration details

### Library choice
- **`@blocknote/core`** — engine
- **`@blocknote/react`** — React bindings
- **`@blocknote/shadcn`** — shadcn-styled default UI (matches our shadcn setup)
- **`@blocknote/xl-multi-column`** — *not* installed; we don't need multi-column blocks in v1

### Markdown round-trip
- BlockNote ships `editor.blocksToMarkdownLossy(blocks)` and `editor.tryParseMarkdownToBlocks(md)`.
- "Lossy" naming is upstream's — for our content shape (text + headings + lists + code + tables + links + images) the round-trip is faithful.
- **Our lone-URL embed convention is preserved as plain text in BlockNote.** The renderer's `singleLinkHref` logic still fires in published views, so embeds appear correctly on cards / quest briefs / submission previews.

### Component wiring
A single `BlockNoteEditor` component replaces `MarkdownEditor`:

```tsx
'use client';

import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';

export function BlockNoteEditor({
  initialJson,
  initialMarkdown,
  onChange,        // (json, markdown) => void
  editable = true,
  placeholder,
}: Props) {
  const editor = useCreateBlockNote({
    initialContent: initialJson ?? undefined,
    // If only markdown is provided, parse it on mount.
    // Implementation detail: parse in a useEffect since the API is async.
  });
  // ... return <BlockNoteView editor={editor} editable={editable} />
}
```

Each form keeps its own React Hook Form integration. The editor's `onChange` writes both the JSON (to `body_json`) and the derived markdown (to `body_md`). Both go through the existing server actions / RPCs untouched.

### Dynamic import
`BlockNoteEditor` is itself a client component, but the import on each authoring page should still go through `next/dynamic({ ssr: false, loading: ... })` to keep the bundle off the initial render.

### Embed handling (Option 2, confirmed)
- In-editor: lone YouTube/video URLs render as plain text links.
- In published view: `MarkdownRenderer` recognizes them and produces iframes.
- Tradeoff accepted: teachers paste a URL and don't see the embed until they save. Acceptable for v1.

---

## Bundle and performance

- BlockNote + shadcn UI: ~200–250 KB gzipped on authoring pages.
- Loaded only on the 5 authoring routes via `next/dynamic`.
- Renderer pages stay at ~30 KB.
- On a 1 Mbps Vietnamese mobile connection: ~2–3s first download, cached thereafter. Acceptable for the long-dwell authoring surfaces (essays, card editing).
- Realtime cost (team notes): ~18k messages/month for an active class — comfortably under the 2M free-tier ceiling.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Markdown round-trip drops formatting on existing content | Test on every existing card before rolling out. Lazy-migration means untouched content never enters BlockNote. |
| BlockNote v0.x churn breaks our integration | Pin a specific minor version; review changelog on upgrade. |
| Team gets stuck because one student never submits | Teacher force-submit RPC (already in the design). |
| RLS bug exposes another team's draft | Migration includes explicit RLS tests on coop_member_drafts. |
| Comment auto-save spams the DB | 1.5s debounce + `pagehide` flush; no per-keystroke writes. |
| Comments locked at submit time but teacher fails → student edits, repeats | Unlock RPC clears all submitted_at AND unfreezes comments together. |

---

## 5-day timeline

### Day 1 — BlockNote integration, simple surfaces
- Install deps: `@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn`.
- Build `src/components/blocknote-editor.tsx` with the standard props.
- Replace `MarkdownEditor` in:
  - `card-editor-form.tsx` (teacher card body)
  - `submission-form.tsx` (student solo submission)
- Add `body_json` / `description_json` columns via migration (approved, applied).
- Verify the markdown round-trip on three existing cards.
- Commit and review with user before Day 2.

### Day 2 — BlockNote on remaining single-user surfaces + co-op schema
- Replace `MarkdownEditor` in:
  - `quest-form.tsx` (teacher quest description)
  - `review-form.tsx` (teacher feedback)
  - `notes-section.tsx` (teacher notes on student)
- Migration: create `coop_member_drafts` table + RLS policies + indexes.
- Migration: alter `quest_submissions` to support per-member finalization (no schema change to text_content_json yet — that's handled in the finalize RPC).
- Initialize drafts when an instance is formed: extend the matchmaking RPC to seed one `coop_member_drafts` row per team member.

### Day 3 — Co-op workspace UI + finalize flow
- Rewrite `src/app/student/my-quests/[id]/page.tsx` to detect co-op + render the team workspace:
  - Top of page: PageHeader with quest title + status pills.
  - Tabbed/dropdown switcher for teammate drafts (your draft is selected by default, editable; teammates' drafts are read-only BlockNote views).
  - "Submit my draft" / "Un-submit" button toggle.
  - Status indicator showing how many members have submitted.
- Migration: `finalize_team_submission(instance_id)` RPC + `force_finalize_team_submission(instance_id)` RPC.
- Migration: `unlock_team_drafts(submission_id)` RPC, wired to teacher fail action.
- Teacher review page (`src/app/teacher/review/[id]/page.tsx`) splits the submission into per-member sections when `instance_id` is set, each in its own card.

### Day 4 — Team notes
- Migration: create `coop_team_notes` table + RLS + indexes.
- New component `team-notes-sidebar.tsx` — collapsible on desktop, sheet on mobile.
- Realtime subscription wiring + auto-save (1.5s debounce + `pagehide` flush).
- Wire the sidebar into the co-op workspace.
- Verify teacher visibility on the review page (after submission) and the lock state during pass/fail cycles.

### Day 5 — Buffer / polish
- Teacher "force submit" UI button on the team workspace teacher-only view (or on the teacher's quest detail page).
- Mobile responsive polish for the team workspace + notes sidebar.
- Edge cases: orphaned drafts when a team member is removed mid-quest, draft initialization for instances created before the migration.
- Smoke-test the full flow with the test1–5 student accounts.

---

## Open items (intentionally deferred)

- Block-level commenting inside the draft (Notion-style anchored comments) — out of scope.
- Real-time co-editing — explicitly rejected.
- Custom BlockNote blocks for our YouTube/video embeds — deferred. Lone URLs render as text in editor, iframe in renderer.
- Migration of historical markdown to `body_json` — deferred. Lazy on first edit.
- BlockNote theming alignment with our forest-green brand — done on Day 1 if straightforward, otherwise polished on Day 5.

---

## Acceptance criteria

A teacher can:
- Open a card in the editor and see a Notion-style block experience.
- Type `/` to insert a heading, list, code block, image link, etc.
- Save the card; the renderer still produces the same output (including YouTube/video embeds).
- Review a coop submission and see per-member sections, each grading the team's contribution.
- See the team's notes panel during/after review.
- Force-submit a stuck team from the team workspace.

A student in a co-op team can:
- See their own draft, switch via dropdown to read teammates' drafts.
- Edit only their own draft; teammates' drafts are read-only.
- Click "Submit my draft" to mark themselves ready; un-submit until the team locks.
- Write team notes in the sidebar; see teammates' notes arrive without refresh.
- Hide the notes sidebar on mobile and have it persist that preference within the session.
