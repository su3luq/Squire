-- Migration 018b: Quest schema overhaul for the matchmaking coop model.
--
-- Builds on 018a (which added 'enrolled' and 'disbanded' to
-- quest_acceptance_status). This migration does everything else:
--
--   1. Swap coop_instance_status to drop 'forming' and 'failed'. The new
--      lifecycle is forming-less: matchmaking creates instances directly
--      at status='active'. Failure lives only at the submission level.
--   2. Rename quests.group_size → max_team_size (semantic clarity).
--      The CHECK constraint coop_has_group_size becomes coop_has_max_team_size.
--   3. Denormalize quest_type onto quest_acceptances + BEFORE INSERT trigger
--      to auto-populate. Required because Postgres partial unique indexes
--      cannot use subqueries or joins; the row has to carry its own
--      discriminator.
--   4. Rebuild the three unique indexes on quest_acceptances using the new
--      quest_type predicate. No-repeat-coop now excludes 'disbanded' so
--      students can re-enroll after being released by a teacher disband.
--   5. Drop legacy upload columns from quest_submissions (audio_url,
--      image_urls, youtube_link) — markdown-only per Plan B.
--   6. Add partial unique indexes that prevent a second pending_review
--      submission while one is already awaiting review.
--
-- See docs/PHASE-4-PLAN.md for full design context.
--
-- Applied via Supabase MCP. This file is the source-of-truth audit copy.
-- Migration includes a REVOKE on the new trigger function (applied via
-- execute_sql after the migration) to silence the advisor warning about
-- the trigger function being PostgREST-callable.

BEGIN;

-- ============================================================================
-- 1. Swap coop_instance_status enum (drop 'forming', 'failed')
-- ============================================================================

ALTER TABLE public.coop_quest_instances ALTER COLUMN status DROP DEFAULT;

CREATE TYPE public.coop_instance_status_new AS ENUM (
    'active', 'submitted', 'passed', 'disbanded'
);

ALTER TABLE public.coop_quest_instances
    ALTER COLUMN status TYPE public.coop_instance_status_new
    USING status::text::public.coop_instance_status_new;

DROP TYPE public.coop_instance_status;
ALTER TYPE public.coop_instance_status_new RENAME TO coop_instance_status;

ALTER TABLE public.coop_quest_instances
    ALTER COLUMN status SET DEFAULT 'active'::public.coop_instance_status;

-- ============================================================================
-- 2. Rename quests.group_size → max_team_size + update CHECK constraint
-- ============================================================================

ALTER TABLE public.quests DROP CONSTRAINT coop_has_group_size;
ALTER TABLE public.quests RENAME COLUMN group_size TO max_team_size;
ALTER TABLE public.quests ADD CONSTRAINT coop_has_max_team_size
    CHECK (
        (quest_type = 'coop'::quest_type AND max_team_size IS NOT NULL AND max_team_size >= 2)
        OR quest_type <> 'coop'::quest_type
    );

-- ============================================================================
-- 3. Denormalize quest_type onto quest_acceptances
-- ============================================================================

ALTER TABLE public.quest_acceptances ADD COLUMN quest_type public.quest_type;

UPDATE public.quest_acceptances qa
SET quest_type = q.quest_type
FROM public.quests q
WHERE qa.quest_id = q.id;

ALTER TABLE public.quest_acceptances ALTER COLUMN quest_type SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_quest_acceptance_quest_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.quest_type IS NULL THEN
        SELECT q.quest_type INTO NEW.quest_type
        FROM public.quests q
        WHERE q.id = NEW.quest_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quest_acceptances_set_quest_type
    BEFORE INSERT ON public.quest_acceptances
    FOR EACH ROW
    EXECUTE FUNCTION public.set_quest_acceptance_quest_type();

COMMENT ON COLUMN public.quest_acceptances.quest_type IS
'Denormalized from quests.quest_type, auto-populated by trg_quest_acceptances_set_quest_type on insert. Enables partial unique indexes that distinguish solo vs coop at the row level - Postgres partial indexes cannot use subqueries or joins in their predicate.';

-- ============================================================================
-- 4. Rebuild quest_acceptances unique indexes using quest_type predicate
-- ============================================================================

DROP INDEX IF EXISTS public.idx_one_active_solo_per_student;
DROP INDEX IF EXISTS public.idx_one_active_coop_per_student;
DROP INDEX IF EXISTS public.idx_no_repeat_coop_per_student;

CREATE UNIQUE INDEX idx_one_active_solo_per_student
    ON public.quest_acceptances (student_id)
    WHERE quest_type = 'solo' AND status = 'active';

CREATE UNIQUE INDEX idx_one_active_coop_per_student
    ON public.quest_acceptances (student_id)
    WHERE quest_type = 'coop' AND status IN ('active', 'enrolled');

-- No-repeat-coop: block re-acceptance only if any prior acceptance was
-- 'active' or 'passed'. 'disbanded' and 'enrolled' do NOT block — students
-- whose team was disbanded are free to enroll again.
CREATE UNIQUE INDEX idx_no_repeat_coop_per_student
    ON public.quest_acceptances (student_id, quest_id)
    WHERE quest_type = 'coop' AND status IN ('active', 'passed');

-- ============================================================================
-- 5. quest_submissions: drop legacy upload columns
-- ============================================================================

ALTER TABLE public.quest_submissions DROP COLUMN IF EXISTS audio_url;
ALTER TABLE public.quest_submissions DROP COLUMN IF EXISTS image_urls;
ALTER TABLE public.quest_submissions DROP COLUMN IF EXISTS youtube_link;

-- ============================================================================
-- 6. quest_submissions: partial unique indexes for one-pending-per-acceptance
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_pending_per_acceptance
    ON public.quest_submissions (acceptance_id)
    WHERE status = 'pending_review' AND acceptance_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_pending_per_instance
    ON public.quest_submissions (instance_id)
    WHERE status = 'pending_review' AND instance_id IS NOT NULL;

COMMIT;

-- ============================================================================
-- Post-commit: revoke EXECUTE on the trigger function to silence
-- the "anon can execute SECURITY DEFINER function" advisor warning.
-- The function only makes sense in a trigger context anyway.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.set_quest_acceptance_quest_type() FROM anon, authenticated, PUBLIC;
