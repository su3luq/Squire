# RankedLearning — Database Schema Reference

Authoritative reference for all 16 tables in the `public` schema of the RankedLearning Supabase project (`dicufymnejhrkrakgluu`). Match this exactly when writing queries.

**Project region:** `ap-northeast-2` (Seoul)
**Postgres version:** 17

---

## Enums

```sql
user_role           : 'teacher' | 'student'
quest_type          : 'solo' | 'coop' | 'daily_quiz'
quest_availability_mode : 'open' | 'timed' | 'whole_class' | 'limited_instances'
coop_instance_status: 'active' | 'submitted' | 'passed' | 'disbanded'
quest_acceptance_status : 'active' | 'enrolled' | 'submitted' | 'passed' | 'failed' | 'disbanded'
quest_submission_status : 'pending_review' | 'passed' | 'failed'
card_review_state   : 'new' | 'learning' | 'review' | 'relearning'
push_platform       : 'ios' | 'android' | 'web'
```

**Lifecycle notes (post-migration 018):**
- `coop_instance_status` lost `'forming'` and `'failed'`. Matchmaking spawns instances directly at `'active'`; failure lives only at the submission level.
- `quest_acceptance_status` gained `'enrolled'` (student enrolled in a pre-matchmaking coop quest, no team yet) and `'disbanded'` (teacher released the instance; the row is preserved for audit but does not block re-enrollment).

---

## Tables

### `classes`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | |
| invite_code | text UNIQUE NOT NULL | short; used for QR + manual entry |
| created_at | timestamptz | |
| archived_at | timestamptz | nullable |

### `profiles`
Extends `auth.users` (id matches `auth.users.id`).

| Column | Type | Privacy | Notes |
|---|---|---|---|
| id | uuid PK = auth.users.id | | |
| role | user_role NOT NULL | public | |
| full_name | text NOT NULL | public | public display name (shown to classmates) |
| email | text NOT NULL | self + teacher | also the auth identity |
| avatar_url | text | public | |
| age | int | class | |
| class_id | uuid FK classes | self + teacher | nullable on creation |
| interest_tags | text[] | class | |
| xp_total | int DEFAULT 0 | public | **do not write directly** — use `xp_ledger` |
| current_rank | int DEFAULT 1 | public | 1-7, **auto-updated by trigger** |
| learning_velocity | numeric(4,3) DEFAULT 0 | class | 0.000-1.000, updated by cron |
| created_at | timestamptz | self + teacher | |
| last_active_at | timestamptz | teacher | |

Notes:
- Previously had `english_proficiency_pearson` / `english_proficiency_cefr` columns. Moved to `student_assessments` in migration 008 (Postgres RLS is row-level, not column-level).
- Previously had `username` and `display_name` columns. Dropped in migration 010 when the auth model switched to email + password; `full_name` is now the public display field.

### `student_assessments`
**Teacher-only at all times.** Row-level home for fields previously in `profiles` whose privacy could not be enforced by RLS while they shared a row with student-readable columns.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | DEFAULT `gen_random_uuid()` |
| student_id | uuid FK profiles | UNIQUE, `ON DELETE CASCADE` |
| english_proficiency_pearson | int | nullable; CHECK 10-90 if set |
| english_proficiency_cefr | text | nullable |
| updated_at | timestamptz NOT NULL DEFAULT now() | auto via `trg_assessments_updated_at` → `set_updated_at()` |

Index: `idx_assessments_student` on `(student_id)`.

RLS: single policy `student_assessments_teacher_all` — teachers can do everything, students see nothing.

### `teacher_notes`
**Teacher-only at all times.**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK profiles | |
| note | text NOT NULL | |
| created_at | timestamptz | |
| updated_at | timestamptz | auto via trigger |

### `lessons`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| class_id | uuid FK classes | |
| title | text NOT NULL | |
| lesson_number | int NOT NULL | unique per class |
| taught_at | timestamptz | nullable |
| cards_unlocked_at | timestamptz | when teacher pushed cards to students; nullable |
| created_at | timestamptz | |

