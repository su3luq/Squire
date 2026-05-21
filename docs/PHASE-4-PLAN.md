# Phase 4 + 5 — Quests: Build Reference (Source of Truth)

Working reference document for Phase 4 (solo + shared infrastructure) and Phase 5 (co-op completion + analytics + AI-likelihood). Architect-locked after the matchmaking pivot.

**Phase 4 milestone:** full solo quest loop works end-to-end. Co-op shell ready (enrollment + matchmaking RPC), but the matchmaking Edge Function and post-match UI ship in Phase 5.

**Phase 5 milestone:** co-op mechanic fully functional (cron + post-match UI), teacher disband works, analytics dashboard, AI-likelihood scoring.

---

## Phase split

Architect's original split holds:

- **Phase 4 (6 commits):** schema (mig 018) + RPCs (mig 019) + quest creator UI + student quest board (with enrollment for coop) + student submission UI + teacher review queue
- **Phase 5 (5 commits):** matchmaking Edge Function + coop post-match UI + disband + analytics dashboard + AI-likelihood

Phase 5 depends on Phase 4 schema + RPCs being in place — `run_matchmaking` ships in Phase 4 commit 2 even though the cron that calls it doesn't ship until Phase 5 commit 1.

---

## Co-op model — matchmaking pivot

The original race-to-fill model is replaced by a batch-matchmaking model. Eliminates race conditions, produces balanced teams, gives the teacher predictable behavior.

### Lifecycle

```
Teacher creates coop quest (max_team_size, expires_at REQUIRED)
        ↓
Students enroll (quest_acceptances.status='enrolled', instance_id=NULL)
        ↓     (students can un-enroll any time before expires_at)
expires_at hits
        ↓
Matchmaking cron picks it up (every 1 min)
        ↓
run_matchmaking(quest_id) — partitioning algorithm runs
        ↓                           ↓                          ↓
N=0                          N=1 (solo conversion)       N≥2 (team formation)
no instances                 1 active acceptance,        K instances created with status='active'
teacher notified             instance_id=NULL            all enrolled acceptances → 'active'
                             notification sent
        ↓                           ↓                          ↓
Quest is closed              Student works solo,         Teams work coop submission,
out                          single-member XP            shared XP on pass per member
```

### Why this works

- **No race conditions.** Matchmaking is a single atomic transaction per quest. No partial fills, no simultaneous-last-slot issues.
- **Balanced teams.** Partitioning algorithm distributes evenly within `max_team_size`. Bad luck of arrival order doesn't matter.
- **Solo conversion (N=1).** Quest doesn't die if only one student signs up. They get to do it solo and earn the same XP.
- **N=0 graceful death.** No instances, teacher gets a notification. Quest stays in the schema as audit.
- **Predictable timing.** Students know exactly when matchmaking happens (the `expires_at` countdown). No surprise from "another team just spawned."

### What's gone

- `coop_instance_status='forming'` — no longer a concept (instances are created at `active` state by matchmaking)
- `coop_instance_status='failed'` — failure lives only at the submission level
- Advisory lock on `accept_coop_quest` — race is gone, lock unneeded
- The `accept_coop_quest` "spawn next instance" logic — matchmaking is the only spawn path
- "Realtime updates on coop instance fills" (was Q9) — no fills to watch

---

## Team partitioning algorithm

**Inputs:** N enrolled students, M = `max_team_size` (≥ 2 enforced at form).

1. **N == 0:** cancel quest, no notifications.
2. **N == 1:** convert to solo. Acceptance flips to `status='active'`, `instance_id=NULL`. Quest type stays `'coop'` (record-keeping). Single-member notification: *"Co-op quest had only one enrollment; you can complete it solo for the same XP."*
3. **N ≥ 2:**
   - `num_teams = min(ceil(N / M), floor(N / 2))`
   - `base = floor(N / num_teams)`
   - `remainder = N mod num_teams`
   - Form `remainder` teams of size `(base + 1)` and `(num_teams - remainder)` teams of size `base`
   - Randomize student → team assignment via `gen_random_bytes` from `pgcrypto`. **Not `random()`** (predictable, seedable, exploitable).

The `min(ceil(N/M), floor(N/2))` formula guarantees:
- `num_teams ≥ 1` when `N ≥ 2`
- Every team has size ≥ 2 (no 1-person teams)
- When M is small relative to N (especially M=2 with odd N), teams may slightly exceed M to satisfy the no-1-person-team constraint

