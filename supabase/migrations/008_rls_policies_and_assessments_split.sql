-- Migration 008: RLS policies, security barrier view, and assessment table split
--
-- This migration:
--   1. Adds 3 helper functions (is_teacher, user_class_id, users_share_class) for RLS use
--   2. Creates the public_profiles security-barrier view (column-restricted classmate/leaderboard data)
--   3. Splits english_proficiency_* off profiles into a new teacher-only student_assessments table
--      (turns column-level privacy into row-level privacy, cleanly RLS-enforceable)
--   4. Enables RLS on all 15 tables and defines all policies
--   5. Adds 2 pre-registration helper functions (lookup_class_by_invite, is_username_available)
--   6. Drops orphaned functions from the legacy schema (update_student_rank, etc.)
--   7. Locks down internal trigger functions (apply_xp_change, set_updated_at) — REVOKE EXECUTE
--   8. Hardens existing functions with explicit search_path
--
-- Applied via Supabase MCP from architect chat. This file is the source-of-truth audit copy.

BEGIN;

-- ============================================================================
-- PART 1: HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_teacher(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = uid AND role = 'teacher'
    );
$$;

CREATE OR REPLACE FUNCTION public.user_class_id(uid uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT class_id FROM public.profiles WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION public.users_share_class(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        public.is_teacher(a) OR public.is_teacher(b) OR
        (public.user_class_id(a) IS NOT NULL AND public.user_class_id(a) = public.user_class_id(b));
$$;

GRANT EXECUTE ON FUNCTION public.is_teacher(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_class_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.users_share_class(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_teacher(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_class_id(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.users_share_class(uuid, uuid) FROM anon, PUBLIC;

COMMENT ON FUNCTION public.is_teacher(uuid) IS
'Returns whether the given user is a teacher. SECURITY DEFINER + authenticated-callable is intentional: RLS policies need to invoke this from within USING/WITH CHECK clauses.';
COMMENT ON FUNCTION public.user_class_id(uuid) IS
'Returns the class_id for the given user. SECURITY DEFINER + authenticated-callable is intentional: used in RLS policies.';
COMMENT ON FUNCTION public.users_share_class(uuid, uuid) IS
'Returns whether two users share a class (or one is a teacher). Used in RLS policies.';

-- ============================================================================
-- PART 2: SPLIT ENGLISH PROFICIENCY OFF profiles INTO student_assessments
-- (Row-level privacy is RLS-enforceable; column-level is not in Postgres)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.student_assessments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    english_proficiency_pearson int,
    english_proficiency_cefr text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pearson_range CHECK (english_proficiency_pearson IS NULL OR (english_proficiency_pearson >= 10 AND english_proficiency_pearson <= 90))
);

CREATE INDEX IF NOT EXISTS idx_assessments_student ON public.student_assessments(student_id);

-- Migrate any data that exists on profiles, then drop columns
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
            AND column_name = 'english_proficiency_pearson'
    ) THEN
        INSERT INTO public.student_assessments (student_id, english_proficiency_pearson, english_proficiency_cefr)
        SELECT id, english_proficiency_pearson, english_proficiency_cefr
        FROM public.profiles
        WHERE english_proficiency_pearson IS NOT NULL OR english_proficiency_cefr IS NOT NULL
        ON CONFLICT (student_id) DO NOTHING;

        ALTER TABLE public.profiles DROP COLUMN english_proficiency_pearson;
        ALTER TABLE public.profiles DROP COLUMN english_proficiency_cefr;
    END IF;
END$$;

ALTER TABLE public.student_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY student_assessments_teacher_all ON public.student_assessments
    FOR ALL TO authenticated
    USING (public.is_teacher())
    WITH CHECK (public.is_teacher());

CREATE TRIGGER trg_assessments_updated_at
    BEFORE UPDATE ON public.student_assessments
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.student_assessments IS
'Teacher-only metadata about students (English proficiency, etc.). Strict RLS: teachers only. Was previously columns on profiles, moved here to make privacy boundary row-level rather than column-level.';

-- ============================================================================
-- PART 3: SECURITY BARRIER VIEW public_profiles
-- ============================================================================

DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles
WITH (security_barrier = true)
AS
SELECT
    p.id,
    p.role,
    p.username,
    p.display_name,
    p.avatar_url,
    p.age,
    p.class_id,
    p.interest_tags,
    p.xp_total,
    p.current_rank,
    p.learning_velocity,
    p.created_at
FROM public.profiles p
WHERE
    public.is_teacher()
    OR p.id = auth.uid()
    OR p.role = 'student';

GRANT SELECT ON public.public_profiles TO authenticated;

COMMENT ON VIEW public.public_profiles IS
'Student-facing profile view. Excludes the protected columns (which now live on student_assessments). Includes WHERE clause: teachers see all, students see self + all other students (leaderboard is global).';

-- ============================================================================
-- PART 4: RLS POLICIES — all 15 + 1 new tables
-- ============================================================================

-- ----- classes -----
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY classes_teacher_all ON public.classes
    FOR ALL TO authenticated
    USING (public.is_teacher())
    WITH CHECK (public.is_teacher());

CREATE POLICY classes_student_read_own ON public.classes
    FOR SELECT TO authenticated
    USING (id = public.user_class_id());

-- ----- profiles -----
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_teacher_read_all ON public.profiles
    FOR SELECT TO authenticated
    USING (public.is_teacher());

CREATE POLICY profiles_teacher_update_all ON public.profiles
    FOR UPDATE TO authenticated
    USING (public.is_teacher())
    WITH CHECK (public.is_teacher());

CREATE POLICY profiles_student_read_self ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());

CREATE POLICY profiles_student_update_self ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
        AND class_id IS NOT DISTINCT FROM (SELECT class_id FROM public.profiles WHERE id = auth.uid())
        AND xp_total = (SELECT xp_total FROM public.profiles WHERE id = auth.uid())
        AND current_rank = (SELECT current_rank FROM public.profiles WHERE id = auth.uid())
        AND learning_velocity = (SELECT learning_velocity FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY profiles_student_insert_self ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid() AND role = 'student');

CREATE POLICY profiles_teacher_insert_self ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid() AND role = 'teacher');

-- ----- teacher_notes -----
ALTER TABLE public.teacher_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY teacher_notes_teacher_all ON public.teacher_notes
    FOR ALL TO authenticated
    USING (public.is_teacher())
    WITH CHECK (public.is_teacher());

-- ----- lessons -----
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY lessons_teacher_all ON public.lessons
    FOR ALL TO authenticated
    USING (public.is_teacher())
    WITH CHECK (public.is_teacher());

CREATE POLICY lessons_student_read_own_class ON public.lessons
    FOR SELECT TO authenticated
    USING (class_id = public.user_class_id());

-- ----- review_cards -----
ALTER TABLE public.review_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY review_cards_teacher_all ON public.review_cards
    FOR ALL TO authenticated
    USING (public.is_teacher())
    WITH CHECK (public.is_teacher());

CREATE POLICY review_cards_student_read_unlocked ON public.review_cards
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.lessons l
            WHERE l.id = review_cards.lesson_id
                AND l.class_id = public.user_class_id()
                AND l.cards_unlocked_at IS NOT NULL
        )
    );

