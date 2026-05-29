-- Migration 052: auth.uid() wrap follow-up for INSERT policies missed
-- by migration 051. Same pattern, same rationale — Postgres caches the
-- user id once per query instead of re-evaluating per row.
--
-- The diagnostic query in 051's prep filtered on USING (qual) clauses,
-- which are NULL for INSERT-only policies; their WITH CHECK clauses
-- slipped through. Caught by a post-migration audit.

DROP POLICY IF EXISTS card_reviews_student_insert_own ON public.card_reviews;
CREATE POLICY card_reviews_student_insert_own ON public.card_reviews
  FOR INSERT TO authenticated
  WITH CHECK (student_id = (select auth.uid()));

DROP POLICY IF EXISTS profiles_student_insert_self ON public.profiles;
CREATE POLICY profiles_student_insert_self ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (select auth.uid()) AND role = 'student'::user_role);

DROP POLICY IF EXISTS profiles_teacher_insert_self ON public.profiles;
CREATE POLICY profiles_teacher_insert_self ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (select auth.uid()) AND role = 'teacher'::user_role);

DROP POLICY IF EXISTS push_tokens_user_insert_own ON public.push_tokens;
CREATE POLICY push_tokens_user_insert_own ON public.push_tokens
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS acceptances_student_insert_own ON public.quest_acceptances;
CREATE POLICY acceptances_student_insert_own ON public.quest_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (student_id = (select auth.uid()));

DROP POLICY IF EXISTS submissions_student_insert_own ON public.quest_submissions;
CREATE POLICY submissions_student_insert_own ON public.quest_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = (select auth.uid())
    AND status = 'pending_review'::quest_submission_status
    AND teacher_feedback IS NULL
    AND reviewed_at IS NULL
    AND ai_likelihood_score IS NULL
  );

DROP POLICY IF EXISTS ranks_teacher_insert ON public.ranks;
CREATE POLICY ranks_teacher_insert ON public.ranks
  FOR INSERT TO authenticated
  WITH CHECK ((select is_teacher((select auth.uid()))));