### Worked examples (must verify in implementation)

| N | M | Teams |
|---|---|---|
| 11 | 4 | 4 + 4 + 3 |
| 10 | 4 | 4 + 3 + 3 |
| 13 | 4 | 4 + 3 + 3 + 3 |
| 9 | 4 | 3 + 3 + 3 |
| 5 | 4 | 3 + 2 |
| 7 | 4 | 4 + 3 |
| 2 | 4 | 2 |
| 3 | 2 | 3 (M overflow by 1) |
| 5 | 2 | 3 + 2 (one overflow) |
| 7 | 2 | 3 + 2 + 2 (one overflow) |
| 9 | 2 | 3 + 2 + 2 + 2 (one overflow) |
| 4 | 2 | 2 + 2 |

### Form-level constraint

- `max_team_size`: integer, minimum 2, no maximum (beyond reason). Form validates ≥ 2.
- When `max_team_size = 2`, the creator form displays an inline note: *"If the number of enrolled students is odd, one team may have 3 members."*

---

## Schema state going into Phase 4

Already in place (from earlier migrations):

- **`quests`** — `(id, class_id, title, description markdown, quest_type, word_limit_min, xp_reward, group_size, max_instances, availability_mode, expires_at, closed_at, created_at)`. Will rename `group_size → max_team_size` in migration 018.
- **`coop_quest_instances`** — `(id, quest_id, status, started_at, submitted_at, reviewed_at, created_at)`. Enum updates in migration 018.
- **`quest_acceptances`** — `(id, student_id, quest_id, instance_id, status, accepted_at, completed_at)`. Will add `quest_type` denormalization column in migration 018 (see below). Indexes updated.
- **`quest_submissions`** — currently has legacy `audio_url`, `image_urls`, `youtube_link` columns. Dropped in migration 018.
- **`xp_ledger`**, **`notifications`** — unchanged.

### Enum baseline (will change in 018)

- `quest_type`: `solo` | `coop` | `daily_quiz` (`daily_quiz` dead per Plan B; stays in enum but never used)
- `quest_acceptance_status`: `active` | `submitted` | `passed` | `failed` → add `enrolled` and `disbanded` in 018
- `quest_submission_status`: `pending_review` | `passed` | `failed` — unchanged
- `coop_instance_status`: `forming` | `active` | `submitted` | `passed` | `failed` | `disbanded` → drop `forming` and `failed` in 018

---

## Migration 018 — schema overhaul for matchmaking model

Single migration covering all schema changes for Phase 4/5:

1. **Enum changes:**
   - `quest_acceptance_status`: ADD `'enrolled'`, ADD `'disbanded'` (`ALTER TYPE ... ADD VALUE`)
   - `coop_instance_status`: DROP `'forming'`, DROP `'failed'` (swap-pattern: new enum → recast column → drop old → rename)

2. **`quests` table:**
   - RENAME column `group_size` → `max_team_size`
   - Update CHECK constraint `coop_has_group_size` → `coop_has_max_team_size`, predicate unchanged (`quest_type != 'coop' OR (max_team_size IS NOT NULL AND max_team_size >= 2)`)

3. **`quest_acceptances` table — denormalize `quest_type`:**
   - ADD column `quest_type quest_type` (nullable initially)
   - Backfill from `quests`
   - Set `NOT NULL` after backfill
   - BEFORE INSERT trigger to auto-populate from the parent quest on future inserts (so RPCs and direct INSERTs both populate correctly)

   **Why denormalize:** Postgres partial indexes can't have subqueries or JOINs in their `WHERE` clauses. To enforce "one active coop per student" the index needs to know the row's quest type without a join. Denormalization is the cleanest path — small storage cost, trigger ensures invariant.