-- ----- card_quiz_questions -----
-- Students never directly query this. They consume snapshots via daily_quiz_attempts.
ALTER TABLE public.card_quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY card_quiz_questions_teacher_all ON public.card_quiz_questions
    FOR ALL TO authenticated
    USING (public.is_teacher())
    WITH CHECK (public.is_teacher());

-- ----- card_reviews (FSRS state) -----
ALTER TABLE public.card_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY card_reviews_teacher_read ON public.card_reviews
    FOR SELECT TO authenticated
    USING (public.is_teacher());

CREATE POLICY card_reviews_student_select_own ON public.card_reviews
    FOR SELECT TO authenticated
    USING (student_id = auth.uid());

CREATE POLICY card_reviews_student_insert_own ON public.card_reviews
    FOR INSERT TO authenticated
    WITH CHECK (student_id = auth.uid());

CREATE POLICY card_reviews_student_update_own ON public.card_reviews
    FOR UPDATE TO authenticated
    USING (student_id = auth.uid())
    WITH CHECK (student_id = auth.uid());

-- ----- quests -----
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;

CREATE POLICY quests_teacher_all ON public.quests
    FOR ALL TO authenticated
    USING (public.is_teacher())
    WITH CHECK (public.is_teacher());

CREATE POLICY quests_student_read_active ON public.quests
    FOR SELECT TO authenticated
    USING (class_id = public.user_class_id() AND closed_at IS NULL);

