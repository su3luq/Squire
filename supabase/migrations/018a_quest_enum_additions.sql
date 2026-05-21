-- Migration 018a: Add 'enrolled' and 'disbanded' values to
-- quest_acceptance_status. Must commit separately before 018b — Postgres
-- forbids referencing a new enum value in the same transaction it was
-- created in.
--
-- Why split: 018b creates partial unique indexes whose predicates include
-- the new values (e.g. `status IN ('active', 'enrolled')`). Those predicates
-- can't be evaluated until the enum values are committed.
--
-- Applied via Supabase MCP. This file is the source-of-truth audit copy.

ALTER TYPE public.quest_acceptance_status ADD VALUE IF NOT EXISTS 'enrolled';
ALTER TYPE public.quest_acceptance_status ADD VALUE IF NOT EXISTS 'disbanded';
