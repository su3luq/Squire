# Phase 8 — MDXEditor + Co-op Per-Member Drafts

**Status:** Day 1 done. MDXEditor on teacher card body and student solo submission.
**Owner:** Single-developer build
**Estimated effort:** 4–5 working days
**Last updated:** 2026-05-27

---

## Editor choice — MDXEditor (rev 2)

Initially planned with BlockNote, but the Notion-style block UI clipped its hovering "+" and drag handles when embedded inside form layouts. Reverted to **MDXEditor** (Lexical-based, markdown-first) which has a top toolbar and inline-styled paragraphs that fit form layouts cleanly.

What MDXEditor gives us:
- Live formatting as you type (`#` → heading, `**` → bold, `- ` → list).
- Toolbar pinned to the top of the editor with bold/italic/headings/lists/link/image/table/HR.
- Block-type select dropdown for converting paragraphs to headings/lists/code.
- Markdown remains the on-disk format — no JSON schema needed.
- Round-trip verified byte-perfect on existing card content.

What we lose vs BlockNote: hovering "+" affordance on each line, drag-handles for block reordering, slash menu. Tradeoff accepted for the cleaner embedded-in-forms behavior.

## Goals

1. Replace the current markdown textarea+preview editor with **MDXEditor** across all five authoring surfaces.
2. Restructure co-op quest submissions so **every team member writes their own draft** (instead of the captain-only flow). Add a dropdown to read teammates' drafts, per-member submit/unsubmit, automatic finalization when the last member submits.
3. Add a **team notes sidebar** — async shared scratchpad with auto-save, visible only to the team during drafting and to the teacher after submission.

Non-goals: real-time multi-cursor collab (rejected in favor of simpler per-member drafts), block-level commenting inside the draft (deferred), structural rich blocks (callouts, columns, etc. — deferred).

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

### Existing tables
**No schema changes.** Markdown stays the only source of truth — `body`, `description`, `text_content`, `teacher_feedback`, `note` are all read/written as markdown text. MDXEditor parses on mount and serializes on save. Verified byte-perfect round-trip.

### New tables

```sql
create table public.coop_member_drafts (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.coop_quest_instances(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  body_md text not null default '',
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

## MDXEditor integration details

### Library choice
- **`@mdxeditor/editor`** ^4.0.1 — engine + React component + Lexical under the hood. Single dep, includes its own stylesheet.

### Markdown round-trip
- MDXEditor reads the `markdown` prop on mount; it's not reactive after that (we use react-hook-form Controller's value once).
- On change, MDXEditor serializes back to markdown via Lexical → MDAST → string.
- **Verified byte-perfect** on existing card content (Lorem Ipsum + heading): 594 chars in, 594 chars out, no drift.
- **Our lone-URL embed convention** is preserved as plain text in the editor. The renderer's `singleLinkHref` logic still fires in published views, so embeds appear correctly on cards / quest briefs / submission previews.

### Component wiring
A single `MdxEditor` component replaces `MarkdownEditor`:

```tsx
'use client';

import { MDXEditor, headingsPlugin, listsPlugin, /* … */, toolbarPlugin } from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';

