-- Migration 020: Fix RLS infinite-recursion on quest_acceptances /
-- quest_submissions.
--
-- Symptom: any query that joined quest_acceptances (e.g. the teacher's
-- /teacher/quests list) crashed with
--   ERROR: 42P17: infinite recursion detected in policy for relation
--   "quest_acceptances"
--
-- Root cause: the existing acceptances_student_read_coop_group policy
-- (USING) and submissions_student_read_own policy (USING) each ran an
-- inline `EXISTS … FROM public.quest_acceptances WHERE …` subquery.
-- Postgres re-evaluated quest_acceptances RLS for that subquery, which
-- re-ran the policy, which re-issued the subquery, … = recursion.
--
-- Fix: extract the two predicates into SECURITY DEFINER helpers
-- (`is_my_coop_instance`, `is_my_acceptance`). The function bypasses RLS
-- during its own SELECT, breaking the loop. The policies then just call
-- the helper.
--
-- Applied via Supabase MCP. This file is the source-of-truth audit copy.

BEGIN;

-- ============================================================================
-- Helpers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_my_coop_instance(p_instance_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.quest_acceptances
    WHERE student_id = auth.uid() AND instance_id = p_instance_id
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_my_coop_instance(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_my_coop_instance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_my_acceptance(p_acceptance_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.quest_acceptances
    WHERE id = p_acceptance_id AND student_id = auth.uid()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_my_acceptance(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_my_acceptance(uuid) TO authenticated;

-- ============================================================================
-- Replace the recursive policies
-- ============================================================================

DROP POLICY IF EXISTS acceptances_student_read_coop_group ON public.quest_acceptances;
CREATE POLICY acceptances_student_read_coop_group
ON public.quest_acceptances
FOR SELECT
TO authenticated
USING (
  instance_id IS NOT NULL
  AND public.is_my_coop_instance(instance_id)
);

DROP POLICY IF EXISTS submissions_student_read_own ON public.quest_submissions;
CREATE POLICY submissions_student_read_own
ON public.quest_submissions
FOR SELECT
TO authenticated
USING (
  (acceptance_id IS NOT NULL AND public.is_my_acceptance(acceptance_id))
  OR (instance_id IS NOT NULL AND public.is_my_coop_instance(instance_id))
);

COMMIT;
