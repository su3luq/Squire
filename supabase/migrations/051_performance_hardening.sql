-- Migration 051: performance hardening
--
-- Clears the Phase 7 Stage 5 backlog:
--   1. RLS policies: wrap auth.uid() in (select auth.uid()) so Postgres
--      caches the user id once per query instead of re-evaluating per row.
--      Pure performance change — behaviour identical.
--   2. Add covering indexes for FK columns flagged by the linter.
--   3. Drop duplicate indexes left behind by migration 030.
--
-- 21 policies touched, 4 indexes created, 2 indexes dropped.

-- =========================================================
-- 1. RLS policies: wrap auth.uid() in (select auth.uid())
-- =========================================================

DROP POLICY IF EXISTS card_reviews_student_select_own ON public.card_reviews;
CREATE POLICY card_reviews_student_select_own ON public.card_reviews
  FOR SELECT TO authenticated
  USING (student_id = (select auth.uid()));

DROP POLICY IF EXISTS card_reviews_student_update_own ON public.card_reviews;
CREATE POLICY card_reviews_student_update_own ON public.card_reviews
  FOR UPDATE TO authenticated
  USING (student_id = (select auth.uid()))
  WITH CHECK (student_id = (select auth.uid()));

DROP POLICY IF EXISTS drafts_select_teacher ON public.coop_member_drafts;
CREATE POLICY drafts_select_teacher ON public.coop_member_drafts
  FOR SELECT TO authenticated
  USING ((select is_teacher((select auth.uid()))));

DROP POLICY IF EXISTS drafts_select_teammates ON public.coop_member_drafts;
CREATE POLICY drafts_select_teammates ON public.coop_member_drafts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quest_acceptances qa
    WHERE qa.instance_id = coop_member_drafts.instance_id
      AND qa.student_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS drafts_update_own ON public.coop_member_drafts;
CREATE POLICY drafts_update_own ON public.coop_member_drafts
  FOR UPDATE TO authenticated
  USING (
    student_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.coop_quest_instances ci
      WHERE ci.id = coop_member_drafts.instance_id
        AND ci.status = 'active'::coop_instance_status
    )
  )
  WITH CHECK (
    student_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.coop_quest_instances ci
      WHERE ci.id = coop_member_drafts.instance_id
        AND ci.status = 'active'::coop_instance_status
    )
  );

DROP POLICY IF EXISTS notes_select_teacher ON public.coop_team_notes;
CREATE POLICY notes_select_teacher ON public.coop_team_notes
  FOR SELECT TO authenticated
  USING (
    (select is_teacher((select auth.uid())))
    AND EXISTS (
      SELECT 1 FROM public.quest_submissions s
      WHERE s.instance_id = coop_team_notes.instance_id
    )
  );

DROP POLICY IF EXISTS notes_select_teammates ON public.coop_team_notes;
CREATE POLICY notes_select_teammates ON public.coop_team_notes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quest_acceptances qa
    WHERE qa.instance_id = coop_team_notes.instance_id
      AND qa.student_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS notes_update_own ON public.coop_team_notes;
CREATE POLICY notes_update_own ON public.coop_team_notes
  FOR UPDATE TO authenticated
  USING (
    student_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.coop_quest_instances ci
      WHERE ci.id = coop_team_notes.instance_id
        AND ci.status = 'active'::coop_instance_status
    )
  )
  WITH CHECK (
    student_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.coop_quest_instances ci
      WHERE ci.id = coop_team_notes.instance_id
        AND ci.status = 'active'::coop_instance_status
    )
  );

DROP POLICY IF EXISTS notifications_user_read_own ON public.notifications;
CREATE POLICY notifications_user_read_own ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS notifications_user_update_own ON public.notifications;
CREATE POLICY notifications_user_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS profiles_student_read_self ON public.profiles;
CREATE POLICY profiles_student_read_self ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

DROP POLICY IF EXISTS profiles_student_update_self ON public.profiles;
CREATE POLICY profiles_student_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (
    id = (select auth.uid())
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = (select auth.uid()))
    AND NOT (class_id IS DISTINCT FROM (SELECT p.class_id FROM public.profiles p WHERE p.id = (select auth.uid())))
    AND xp_total = (SELECT p.xp_total FROM public.profiles p WHERE p.id = (select auth.uid()))
    AND current_rank = (SELECT p.current_rank FROM public.profiles p WHERE p.id = (select auth.uid()))
    AND learning_velocity = (SELECT p.learning_velocity FROM public.profiles p WHERE p.id = (select auth.uid()))
  );

DROP POLICY IF EXISTS push_tokens_owner_all ON public.push_tokens;
CREATE POLICY push_tokens_owner_all ON public.push_tokens
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS push_tokens_user_delete_own ON public.push_tokens;
CREATE POLICY push_tokens_user_delete_own ON public.push_tokens
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS push_tokens_user_select_own ON public.push_tokens;
CREATE POLICY push_tokens_user_select_own ON public.push_tokens
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS push_tokens_user_update_own ON public.push_tokens;
CREATE POLICY push_tokens_user_update_own ON public.push_tokens
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS acceptances_student_read_own ON public.quest_acceptances;
CREATE POLICY acceptances_student_read_own ON public.quest_acceptances
  FOR SELECT TO authenticated
  USING (student_id = (select auth.uid()));

DROP POLICY IF EXISTS ranks_teacher_delete ON public.ranks;
CREATE POLICY ranks_teacher_delete ON public.ranks
  FOR DELETE TO authenticated
  USING ((select is_teacher((select auth.uid()))));

DROP POLICY IF EXISTS ranks_teacher_update ON public.ranks;
CREATE POLICY ranks_teacher_update ON public.ranks
  FOR UPDATE TO authenticated
  USING ((select is_teacher((select auth.uid()))))
  WITH CHECK ((select is_teacher((select auth.uid()))));

DROP POLICY IF EXISTS review_attempts_student_read_own ON public.review_attempts;
CREATE POLICY review_attempts_student_read_own ON public.review_attempts
  FOR SELECT TO authenticated
  USING (student_id = (select auth.uid()));

DROP POLICY IF EXISTS xp_ledger_student_read_own ON public.xp_ledger;
CREATE POLICY xp_ledger_student_read_own ON public.xp_ledger
  FOR SELECT TO authenticated
  USING (student_id = (select auth.uid()));

-- =========================================================
-- 2. FK covering indexes
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_app_settings_updated_by
  ON public.app_settings(updated_by);

CREATE INDEX IF NOT EXISTS idx_coop_quest_instances_captain_id
  ON public.coop_quest_instances(captain_id);

CREATE INDEX IF NOT EXISTS idx_quest_submissions_submitted_by
  ON public.quest_submissions(submitted_by);

CREATE INDEX IF NOT EXISTS idx_review_attempts_quiz_question_id
  ON public.review_attempts(quiz_question_id);

-- =========================================================
-- 3. Drop duplicate indexes
-- =========================================================

-- notifications: idx_notifications_pending_push ≡ notifications_unpushed_idx
DROP INDEX IF EXISTS public.idx_notifications_pending_push;

-- push_tokens: idx_push_tokens_user ≡ push_tokens_user_id_idx
DROP INDEX IF EXISTS public.idx_push_tokens_user;
