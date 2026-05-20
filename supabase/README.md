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