### `review_cards`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| lesson_id | uuid FK lessons | |
| headline | text NOT NULL | shown in library + used as recall prompt |
| body | text NOT NULL DEFAULT '' | markdown text; rendered with `react-markdown` + `remark-gfm`. Raw HTML disabled. |
| position | int DEFAULT 0 | display order |
| created_at | timestamptz | |

### `card_quiz_questions`
**Never shown on the card detail page (library view). Surface only via the FSRS-driven review flow at `/student/review`, where students answer them via the `submit_mcq_answer` RPC (migration 015). `correct_choice` is teacher-only readable; the function does the comparison server-side.**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| card_id | uuid FK review_cards | |
| question_text | text NOT NULL | |
| choice_a / choice_b / choice_c / choice_d | text NOT NULL | |
| correct_choice | char(1) NOT NULL | 'a'/'b'/'c'/'d'; **students must not read this column** |
| created_at | timestamptz | |

### `card_reviews`
FSRS state per (student, card). Unique on (student_id, card_id).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK profiles | |
| card_id | uuid FK review_cards | |
| stability | numeric DEFAULT 0 | FSRS internal |
| difficulty | numeric DEFAULT 0 | FSRS internal |
| due_at | timestamptz DEFAULT now() | next review due |
| last_reviewed_at | timestamptz | nullable |
| review_count | int DEFAULT 0 | |
| state | card_review_state DEFAULT 'new' | |
| fsrs_params_version | int DEFAULT 1 | bump if FSRS weights change |
| created_at | timestamptz | |

### `quests`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| title | text NOT NULL | |
| description | text NOT NULL DEFAULT '' | markdown text; rendered with `react-markdown` + `remark-gfm`. Raw HTML disabled. |
| quest_type | quest_type NOT NULL | one of 'solo', 'coop', 'daily_quiz' (migration 011 dropped 'quiz') |
| word_limit_min | int | nullable |
| xp_reward | int NOT NULL > 0 | |
| max_team_size | int | required if `quest_type='coop'`, ≥2 (enforced by `coop_has_max_team_size` CHECK). Renamed from `group_size` in migration 018b — semantic clarity: this is the cap, not a guaranteed group size, since matchmaking may form smaller teams when enrollment doesn't divide evenly. |
| max_instances | int | nullable; null = unlimited |
| availability_mode | quest_availability_mode DEFAULT 'open' | |
| expires_at | timestamptz | for timed quests |
| created_at | timestamptz | |
| closed_at | timestamptz | nullable; null = active |

Migration 011 dropped `quiz_questions` (jsonb) and `deliverable_types` (text[]). Quizzes only exist as the auto-generated daily quiz; all non-daily-quiz submissions are markdown text (no file uploads, no deliverable-type checkboxes).

Migration 021 dropped `class_id` — quests are now class-agnostic. Every class sees every open quest. Class scoping moved to `coop_quest_instances.class_id` (for coop teams) and to submissions via the submitter's profile (for solo).

### `coop_quest_instances`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| quest_id | uuid FK quests | |
| class_id | uuid FK classes NOT NULL | the class this team belongs to. Matchmaking forms teams per class; no cross-class teams. (migration 021) |
| status | coop_instance_status DEFAULT 'active' | matchmaking spawns instances directly at `'active'`; there is no `'forming'` phase (migration 018b) |
| started_at | timestamptz | set at insert time by matchmaking |
| submitted_at | timestamptz | |
| reviewed_at | timestamptz | |
| created_at | timestamptz | |

Index: `idx_coop_instances_class` on `(class_id)` (migration 021).

### `quest_acceptances`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK profiles | |
| quest_id | uuid FK quests | |
| instance_id | uuid FK coop_quest_instances | NULL for solo and for pre-matchmaking coop (`status='enrolled'`); set when matchmaking assigns the row to a team |
| status | quest_acceptance_status DEFAULT 'active' | |
| quest_type | quest_type NOT NULL | denormalized from `quests.quest_type`; auto-populated by `trg_quest_acceptances_set_quest_type` BEFORE INSERT trigger. Required because Postgres partial unique index predicates cannot use subqueries or joins (migration 018b) |
| accepted_at | timestamptz DEFAULT now() | |
| completed_at | timestamptz | |