4. **`quest_acceptances` index updates:**
   - DROP existing `idx_one_active_coop_per_student`. CREATE replacement:
     ```sql
     CREATE UNIQUE INDEX idx_one_active_coop_per_student
       ON quest_acceptances (student_id)
       WHERE quest_type = 'coop' AND status IN ('active', 'enrolled');
     ```
   - DROP existing `idx_no_repeat_coop_per_student`. CREATE replacement:
     ```sql
     CREATE UNIQUE INDEX idx_no_repeat_coop_per_student
       ON quest_acceptances (student_id, quest_id)
       WHERE quest_type = 'coop' AND status IN ('active', 'passed');
     ```
     Allows re-enrollment after `disbanded` or `enrolled` previously (the latter shouldn't happen normally; defensive).
   - DROP existing `idx_one_active_solo_per_student`. CREATE replacement using the new denormalized column:
     ```sql
     CREATE UNIQUE INDEX idx_one_active_solo_per_student
       ON quest_acceptances (student_id)
       WHERE quest_type = 'solo' AND status = 'active';
     ```

5. **`quest_submissions` table:**
   - DROP columns: `audio_url`, `image_urls`, `youtube_link` (legacy from pre-Plan-B; markdown-only now)
   - ADD partial unique constraints to prevent double-pending submissions:
     ```sql
     CREATE UNIQUE INDEX uq_one_pending_per_acceptance
       ON quest_submissions (acceptance_id)
       WHERE status = 'pending_review' AND acceptance_id IS NOT NULL;
     CREATE UNIQUE INDEX uq_one_pending_per_instance
       ON quest_submissions (instance_id)
       WHERE status = 'pending_review' AND instance_id IS NOT NULL;
     ```

6. **`coop_quest_instances`:** no structural changes beyond the enum swap.

---

## Migration 019 — quest action RPCs

All `SECURITY DEFINER` with `SET search_path = public`. REVOKE from anon, GRANT to authenticated (with internal role/identity checks). Same chokepoint pattern as `submit_mcq_answer` and `unlock_lesson_cards`.

### 1. `accept_solo_quest(p_quest_id uuid) → jsonb`

- Check: caller is student in quest's class, quest is `quest_type='solo'`, quest not closed (`closed_at IS NULL`), quest not expired (`expires_at IS NULL OR expires_at > now()`), caller has no active solo (via index check).
- INSERT acceptance row: `status='active'`.
- INSERT notification (optional — student just acted).
- Return `{ok, acceptance_id}` or `{ok: false, error}`.

### 2. `accept_coop_quest(p_quest_id uuid) → jsonb`

Simplified — no advisory lock, no spawn logic.

- Check: caller is student in quest's class, quest is `quest_type='coop'`, quest `expires_at > now()`, quest not closed, caller has no active or enrolled coop (via index), caller has no prior `active`/`passed` acceptance on this quest.
- INSERT acceptance row: `status='enrolled'`, `instance_id=NULL`.
- INSERT notification: *"You enrolled in '<quest>'. Matchmaking runs at <expires_at>."*
- Return `{ok, acceptance_id}` or `{ok: false, error}`.

### 3. `unenroll_coop_quest(p_quest_id uuid) → jsonb`

- Check: caller has an `enrolled` acceptance on this quest.
- DELETE the row.
- No notification (optional — student just acted).
- Return `{ok}` or `{ok: false, error}`.

### 4. `run_matchmaking(p_quest_id uuid) → jsonb`

The heart of co-op. Called by the Edge Function cron (Phase 5) or by a teacher in emergency. Service-role only at the GRANT level; teachers can call via internal `is_teacher()` check.

- Verify caller is service-role OR teacher of quest's class.
- Verify quest is `quest_type='coop'`.
- Verify matchmaking hasn't already run (no `coop_quest_instances` rows for this quest).
- `SELECT ... FOR UPDATE` on the quest row to serialize concurrent attempts.
- `SELECT all enrolled acceptance student_ids` for the quest, ORDER BY a randomized key derived from `gen_random_bytes` (shuffle).
- Apply partitioning algorithm (above).
- For each team:
  - INSERT `coop_quest_instances`: `status='active'`, `started_at=now()`.
  - UPDATE acceptance rows for that team's members: `status='active'`, `instance_id` set.
  - INSERT notification per member: *"Your team for '<quest>' is ready."*
- For N=1: skip instance creation, flip the single acceptance to `status='active'`, `instance_id=NULL`. Notification: *"Coop quest had only one enrollment; you can complete it solo."*
- For N=0: insert notification to teacher: *"Coop quest '<title>' expired with no enrollments."* No instances.
- Return `{ok, teams_formed, team_sizes, solo_conversion, no_enrollments}`.

### 5. `submit_quest(p_acceptance_id uuid NULL, p_instance_id uuid NULL, p_text_content text) → jsonb`

- Exactly one of `p_acceptance_id`/`p_instance_id` non-null (mirrors the table CHECK).
- Compute `word_count` server-side. Strip markdown syntax characters (`* _ # ` > [ ]`) before tokenizing on whitespace.
- Check: caller owns the acceptance (solo) or is a member of the instance (coop); acceptance/instance status is `active`; no existing `pending_review` submission for the same acceptance/instance.
- INSERT `quest_submissions`: `status='pending_review'`, `submitted_by=auth.uid()`.
- For coop: transition `coop_quest_instances.status='submitted'`, set `submitted_at`.
- INSERT notification to teacher: *"<student> submitted '<quest>'."*
- Return `{ok, submission_id, word_count}` or `{ok: false, error}`.

### 6. `review_submission(p_submission_id uuid, p_pass boolean, p_feedback text) → jsonb`

- Check: caller is teacher.
- Pass:
  - Submission `status='passed'`, `reviewed_at=now()`.
  - Solo: acceptance `status='passed'`, `completed_at=now()`. Insert one `xp_ledger` row (`amount=quest.xp_reward`, `reason='quest_passed'`).
  - Coop: instance `status='passed'`, `reviewed_at=now()`. ALL member acceptances → `status='passed'`. Insert N `xp_ledger` rows.
  - Notifications: per-recipient.
- Fail:
  - Submission `status='failed'`, `teacher_feedback=p_feedback`, `reviewed_at=now()`.
  - Acceptance stays `active`.
  - Coop instance: `status='submitted'` → `status='active'` (members can resubmit).
  - Notifications.
- Return `{ok, xp_awarded, members_affected}` or `{ok: false, error}`.

### 7. `disband_coop_instance(p_instance_id uuid) → jsonb`

- Check: caller is teacher; instance status is `active` (not yet submitted).
- Instance `status='disbanded'`.
- Member acceptances: flip `status='disbanded'` (NOT deleted — preserves audit trail). The new no-repeat-coop index excludes `disbanded`, so members are free to enroll in this quest again if it's still open.
- Notifications to members: *"Your team for '<quest>' was disbanded by the teacher."*
- Return `{ok, members_released}`.

---

## UI design

### Teacher

**`/teacher/quests`** — list view
- All quests for the teacher's class(es). Filter chips by status (Active / Closed / Expired). Each row: title, type (solo/coop badge), XP, **active-students indicator**, pending-review count.
- Active-students indicator:
  - Solo: `"3 Active"`
  - Coop pre-matchmaking: `"5 enrolled, matchmaking in 2d 3h"` (live countdown)
  - Coop post-matchmaking: `"3 teams of 4"` (or mixed sizes: `"2 teams of 4, 1 team of 3"`)
- "New quest" button.

**`/teacher/quests/new`** — single-page creator form with collapsible sections (not multi-step modal):
- Section "Basics": type radio (solo/coop), title, markdown description (reuse `<MarkdownEditor>`)
- Section "Mechanics": XP reward (number, no form-level bounds — DB enforces `> 0`), `word_limit_min` (optional target hint)
- Section "Co-op" (visible only when type=coop): `max_team_size` (number ≥ 2), `expires_at` (datetime, required for coop, Saigon-displayed). Inline note when `max_team_size=2`: *"If the number of enrolled students is odd, one team may have 3 members."*
- Section "Schedule" (for solo only): `expires_at` (optional)
- Bottom: rendered Preview panel. Publish button.

**`/teacher/quests/[id]`** — detail
- Header: title, type badge, XP, status, expires_at countdown if set, **active-students indicator** (same component as list)
- Tabs: Description (rendered) · Acceptances (table) · Submissions (history)
- Coop: extra "Instances" panel showing each instance, member list, status. Disband button on `active` instances.
- Edit button → form (sections same as creator)
- Close button → sets `closed_at` (stops new entrants; in-flight work continues)
- Delete button → confirmation modal; blocked if any `pending_review` submission exists (UI surfaces "Review pending submissions before deleting")

**Edit form rules:**
- ALL fields editable when no acceptances exist
- When acceptances exist: `max_team_size` and `max_instances` LOCKED with inline notice *"This coop quest has active members. Group size and max instances can't be changed."* Other fields stay editable. Live-update model (no per-acceptance snapshot).

**`/teacher/review`** — submission queue
- Default sort: oldest `pending_review` first
- Filter dropdowns: by quest, by student (filters are commit-6 polish; if they slip to Phase 5 that's fine — default sort is required)
- Click row → intercepting modal at `/teacher/review/@modal/(.)submissions/[id]`

**Review modal:**
- Quest title + student name + word count badge ("142 words · target: 150" if set)
- Rendered submission markdown
- Feedback markdown editor (required if Fail)
- Pass / Fail buttons → calls `review_submission` → revalidate queue

### Student

**`/student/quests`** — board
- Sections: "Solo quests" (open + eligible + not yet accepted), "Co-op quests" (`expires_at > now()` + eligible + not enrolled)
- Each coop card shows: enrolled count + matchmaking countdown
- Each card: Accept (solo) or Enroll (coop) button if eligible; "Enrolled" badge if already in; "Already done" if no-repeat blocks

**`/student/quests/[id]`** — quest detail
- Full description rendered
- Solo: Accept button if eligible
- Coop pre-matchmaking: enrollment count + countdown + Enroll/Unenroll toggle
- Coop post-matchmaking: redirects (or shows link) to `/student/my-quests`

**`/student/my-quests`** — active work
- Sections: "In progress" (active solo + active coop instance), "Enrolled in coop" (pre-matchmaking), "Awaiting review" (submitted), "Resubmit needed" (last submission failed), "Completed" (passed)

**Submission UI** — embedded on `/student/my-quests/[id]` or its own route
- Markdown editor (reuse from Phase 2)
- Live word counter under editor (matches server-side counter logic)
- Submit button → `submit_quest` RPC
- **Failed-resubmit UX (commit 5 must include):**
  - Teacher feedback prominently displayed at top
  - Read-only view of the previous failed submission text + its word count
  - Large "Resubmit" affordance that re-opens the editor
  - Pedagogical intent: failure is a learning moment, not punishment

### Coop instance member view (Phase 5)

`/student/my-quests/[id]` for coop members shows:
- Team panel with all member names
- Shared submission editor (any member can submit)
- Disbanded state shows the disband message, no editor

---

## Locked-quest semantics

**Visible to a student** when ALL:
1. `quest.class_id` matches `student.class_id`
2. `quest.closed_at IS NULL` (teacher hasn't manually closed)
3. `quest.expires_at IS NULL OR quest.expires_at > now()` (not expired — for coop, this is the matchmaking deadline)
4. Solo: student doesn't already have an active solo acceptance
5. Coop: student doesn't have prior `active`/`passed` acceptance on this quest AND has no other active or enrolled coop AND matchmaking hasn't run yet (no `coop_quest_instances` rows)

**Acceptable** when visible AND eligibility check passes (in the RPC).

**Closing a quest** stops new accepts/enrollments. Does NOT cancel in-flight work:
- Existing solo acceptances can still submit
- Pending submissions must be reviewed
- Coop instances continue to passed/disbanded

**Deleting a quest:**
- Allowed if no submissions exist OR all submissions reviewed (passed/failed)
- BLOCKED if any submission has `status='pending_review'`
- Transaction includes `SELECT FOR UPDATE` on `quest_submissions WHERE quest_id=X` to prevent the race where a student submits between the teacher's pending-check and the delete
- Hard delete (no soft-delete column). Cascade removes acceptances + submissions + coop instances.

---

## Notification model (app-side INSERTs for v1)

DB triggers deferred to v2. For v1, the RPCs and server actions INSERT directly into `notifications`. Phase 6 picks them up and delivers via Web Push.

| Event | Recipient | Source |
|---|---|---|
| Quest passed | Student (solo) / All members (coop) | `review_submission` |
| Quest failed | Same | `review_submission` |
| Coop matchmaking completed | All members (per team) | `run_matchmaking` |
| Coop solo-converted | The single student | `run_matchmaking` |
| Coop no-enrollments | Teacher | `run_matchmaking` |
| Coop disbanded | All members | `disband_coop_instance` |
| Student enrolled in coop | Student (self ack) | `accept_coop_quest` |
| New submission to review | Teacher | `submit_quest` |
| New quest posted | All class students | Server action after `INSERT INTO quests` |

---

## Edge Function (Phase 5)

`matchmaking-cron` — runs every 1 minute. Logic:

```sql
SELECT q.id
FROM public.quests q
WHERE q.quest_type = 'coop'
  AND q.expires_at <= now()
  AND NOT EXISTS (
    SELECT 1 FROM public.coop_quest_instances cqi
    WHERE cqi.quest_id = q.id
  );
```

For each row, call `SELECT public.run_matchmaking(q.id)`.

Same deployment pattern as the velocity Edge Function would have used (we went pure-SQL for that one). For matchmaking, an Edge Function is needed because the cron needs to be HTTP-triggered (Supabase scheduled functions) OR we use `pg_cron` calling the RPC directly. **Recommend `pg_cron` calling `run_matchmaking()` in a loop** — same precedent as migration 017's velocity job. No Edge Function needed at all. If the architect prefers Edge Function for observability, easy swap in Phase 5.

---

## Commit sequence

### Phase 4 (6 commits, solo + shared infrastructure)

| # | Commit | Scope |
|---|---|---|
| 1 | `feat(db): migration 018 — quest schema overhaul for matchmaking coop model` | Enum additions/drops, column rename, quest_type denormalization on quest_acceptances, index updates, legacy column drops on quest_submissions |
| 2 | `feat(db): migration 019 — quest RPCs (accept, submit, review, run_matchmaking, disband, unenroll)` | All 7 RPCs above. `run_matchmaking` lands here even though it's used in Phase 5 |
| 3 | `feat(phase-4): teacher quest CRUD + creator + detail + edit + delete` | Single-page form, active-students indicator, edit field locks, deletion with race protection |
| 4 | `feat(phase-4): student quest board (solo accept + coop enroll/unenroll with countdown)` | `/student/quests` board, eligibility filtering, countdown |
| 5 | `feat(phase-4): student submission UI with word counter and failed-resubmit UX` | `/student/my-quests`, markdown editor + word counter, failed-resubmit treatment per spec item A |
| 6 | `feat(phase-4): teacher review queue with default sort + pass/fail modal` | `/teacher/review` queue (oldest-pending first), intercepting modal, filters (polish, may slip) |

After commit 6, **solo quest loop is end-to-end**. Co-op enrollment works (rows exist) but matchmaking can only be manually triggered via DB until Phase 5.

### Phase 5 (5 commits, co-op completion + analytics + AI)

| # | Commit | Scope |
|---|---|---|
| 7 | `feat(db): migration 020 — pg_cron schedule for matchmaking` | Cron entry calling `run_matchmaking` for due quests every 1 min (or Edge Function if architect prefers) |
| 8 | `feat(phase-5): coop post-matchmaking UI` | Team panel, shared submission editor, disbanded state, member list |
| 9 | `feat(phase-5): teacher disband action + coop status detail panel` | Disband button + confirmation modal, `disband_coop_instance` RPC wiring |
| 10 | `feat(phase-5): teacher analytics dashboard` | Weekly XP, completion rates, activity heatmap, card retention, live feed (per `PLAN.md §8 Phase 5`) |
| 11 | `feat(phase-5): AI-likelihood classifier integration` | Score populated into `quest_submissions.ai_likelihood_score`, surfaced in review modal. Classifier choice TBD per `PLAN.md §10` |

---

## Decisions locked

All 11 prior open questions + 7 design proposals + 5 spec items, recap for the record:

| Decision | Outcome |
|---|---|
| Q1 phase split | Keep split (4 = solo, 5 = coop/analytics/AI) |
| Q2 creator UI | Single-page form, collapsible sections |
| Q3 `coop_instance_status='failed'` | Dropped from enum |
| Q4 disband behavior | `quest_acceptance_status='disbanded'`, audit trail preserved, no-repeat-coop index excludes it |
| Q5 repeatable solo quests | No `idx_no_repeat_solo`. Teacher closes the quest if they don't want repeats |
| Q6 legacy submission columns | DROP `audio_url`, `image_urls`, `youtube_link` |
| Q7 notification model | App-side INSERTs for v1 |
| Q8 XP reward validation | No form-level bounds; DB only enforces `xp_reward > 0` |
| Q9 realtime coop fills | DROPPED — race condition gone with matchmaking pivot |
| Q10 edit published quest | All fields editable, EXCEPT `max_team_size`/`max_instances` locked when acceptances exist |
| Q11 closed quests | Closing stops new entrants; in-flight work continues |
| Design A | Two migrations (018 schema, 019 RPCs) — APPROVED |
| Design B | Single-page creator — APPROVED |
| Design C | Advisory lock — REMOVED (matchmaking pivot) |
| Design D | `coop_instance_status='failed'` dropped — APPROVED |
| Design E | Disband via status flip not DELETE — APPROVED |
| Design F | App-side notifications — APPROVED |
| Design G | Server-side word counter — APPROVED |
| Spec A | Failed-resubmit UI prominent in commit 5 |
| Spec B | Review queue oldest-first sort + optional filters |
| Spec C | Active-students indicator on list + edit page |
| Spec D | Hard-delete race protection via SELECT FOR UPDATE |
| Spec E | Coop field locks: `max_team_size`/`max_instances` locked when acceptances exist |
| Quest editing model | Live update, no per-acceptance snapshot |
| Matchmaking trigger | `expires_at` doubles as enrollment deadline + matchmaking trigger |
| Team partitioning | `min(ceil(N/M), floor(N/2))` formula with worked examples |
| Random shuffle | `gen_random_bytes` from `pgcrypto`, not `random()` |
| AI-likelihood | Populates existing `quest_submissions.ai_likelihood_score` (no new table) |
| Phase 5 cron | Recommend `pg_cron` over Edge Function (same precedent as velocity) |

---

## Risks

1. **Matchmaking edge cases.** N=0 and N=1 are handled. N=2 with M=4 → 1 team of 2 (fine). N=2 with M=2 → 1 team of 2 (fine). N=3 with M=2 → 1 team of 3 (overflow, intentional). Algorithm tests should cover these.

2. **Resubmission loop.** A student can fail and resubmit indefinitely. Teacher could leave them stuck. v2: add `max_attempts` per quest.

3. **Word-count divergence.** Client-side word count (for live counter) and server-side word count (authoritative, stored on submission) must use the same algorithm. Risk: they drift, student sees "150 words" client-side but server records "148." Solution: share the algorithm — implement once in TS, expose via `/lib/word-count.ts`, also implement in PL/pgSQL with the same logic. Document the algorithm so they stay in sync.

4. **`run_matchmaking` is non-idempotent in current spec.** If it runs twice (cron + manual teacher trigger), the second run sees existing instances and exits early. Safe. But if cron crashes mid-execution, partial state could leave dangling `enrolled` acceptances without instances. Mitigation: wrap the entire run in a transaction with savepoints, or use `SELECT FOR UPDATE` on the quest row. Transaction is the cleaner default — and is already specified.

5. **Cron misfire.** If the Edge Function / pg_cron fails to fire at the scheduled minute, matchmaking is delayed. Acceptable — students enrolled, world doesn't end. Next minute's run picks up the backlog.

6. **Coop instance with single member (solo conversion) edge case.** The student now sees a "coop" quest that they're working on solo. UI must handle: detail page shows "Converted to solo" badge, submission flow works (acceptance_id, instance_id=NULL — submit_quest handles this via the same path as solo).

7. **Coop fail loop.** If a team submits, fails, resubmits, fails again, etc. — same as solo fail loop. No team-specific concern.

---

## Validation discipline (per commit)

1. `npm run typecheck` — exit 0
2. `npm run lint` — clean
3. `npm run dev` — boot, curl key routes
4. After migration: `mcp__claude_ai_Supabase__get_advisors security` — report new lints
5. End-to-end manual check on the milestone
6. Commit + push

---

## What's NOT in Phase 4

- Co-op post-matchmaking UI (Phase 5)
- Matchmaking cron deployment (Phase 5)
- Analytics dashboard (Phase 5)
- AI-likelihood scoring (Phase 5)
- Realtime updates (out — race gone, not needed)
- Push notification delivery (Phase 6)
- Quest expiry cron for solo (Phase 6 — adds notification when solo quest is near expiry)
- 4-day-review-streak miss detector (Phase 6 per Plan B doc)
- Per-quest `max_attempts` limit (v2 backlog)
- Standalone quiz quests (v2 backlog)

---

## Next steps

1. Commit this doc as source-of-truth: `docs: lock Phase 4-5 plan source-of-truth (matchmaking coop model)`
2. Draft migration 018 SQL, surface for user approval
3. Apply migration 018, regen types, commit
4. Draft migration 019 SQL, surface for approval
5. Apply migration 019, regen types, commit
6. Autonomous execution of Phase 4 commits 3–6 with Y/N push checks
7. Architect check-in at Phase 4 completion before Phase 5 begins