-- ----- coop_quest_instances -----
ALTER TABLE public.coop_quest_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY coop_instances_teacher_all ON public.coop_quest_instances
    FOR ALL TO authenticated
    USING (public.is_teacher())
    WITH CHECK (public.is_teacher());

CREATE POLICY coop_instances_student_read ON public.coop_quest_instances
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quests q
            WHERE q.id = coop_quest_instances.quest_id
                AND q.class_id = public.user_class_id()
                AND q.closed_at IS NULL
        )
    );

-- ----- quest_acceptances -----
ALTER TABLE public.quest_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY acceptances_teacher_all ON public.quest_acceptances
    FOR ALL TO authenticated
    USING (public.is_teacher())
    WITH CHECK (public.is_teacher());

CREATE POLICY acceptances_student_read_own ON public.quest_acceptances
    FOR SELECT TO authenticated
    USING (student_id = auth.uid());

CREATE POLICY acceptances_student_read_coop_group ON public.quest_acceptances
    FOR SELECT TO authenticated
    USING (
        instance_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.quest_acceptances mine
            WHERE mine.student_id = auth.uid()
                AND mine.instance_id = quest_acceptances.instance_id
        )
    );

CREATE POLICY acceptances_student_insert_own ON public.quest_acceptances
    FOR INSERT TO authenticated
    WITH CHECK (student_id = auth.uid());

-- ----- quest_submissions -----
ALTER TABLE public.quest_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY submissions_teacher_select ON public.quest_submissions
    FOR SELECT TO authenticated
    USING (public.is_teacher());

CREATE POLICY submissions_teacher_update ON public.quest_submissions
    FOR UPDATE TO authenticated
    USING (public.is_teacher())
    WITH CHECK (public.is_teacher());

CREATE POLICY submissions_student_read_own ON public.quest_submissions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quest_acceptances a
            WHERE a.id = quest_submissions.acceptance_id
                AND a.student_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.quest_acceptances a
            WHERE a.instance_id = quest_submissions.instance_id
                AND a.student_id = auth.uid()
        )
    );

CREATE POLICY submissions_student_insert_own ON public.quest_submissions
    FOR INSERT TO authenticated
    WITH CHECK (
        submitted_by = auth.uid()
        AND status = 'pending_review'
        AND teacher_feedback IS NULL
        AND reviewed_at IS NULL
        AND ai_likelihood_score IS NULL
    );

-- ----- daily_quiz_attempts -----
ALTER TABLE public.daily_quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY quiz_attempts_teacher_read ON public.daily_quiz_attempts
    FOR SELECT TO authenticated
    USING (public.is_teacher());

CREATE POLICY quiz_attempts_student_read_own ON public.daily_quiz_attempts
    FOR SELECT TO authenticated
    USING (student_id = auth.uid());

CREATE POLICY quiz_attempts_student_update_own ON public.daily_quiz_attempts
    FOR UPDATE TO authenticated
    USING (student_id = auth.uid())
    WITH CHECK (
        student_id = auth.uid()
        AND questions = (SELECT questions FROM public.daily_quiz_attempts WHERE id = daily_quiz_attempts.id)
        AND total_count = (SELECT total_count FROM public.daily_quiz_attempts WHERE id = daily_quiz_attempts.id)
        AND quiz_date = (SELECT quiz_date FROM public.daily_quiz_attempts WHERE id = daily_quiz_attempts.id)
        AND xp_awarded = (SELECT xp_awarded FROM public.daily_quiz_attempts WHERE id = daily_quiz_attempts.id)
    );