export function MdxEditor({
  value,
  onChange,
  editable = true,
  minHeight = '400px',
}: Props) {
  return (
    <MDXEditor
      markdown={value}
      onChange={onChange}
      readOnly={!editable}
      contentEditableClassName="prose prose-sm ..."
      plugins={[ /* headings, lists, quote, link, image, table, code, toolbar */ ]}
    />
  );
}
```

Each form keeps its own React Hook Form integration via `<Controller>`. `value`/`onChange` map directly to `markdown`/`onChange` props on MDXEditor.

### Fixed starting size
The wrapper accepts a `minHeight` prop (default `400px`). The editor never collapses to a single line — even an empty card body fills the 400px box. Per-surface overrides: card body 420px, student submission 480px (essays expect more vertical room), teacher feedback/notes 200–240px.

### Dynamic import
`MdxEditor` is itself a `'use client'` component. We can wrap with `next/dynamic({ ssr: false })` in Day 5 polish if the initial render cost becomes noticeable.

### Embed handling (Option 2, confirmed)
- In-editor: lone YouTube/video URLs render as plain-text links.
- In published view: `MarkdownRenderer` recognizes them and produces iframes.
- Tradeoff accepted: teachers paste a URL and don't see the embed until they save. Acceptable for v1.

---

## Bundle and performance

- MDXEditor: ~150–180 KB gzipped on authoring pages.
- Loaded only on the 5 authoring routes (each form imports it directly).
- Renderer pages stay at ~30 KB.
- On a 1 Mbps Vietnamese mobile connection: ~1.5–2s first download, cached thereafter. Acceptable for the long-dwell authoring surfaces (essays, card editing).
- Realtime cost (team notes): ~18k messages/month for an active class — comfortably under the 2M free-tier ceiling.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Markdown round-trip drops formatting on existing content | Verified byte-perfect on representative card. Spot-check the other cards before rolling out to remaining surfaces. |
| MDXEditor v4.x churn breaks our integration | Pin to `^4.0.1`; review changelog on upgrade. |
| Team gets stuck because one student never submits | Teacher force-submit RPC (already in the design). |
| RLS bug exposes another team's draft | Migration includes explicit RLS tests on coop_member_drafts. |
| Comment auto-save spams the DB | 1.5s debounce + `pagehide` flush; no per-keystroke writes. |
| Comments locked at submit time but teacher fails → student edits, repeats | Unlock RPC clears all submitted_at AND unfreezes comments together. |

---

## 5-day timeline

### Day 1 — MDXEditor integration, simple surfaces  ✅ DONE
- ~~Install deps: `@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn`.~~ → Install `@mdxeditor/editor` ^4.0.1.
- Build `src/components/mdx-editor.tsx` with `value`/`onChange`/`editable`/`minHeight` props.
- Replace `MarkdownEditor` in:
  - `card-editor-form.tsx` (teacher card body, 420px min-height)
  - `submission-form.tsx` (student solo submission, 480px min-height)
- Skipped: `body_json` column — markdown stays the only source of truth.
- Verified the markdown round-trip on the Qualitative Data card: byte-perfect.

### Day 2 — MDXEditor on remaining single-user surfaces + co-op schema
- Replace `MarkdownEditor` in:
  - `quest-form.tsx` (teacher quest description, 320px min-height)
  - `review-form.tsx` (teacher feedback, 200px min-height)
  - `notes-section.tsx` (teacher notes on student, 200px min-height)
- Delete the obsolete `markdown-editor.tsx` / `markdown-toolbar.tsx` after all surfaces are migrated.
- Migration: create `coop_member_drafts` table + RLS policies + indexes.
- Initialize drafts when an instance is formed: extend the matchmaking RPC to seed one `coop_member_drafts` row per team member.

### Day 3 — Co-op workspace UI + finalize flow
- Rewrite `src/app/student/my-quests/[id]/page.tsx` to detect co-op + render the team workspace:
  - Top of page: PageHeader with quest title + status pills.
  - Tabbed/dropdown switcher for teammate drafts (your draft is selected by default, editable; teammates' drafts are read-only MDXEditor views).
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

- Block-level commenting inside the draft (Google-Docs-style anchored comments) — out of scope.
- Real-time co-editing — explicitly rejected.
- Custom in-editor previews for our YouTube/video embeds — deferred. Lone URLs render as text in editor, iframe in renderer.
- Persisting an MDXEditor JSON column — not required; markdown is the only source of truth.
- MDXEditor theming alignment with our forest-green brand — Day 1 done at the variable-override level (toolbar accent, focus ring). Further polish on Day 5 if needed.

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