**Constraints via partial unique indexes (rebuilt in migration 018b):**
- `idx_one_active_solo_per_student` — `WHERE quest_type = 'solo' AND status = 'active'`
- `idx_one_active_coop_per_student` — `WHERE quest_type = 'coop' AND status IN ('active', 'enrolled')`
- `idx_no_repeat_coop_per_student` — `(student_id, quest_id) WHERE quest_type = 'coop' AND status IN ('active', 'passed')`. Excludes `'disbanded'` and `'enrolled'`, so a student whose team was disbanded by the teacher can re-enroll in the same quest.

### `quest_submissions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| acceptance_id | uuid FK quest_acceptances | for solo submissions |
| instance_id | uuid FK coop_quest_instances | for coop submissions |
| submitted_by | uuid FK profiles | which student submitted |
| text_content | text | markdown body; media is embedded via standard markdown image / link / iframe syntax |
| word_count | int | computed server-side in `submit_quest` RPC |
| ai_likelihood_score | numeric(4,3) | 0.000-1.000; Phase 5 classifier |
| status | quest_submission_status DEFAULT 'pending_review' | |
| teacher_feedback | text | required on fail |
| reviewed_at | timestamptz | |
| submitted_at | timestamptz DEFAULT now() | |

Migration 018b dropped `audio_url`, `image_urls`, `youtube_link` — submissions are markdown-only per Plan B (external URLs in markdown, no file uploads).

**Constraints:**
- Exactly one of `acceptance_id` or `instance_id` must be non-null.
- `uq_one_pending_per_acceptance` — partial unique on `(acceptance_id) WHERE status = 'pending_review' AND acceptance_id IS NOT NULL`. Prevents a second pending submission while one is awaiting review (solo).
- `uq_one_pending_per_instance` — partial unique on `(instance_id) WHERE status = 'pending_review' AND instance_id IS NOT NULL`. Same guarantee for coop (one team submission at a time).

### `review_attempts`
One row per MCQ answer (migration 015). Inserts only via `submit_mcq_answer` SECURITY DEFINER RPC — never directly from client code. RLS: teacher reads all; student reads own. No INSERT/UPDATE/DELETE policies.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK profiles | `ON DELETE CASCADE` |
| card_id | uuid FK review_cards | `ON DELETE CASCADE` |
| quiz_question_id | uuid FK card_quiz_questions | `ON DELETE CASCADE` |
| selected_choice | char(1) NOT NULL | CHECK `lower(selected_choice) IN ('a','b','c','d')` |
| is_correct | boolean NOT NULL | computed by `submit_mcq_answer` against teacher-only `correct_choice` |
| answered_at | timestamptz NOT NULL DEFAULT now() | |
| xp_awarded | int NOT NULL DEFAULT 0 | 5 if correct, 0 if wrong |
| card_review_state_at_answer | card_review_state NOT NULL | snapshot of `card_reviews.state` at the moment of the answer; for analytics |

Indexes:
- `idx_review_attempts_student` on `(student_id, answered_at DESC)`
- `idx_review_attempts_student_card` on `(student_id, card_id, answered_at DESC)`
- `idx_review_attempts_card` on `(card_id, answered_at DESC)`

Idempotency: not enforced at the DB. A network retry of `submit_mcq_answer` can produce duplicate ledger rows. Documented v1 trade-off; revisit if it becomes a real problem.

### `xp_ledger`
Append-only audit trail. **Insert here to award XP; trigger auto-updates `profiles.xp_total` and `current_rank`.**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK profiles | |
| amount | int NOT NULL | can be negative for adjustments |
| reason | text NOT NULL | e.g. `'daily_quiz'`, `'quest_passed'` |
| source_table | text | e.g. `'quest_submissions'` |
| source_id | uuid | row id in source_table |
| created_at | timestamptz | |

### `notifications`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK profiles | |
| type | text NOT NULL | e.g. `'rank_up'`, `'quest_approved'` |
| title | text NOT NULL | |
| body | text NOT NULL | |
| data | jsonb DEFAULT '{}' | deep-link payload |
| read_at | timestamptz | |
| pushed_at | timestamptz | NULL = pending push |
| override_quiet_hours | bool DEFAULT false | |
| created_at | timestamptz | |

