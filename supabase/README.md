# Supabase Migrations

This folder is the source of truth for database schema changes.

**Migration application pattern:** Migrations are applied to the RankedLearning Supabase project (`dicufymnejhrkrakgluu`) via the Supabase MCP from the architect's chat session. The SQL is ALSO committed here as the audit trail and the reproducible reference.

**File naming:** `NNN_short_description.sql` where NNN matches the order applied in production.

**Note:** Migrations 001-007 (initial schema) were applied during pre-Phase-1 setup before this folder existed. They are documented in `docs/SCHEMA.md` rather than reproduced here.

**Protocol:** Every time a migration is applied via MCP, the SQL file is committed under `migrations/` AND a row is added to the table below. The agent's standard migration workflow includes this README update.

| # | Description | Status |
|---|---|---|
| 001 | Drop legacy schema | applied |
| 002 | Enums and extensions | applied |
| 003 | Users and classes | applied |
| 004 | Lessons and cards | applied |
| 005 | Quests system | applied |
| 006 | Quizzes, XP, notifications | applied |
| 007 | Triggers | applied |
| 008 | RLS policies + `public_profiles` view + `student_assessments` split | applied |
| 009 | Registration toggle (`app_settings`, `is_registration_open`, `get_registration_state`, `register_student` RPC) | applied |
| 010 | Drop username/display_name shim — email becomes auth identity; `full_name` becomes public display | applied |
| 011 | Unify content model as markdown (`review_cards.body` and `quests.description` → text; drop `quiz_questions`, `deliverable_types`, and `'quiz'` enum value) | applied |
| 012 | `unlock_lesson_cards` RPC (teacher-only, idempotent) and `lesson_card_counts` view | applied |
| 013 | `admin_create_teacher(email, password, full_name)` SECURITY DEFINER seed function — gotcha-free teacher account creation | applied |
| 014 | Per-class lesson unlock model: drop `lessons.class_id`/`cards_unlocked_at`/`taught_at`; new `lesson_unlocks(lesson_id, class_id, unlocked_at)` join table; `unlock_lesson_cards(lesson_id, class_id)` RPC | applied |
| 015 | Unify review and quiz via FSRS-driven model. Drop `daily_quiz_attempts`; new `review_attempts` (one row per MCQ answer) + `submit_mcq_answer(quiz_question_id, selected_choice)` SECURITY DEFINER RPC. Correct → +5 XP via xp_ledger | applied |
| 016 | `list_review_session()` SECURITY DEFINER RPC returns the full review payload (due cards + MCQs without correct_choice). `unlock_lesson_cards()` updated to skip cards with 0 MCQs and report `cards_skipped_no_mcq` + `skipped_card_headlines` in the result | applied |
| 017 | `recompute_learning_velocity()` SECURITY DEFINER function + `pg_cron` schedule at 03:00 Saigon (20:00 UTC) daily. Lookback window: 14 days. Pure SQL approach — no Edge Function | applied |
| 018a | Add `'enrolled'` and `'disbanded'` to `quest_acceptance_status` enum. Split from 018b because Postgres forbids using new enum values in the same transaction they were created in | applied |
| 018b | Quest schema overhaul for matchmaking coop model: drop `'forming'`/`'failed'` from `coop_instance_status`, rename `quests.group_size` → `max_team_size`, denormalize `quest_type` onto `quest_acceptances` + trigger, rebuild unique indexes, drop legacy upload columns on `quest_submissions`, add partial uniques for one-pending-per-acceptance | applied |
| 019 | Quest action RPCs: `accept_solo_quest`, `accept_coop_quest`, `unenroll_coop_quest`, `run_matchmaking` (partitioning algorithm with `gen_random_bytes` shuffle), `submit_quest` (server-side word count), `review_submission`, `disband_coop_instance`, plus `count_words` helper. All SECURITY DEFINER chokepoints. | applied |
| 020 | Fix RLS infinite-recursion on `quest_acceptances` / `quest_submissions`. Extract inline `EXISTS … FROM quest_acceptances` subqueries from the two policies into SECURITY DEFINER helpers (`is_my_coop_instance`, `is_my_acceptance`) so the subquery bypasses RLS and doesn't re-trigger the policy that called it. | applied |
| 021 | Make quests class-agnostic. Drop `quests.class_id`, add `coop_quest_instances.class_id NOT NULL`. Rewrite `run_matchmaking` to loop classes and partition teams per class. Update RLS policies (`quests_student_read_active` becomes class-agnostic; `coop_instances_student_read` gates by the new instance-level class_id). Wipes existing quest rows. | applied |
| 022 | `pg_cron` schedules `run_matchmaking` every minute on coop quests whose `expires_at` has passed. `run_matchmaking` updated to dedup the "no enrollments" notification so the once-per-minute cron doesn't spam the teacher on zero-enrollment quests. | applied |
| 023 | Class management overhaul. Per-class `registration_open` (replaces global toggle); drops `invite_code` (deprecated). New `transfer_student(student_id, to_class_id)` and `delete_student(student_id)` RPCs (delete cascades via `auth.users`). | applied |
| 024 | Hotfix: drop stale `v_quest.class_id` reference from `accept_solo_quest` / `accept_coop_quest` (leftover from migration 019 that broke after migration 021 made quests class-agnostic). Also scopes coop's matchmaking-done check to the caller's class. | applied |
| 026 | Drop `unenroll_coop_quest` RPC. Product decision: coop enrollments are final. Only escape paths are teacher disband (post-matchmaking) or matchmaking cancellation in the student's class. | applied |
| 027 | `disband_quest(quest_id)` RPC. Teacher-side "disband everything" — cancels all active/enrolled/submitted acceptances and all active/submitted coop instances on a quest, notifies each affected student. Doesn't change `closed_at`. | applied |
| 028 | Drop the `'disbanded'` status from both `quest_acceptance_status` and `coop_instance_status` enums. Rewrite `disband_quest` and `disband_coop_instance` to DELETE acceptances/instances instead of flagging them. Effect: disbanded students disappear from enrollments/members lists and can re-enroll while the quest is open and matchmaking hasn't run in their class. | applied |
| 029 | Functional coop matchmaking. Three fixes in one bundle: (1) schema-qualify `extensions.gen_random_bytes` so the cron stops crashing; (2) add `quests.matchmaking_ran_at` + cron filter so each quest matchmakes exactly once; (3) add `coop_quest_instances.team_number` and `captain_id`, assign team numbers per class, pick captain by lowest `learning_velocity NULLS LAST` with random tiebreak. `submit_quest` now rejects non-captain submissions on coop. | applied |
| 030 | Phase 6 (Web Push) foundation. Repurpose `push_tokens` from the empty Expo-native shape to real Web Push subscriptions (`endpoint`/`p256dh`/`auth` + unique-index on endpoint). Add `profiles.quiet_hours_start_hour` and `profiles.quiet_hours_end_hour` (smallint 0–23, NULL = no quiet hours). Owner/teacher RLS on push_tokens. Partial index on `notifications.pushed_at IS NULL` for the delivery cron. | applied |
| 031 | Schedule `send-pushes` Edge Function via `pg_cron` (every minute). Hardcoded function URL; shared secret stored in `vault.secrets` under name `cron_secret` (the original draft used `app.settings.*` but hosted Supabase forbids `ALTER DATABASE postgres SET …`). See `docs/PUSH_SETUP.md` for the four-step activation. | applied |
| 032 | Restore + enrich the `submission_received` teacher notification that 029 silently dropped from `submit_quest`. Body now reads `Class <name> · <student> — "<quest title>"` (solo) or `Class <name> · Team N (M members) — "<quest title>" — submitted by <captain>` (coop). The `data` jsonb gains `class_id`/`class_name`/`student_id`/`student_name`/`quest_id`/`quest_title`/`team_number`/`team_size`/`captain_id`/`captain_name`/`quest_type` for future deep-linking from the inbox. | applied |
| 033 | Student-facing notification triggers: `profiles_notify_rank_up` fires `rank_up` when `current_rank` increases; `quests_notify_on_create` fires `quest_available` on every new quest INSERT (fans out to all students; quests are class-agnostic in v1). Both SECURITY DEFINER; `apply_xp_change()` untouched. | applied |
| 034 | Fix broken RLS UPDATE CHECK on `notifications` (the original CHECK used self-referential subqueries with colliding aliases — `id = id` — so it returned every row and every UPDATE failed silently). Replace with a simple owner-only `USING/WITH CHECK` policy + column-level `GRANT UPDATE (read_at)`. Symptom fixed: "Mark all read" + per-row mark now work. | applied |
