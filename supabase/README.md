# Supabase Migrations

This folder is the source of truth for database schema changes.

**Migration application pattern:** Migrations are applied to the SQUIRE Supabase project (`dicufymnejhrkrakgluu`) via the Supabase MCP from the architect's chat session. The SQL is ALSO committed here as the audit trail and the reproducible reference.

**File naming:** `NNN_short_description.sql` where NNN matches the order applied in production.

**Note:** Migrations 001-007 (initial schema) were applied during pre-Phase-1 setup before this folder existed. They are documented in `docs/SCHEMA.md` rather than reproduced here.

| # | Description | Status |
|---|---|---|
| 001 | Drop legacy schema | applied |
| 002 | Enums and extensions | applied |
| 003 | Users and classes | applied |
| 004 | Lessons and cards | applied |
| 005 | Quests system | applied |
| 006 | Quizzes, XP, notifications | applied |
| 007 | Triggers | applied |
| 008 | RLS policies + public_profiles view | pending (this commit's target) |