### `push_tokens`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK profiles | |
| expo_push_token | text UNIQUE NOT NULL | |
| platform | push_platform NOT NULL | |
| created_at | timestamptz | |
| last_used_at | timestamptz | |

---

## Triggers in place

- `xp_ledger AFTER INSERT` → updates `profiles.xp_total`, recomputes `current_rank` via `compute_rank_from_xp(xp)` function
- `teacher_notes BEFORE UPDATE` → sets `updated_at = now()`
- `student_assessments BEFORE UPDATE` → sets `updated_at = now()` via `set_updated_at()`
- `quest_acceptances BEFORE INSERT` → `trg_quest_acceptances_set_quest_type` populates `quest_type` from the parent quest if NULL (migration 018b)

---

## Views

### `public_profiles`
Security-barrier view over `profiles`. Student-facing surface for classmate and leaderboard reads — never query `profiles` directly from a student session. Built with `WITH (security_barrier = true)` to prevent leak via crafted predicates.

**Columns (11, all from `profiles`):** `id`, `role`, `full_name`, `avatar_url`, `age`, `class_id`, `interest_tags`, `xp_total`, `current_rank`, `learning_velocity`, `created_at`.

Excluded vs. `profiles`: `email`, `last_active_at`. (`username` and `display_name` were dropped from `profiles` in migration 010 — `full_name` is now the public display field.)

**Visibility (WHERE clause):**
- Teacher → all rows
- Self → own row regardless of role
- Other students → all rows where `role = 'student'` (global student leaderboard)
- Teacher rows are NOT exposed to other users

`SELECT` granted to `authenticated`.

---

## Helper functions

All `SECURITY DEFINER` with explicit `SET search_path = public`. `EXECUTE` is revoked from `anon` and `PUBLIC` except where shown.