-- ----- xp_ledger -----
ALTER TABLE public.xp_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY xp_ledger_teacher_read ON public.xp_ledger
    FOR SELECT TO authenticated
    USING (public.is_teacher());

CREATE POLICY xp_ledger_student_read_own ON public.xp_ledger
    FOR SELECT TO authenticated
    USING (student_id = auth.uid());

-- NO INSERT POLICY anywhere. All XP awards via SECURITY DEFINER functions (added in later migrations).

-- ----- notifications -----
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_user_read_own ON public.notifications
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY notifications_user_update_own ON public.notifications
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (
        user_id = auth.uid()
        AND title = (SELECT title FROM public.notifications WHERE id = notifications.id)
        AND body = (SELECT body FROM public.notifications WHERE id = notifications.id)
        AND type = (SELECT type FROM public.notifications WHERE id = notifications.id)
    );

CREATE POLICY notifications_teacher_insert ON public.notifications
    FOR INSERT TO authenticated
    WITH CHECK (public.is_teacher());

-- ----- push_tokens -----
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_tokens_user_select_own ON public.push_tokens
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY push_tokens_user_insert_own ON public.push_tokens
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY push_tokens_user_update_own ON public.push_tokens
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY push_tokens_user_delete_own ON public.push_tokens
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- ============================================================================
-- PART 5: PRE-REGISTRATION HELPER FUNCTIONS (anon-callable by design)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lookup_class_by_invite(code text)
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id, name FROM public.classes
    WHERE invite_code = code AND archived_at IS NULL
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_class_by_invite(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_username_available(uname text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE username = uname
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated;

COMMENT ON FUNCTION public.lookup_class_by_invite(text) IS
'Pre-registration: validate invite code → return class. Anon-callable by design. Invite codes should be treated as secrets.';
COMMENT ON FUNCTION public.is_username_available(text) IS
'Pre-registration: check if username is taken. Anon-callable by design.';

-- ============================================================================
-- PART 6: CLEAN UP LEGACY ORPHANS AND HARDEN EXISTING TRIGGER FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS public.update_student_rank() CASCADE;
DROP FUNCTION IF EXISTS public.process_fsrs_review(uuid, uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS public.webhook_push_notifications() CASCADE;
DROP FUNCTION IF EXISTS public.webhook_ai_grading() CASCADE;

-- Re-create trigger functions with explicit search_path
CREATE OR REPLACE FUNCTION public.compute_rank_from_xp(xp int)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
    IF xp >= 6000 THEN RETURN 7;
    ELSIF xp >= 4200 THEN RETURN 6;
    ELSIF xp >= 2600 THEN RETURN 5;
    ELSIF xp >= 1400 THEN RETURN 4;
    ELSIF xp >= 600 THEN RETURN 3;
    ELSIF xp >= 200 THEN RETURN 2;
    ELSE RETURN 1;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_xp_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_total int;
    new_rank int;
BEGIN
    UPDATE public.profiles
    SET xp_total = GREATEST(0, xp_total + NEW.amount)
    WHERE id = NEW.student_id
    RETURNING xp_total INTO new_total;

    new_rank := public.compute_rank_from_xp(new_total);

    UPDATE public.profiles
    SET current_rank = new_rank
    WHERE id = NEW.student_id AND current_rank != new_rank;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_xp_change() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.compute_rank_from_xp(int) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.apply_xp_change() IS
'Trigger function that updates profiles.xp_total and current_rank after xp_ledger inserts. EXECUTE revoked from all roles; runs only via trigger.';
COMMENT ON FUNCTION public.compute_rank_from_xp(int) IS
'Pure function mapping XP total to rank tier (1-7). Internal use only.';
COMMENT ON FUNCTION public.set_updated_at() IS
'Trigger function that sets updated_at = now() on UPDATE. Internal use only.';

COMMIT;
