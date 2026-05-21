# Supabase Migrations

This folder is the source of truth for database schema changes.

**Migration application pattern:** Migrations are applied to the SQUIRE Supabase project (`dicufymnejhrkrakgluu`) via the Supabase MCP from the architect's chat session. The SQL is ALSO committed here as the audit trail and the reproducible reference.

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