| Function | Returns | Callable by | Intent |
|---|---|---|---|
| `is_teacher(uid uuid DEFAULT auth.uid())` | `boolean` | authenticated | Role check; used inside RLS `USING` / `WITH CHECK` |
| `user_class_id(uid uuid DEFAULT auth.uid())` | `uuid` | authenticated | Class lookup; used inside RLS clauses |
| `users_share_class(a uuid, b uuid)` | `boolean` | authenticated | Same-class predicate (or either side is teacher) |
| `lookup_class_by_invite(code text)` | `TABLE(id uuid, name text)` | **anon** + authenticated | Validate invite code → resolve class (unused in v1; kept for future "secret class" optionality) |
| `is_registration_open()` | `boolean` | **anon** + authenticated | Read `app_settings.registration_open` (added in migration 009) |
| `get_registration_state()` | `jsonb {open, classes}` | **anon** + authenticated | Combined state for the registration page (added in migration 009) |
| `register_student(p_user_id uuid, p_full_name text, p_age int, p_email text, p_class_id uuid)` | `jsonb {ok, error?}` | authenticated | Gated atomic student-profile insert. Server-enforced gates: caller identity (`auth.uid`), `registration_open`, class exists (added in migration 009, simplified in migration 010) |
| `unlock_lesson_cards(p_lesson_id uuid, p_class_id uuid)` | `jsonb {ok, cards_count, students_count, reviews_created}` | authenticated (teacher only — gated inside) | Inserts a `lesson_unlocks` row for `(lesson_id, class_id)` and seeds `card_reviews` rows for every student-card pair in that class. Idempotent. (migration 014) |
| `submit_mcq_answer(p_quiz_question_id uuid, p_selected_choice char)` | `jsonb {ok, is_correct, correct_choice, xp_awarded, attempt_id}` | authenticated (students; teacher inserts not gated but unused) | Audit chokepoint for review-quiz answers. Verifies card visibility via `lesson_unlocks`, reads teacher-only `correct_choice`, inserts a `review_attempts` row, awards +5 XP via `xp_ledger` if correct. Creates a `card_reviews` row on-demand if missing. **Client code must never INSERT into `review_attempts` directly.** (migration 015) |
| `count_words(p_text text)` | `int` | authenticated | Shared server-side word counter. Strips markdown syntax `* _ # \` > [ ] ( )` then tokenizes on whitespace. Used by `submit_quest` to compute authoritative `word_count`. Client mirror lives in `src/lib/word-count.ts` (Phase 4). (migration 019) |
| `accept_solo_quest(p_quest_id uuid)` | `jsonb {ok, acceptance_id?, error?}` | authenticated (students) | Validates quest is solo + open + same class as student, then inserts an `active` acceptance. Unique-violation surfaces as `already_have_active_solo`. (migration 019) |
| `accept_coop_quest(p_quest_id uuid)` | `jsonb {ok, acceptance_id?, error?}` | authenticated (students) | Validates quest is coop + open + same class + matchmaking hasn't run, then inserts an `enrolled` acceptance with `instance_id=NULL` and a self-acknowledgment notification. (migration 019) |
| `unenroll_coop_quest(p_quest_id uuid)` | `jsonb {ok, error?}` | authenticated (students) | Deletes the caller's `enrolled` acceptance for the given coop quest. Errors with `no_enrolled_acceptance` if there isn't one. (migration 019) |
| `run_matchmaking(p_quest_id uuid)` | `jsonb {ok, teams_formed, team_sizes, students_placed, no_enrollments?, solo_conversion?}` | authenticated (teachers) or pg_cron (postgres role, auth.uid IS NULL) | The matchmaking entry point. Idempotent — exits with `matchmaking_already_ran` if any instance exists. Locks the quest row with `SELECT FOR UPDATE`. Algorithm: `num_teams = min(ceil(N/M), floor(N/2))`, `gen_random_bytes` shuffle. Handles N=0 (notify teacher), N=1 (solo conversion), N≥2 (team formation). (migration 019) |
| `submit_quest(p_acceptance_id uuid, p_instance_id uuid, p_text_content text)` | `jsonb {ok, submission_id?, word_count?, error?}` | authenticated | Exactly one of `acceptance_id`/`instance_id` must be non-null (mirrors table CHECK). Computes `word_count` via `count_words`, validates ownership / team membership and status, INSERTs into `quest_submissions` (the one-pending partial uniques block doubles), flips coop instance to `submitted`, notifies all teachers. (migration 019) |
| `review_submission(p_submission_id uuid, p_pass boolean, p_feedback text)` | `jsonb {ok, xp_awarded, members_affected, error?}` | authenticated (teachers) | Pass → submission `passed`, acceptance(s) `passed`, `xp_ledger` row per member (`reason='quest_passed'`), notifications. Fail → submission `failed` with required `teacher_feedback`, acceptance stays `active`, coop instance back to `active`, notifications. (migration 019) |
| `disband_coop_instance(p_instance_id uuid)` | `jsonb {ok, members_released, error?}` | authenticated (teachers) | Instance must be `active`. Instance → `disbanded`, member acceptances → `disbanded` (not deleted — audit trail preserved; no-repeat-coop index excludes `disbanded` so members can re-enroll). Notifies each member. (migration 019) |

Internal trigger functions (`apply_xp_change`, `set_updated_at`, `compute_rank_from_xp`) have `EXECUTE` revoked from every role — they run only via triggers.

---

## Notes for Implementation

- **All UUID primary keys** — use `gen_random_uuid()` default.
- **All timestamps are `timestamptz` (UTC)** — convert in app for display.
- **`profiles.id` = `auth.users.id`** — link via FK with `ON DELETE CASCADE`. Always create the profile row immediately after `auth.signUp`.
- **The XP trigger uses `SECURITY DEFINER`** so RLS doesn't block the internal update. Be aware of this when auditing.
- **Username-to-email shim:** `auth.signUp` is called with `{username}@squire.local` to satisfy Supabase Auth's email requirement. The real email (if any) lives in `profiles.email`.
- **Storage buckets** (created later in Phase 2): `card-media` (cards), `submissions` (audio/image deliverables). Both private; signed URLs only.
