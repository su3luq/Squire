-- Migration 019: Quest action RPCs for the matchmaking coop model.
--
-- Seven SECURITY DEFINER chokepoints + a shared word-count helper.
-- All functions:
--   - run with SET search_path = public
--   - REVOKE from anon, GRANT to authenticated
--   - validate caller identity via auth.uid() and is_teacher()
--   - return jsonb { ok, ... } for client consumption
--
-- The run_matchmaking RPC is callable by both teachers (manual emergency
-- trigger) and by pg_cron (auth.uid() is NULL in that context). The internal
-- check is "service-role / cron OR teacher".
--
-- See docs/PHASE-4-PLAN.md §Migration 019 for full design context.
--
-- Applied via Supabase MCP. This file is the source-of-truth audit copy.

BEGIN;

-- ============================================================================
-- Helper: count_words(text)
--   Server-side authoritative word count. Strip markdown syntax characters,
--   tokenize on whitespace, count non-empty tokens.
--   The matching TS implementation will live in src/lib/word-count.ts (Phase
--   4 commit 5). Keep them in sync.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.count_words(p_text text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT count(*)::int
    FROM regexp_split_to_table(
        regexp_replace(coalesce(p_text, ''), '[*_#`>\[\]()]', '', 'g'),
        '\s+'
    ) AS w
    WHERE length(w) > 0;
$$;

REVOKE EXECUTE ON FUNCTION public.count_words(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_words(text) TO authenticated;

-- ============================================================================
-- 1. accept_solo_quest(p_quest_id)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_solo_quest(p_quest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_student_class uuid;
    v_quest record;
    v_acceptance_id uuid;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
    END IF;
    IF public.is_teacher(v_uid) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'teacher_cannot_accept_quest');
    END IF;

    SELECT class_id INTO v_student_class FROM public.profiles WHERE id = v_uid;

    SELECT * INTO v_quest FROM public.quests WHERE id = p_quest_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'quest_not_found');
    END IF;
    IF v_quest.quest_type <> 'solo' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_solo_quest');
    END IF;
    IF v_quest.class_id IS DISTINCT FROM v_student_class THEN
        RETURN jsonb_build_object('ok', false, 'error', 'wrong_class');
    END IF;
    IF v_quest.closed_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'quest_closed');
    END IF;
    IF v_quest.expires_at IS NOT NULL AND v_quest.expires_at <= now() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'quest_expired');
    END IF;

    BEGIN
        INSERT INTO public.quest_acceptances (student_id, quest_id, status)
        VALUES (v_uid, p_quest_id, 'active')
        RETURNING id INTO v_acceptance_id;
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('ok', false, 'error', 'already_have_active_solo');
    END;

    RETURN jsonb_build_object('ok', true, 'acceptance_id', v_acceptance_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_solo_quest(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_solo_quest(uuid) TO authenticated;

-- ============================================================================
-- 2. accept_coop_quest(p_quest_id)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_coop_quest(p_quest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_student_class uuid;
    v_quest record;
    v_acceptance_id uuid;
    v_matchmaking_done boolean;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
    END IF;
    IF public.is_teacher(v_uid) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'teacher_cannot_accept_quest');
    END IF;

    SELECT class_id INTO v_student_class FROM public.profiles WHERE id = v_uid;

    SELECT * INTO v_quest FROM public.quests WHERE id = p_quest_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'quest_not_found');
    END IF;
    IF v_quest.quest_type <> 'coop' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_coop_quest');
    END IF;
    IF v_quest.class_id IS DISTINCT FROM v_student_class THEN
        RETURN jsonb_build_object('ok', false, 'error', 'wrong_class');
    END IF;
    IF v_quest.closed_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'quest_closed');
    END IF;
    IF v_quest.expires_at IS NULL OR v_quest.expires_at <= now() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'quest_expired_or_no_deadline');
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.coop_quest_instances WHERE quest_id = p_quest_id
    ) INTO v_matchmaking_done;
    IF v_matchmaking_done THEN
        RETURN jsonb_build_object('ok', false, 'error', 'matchmaking_already_ran');
    END IF;

    BEGIN
        INSERT INTO public.quest_acceptances (student_id, quest_id, status, instance_id)
        VALUES (v_uid, p_quest_id, 'enrolled', NULL)
        RETURNING id INTO v_acceptance_id;
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('ok', false, 'error', 'already_enrolled_or_completed');
    END;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
        v_uid,
        'quest_enrolled',
        'Enrolled in co-op quest',
        format('You enrolled in "%s". Matchmaking runs at %s.',
               v_quest.title,
               to_char(v_quest.expires_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI')),
        jsonb_build_object('quest_id', p_quest_id, 'acceptance_id', v_acceptance_id)
    );

    RETURN jsonb_build_object('ok', true, 'acceptance_id', v_acceptance_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_coop_quest(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_coop_quest(uuid) TO authenticated;

-- ============================================================================
-- 3. unenroll_coop_quest(p_quest_id)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.unenroll_coop_quest(p_quest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_deleted int;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
    END IF;

    DELETE FROM public.quest_acceptances
    WHERE student_id = v_uid
      AND quest_id = p_quest_id
      AND quest_type = 'coop'
      AND status = 'enrolled';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    IF v_deleted = 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'no_enrolled_acceptance');
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unenroll_coop_quest(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.unenroll_coop_quest(uuid) TO authenticated;

-- ============================================================================
-- 4. run_matchmaking(p_quest_id)
--
-- Idempotent — exits early if any coop_quest_instances row already exists
-- for the quest. Wraps the quest row in SELECT FOR UPDATE to serialize
-- concurrent attempts.
--
-- Algorithm:
--   N = count of enrolled acceptances
--   M = quest.max_team_size
--   N == 0 → notify teacher, no instances
--   N == 1 → solo conversion: acceptance → status='active', instance_id=NULL
--   N >= 2 → num_teams = min(ceil(N/M), floor(N/2))
--              base = floor(N/num_teams), remainder = N mod num_teams
--              First `remainder` teams get base+1 members; rest get base.
--              Shuffle via gen_random_bytes from pgcrypto (NOT random()).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_matchmaking(p_quest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_quest record;
    v_n int;
    v_m int;
    v_num_teams int;
    v_base int;
    v_remainder int;
    v_acceptance_ids uuid[];
    v_student_ids uuid[];
    v_team_sizes int[];
    v_instance_id uuid;
    v_teacher_id uuid;
    v_idx int := 1;
    v_team int;
    v_size int;
    v_member int;
BEGIN
    IF v_uid IS NOT NULL AND NOT public.is_teacher(v_uid) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_teacher_or_cron');
    END IF;

    SELECT * INTO v_quest FROM public.quests WHERE id = p_quest_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'quest_not_found');
    END IF;
    IF v_quest.quest_type <> 'coop' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_coop_quest');
    END IF;

    IF EXISTS(SELECT 1 FROM public.coop_quest_instances WHERE quest_id = p_quest_id) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'matchmaking_already_ran');
    END IF;

    SELECT
        array_agg(id ORDER BY rnd),
        array_agg(student_id ORDER BY rnd)
    INTO v_acceptance_ids, v_student_ids
    FROM (
        SELECT id, student_id, encode(gen_random_bytes(16), 'hex') AS rnd
        FROM public.quest_acceptances
        WHERE quest_id = p_quest_id
          AND quest_type = 'coop'
          AND status = 'enrolled'
    ) s;

    v_n := coalesce(array_length(v_acceptance_ids, 1), 0);
    v_m := v_quest.max_team_size;

    IF v_n = 0 THEN
        FOR v_teacher_id IN
            SELECT id FROM public.profiles WHERE role = 'teacher'
        LOOP
            INSERT INTO public.notifications (user_id, type, title, body, data)
            VALUES (
                v_teacher_id,
                'quest_matchmaking_no_enrollments',
                'Co-op quest closed with no enrollments',
                format('No students enrolled in "%s" before matchmaking.', v_quest.title),
                jsonb_build_object('quest_id', p_quest_id)
            );
        END LOOP;
        RETURN jsonb_build_object('ok', true, 'no_enrollments', true, 'teams_formed', 0);
    END IF;

    IF v_n = 1 THEN
        UPDATE public.quest_acceptances
        SET status = 'active', instance_id = NULL
        WHERE id = v_acceptance_ids[1];

        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (
            v_student_ids[1],
            'quest_matchmaking_solo',
            'Co-op converted to solo',
            format('Co-op quest "%s" had only one enrollment; you can complete it solo for the same XP.', v_quest.title),
            jsonb_build_object('quest_id', p_quest_id, 'acceptance_id', v_acceptance_ids[1])
        );
        RETURN jsonb_build_object('ok', true, 'solo_conversion', true, 'teams_formed', 0);
    END IF;

    v_num_teams := LEAST(ceil(v_n::numeric / v_m)::int, (v_n / 2));
    v_base := v_n / v_num_teams;
    v_remainder := v_n % v_num_teams;

    v_team_sizes := ARRAY[]::int[];
    FOR v_team IN 1..v_num_teams LOOP
        IF v_team <= v_remainder THEN
            v_team_sizes := array_append(v_team_sizes, v_base + 1);
        ELSE
            v_team_sizes := array_append(v_team_sizes, v_base);
        END IF;
    END LOOP;

    FOR v_team IN 1..v_num_teams LOOP
        v_size := v_team_sizes[v_team];

        INSERT INTO public.coop_quest_instances (quest_id, status, started_at)
        VALUES (p_quest_id, 'active', now())
        RETURNING id INTO v_instance_id;

        FOR v_member IN 1..v_size LOOP
            UPDATE public.quest_acceptances
            SET status = 'active', instance_id = v_instance_id
            WHERE id = v_acceptance_ids[v_idx];

            INSERT INTO public.notifications (user_id, type, title, body, data)
            VALUES (
                v_student_ids[v_idx],
                'quest_matchmaking_complete',
                'Co-op team ready',
                format('Your team for "%s" is ready.', v_quest.title),
                jsonb_build_object(
                    'quest_id', p_quest_id,
                    'instance_id', v_instance_id,
                    'acceptance_id', v_acceptance_ids[v_idx]
                )
            );

            v_idx := v_idx + 1;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'ok', true,
        'teams_formed', v_num_teams,
        'team_sizes', to_jsonb(v_team_sizes),
        'students_placed', v_n
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_matchmaking(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_matchmaking(uuid) TO authenticated;
-- Service role (used by pg_cron in Phase 5) inherits via the postgres role.

-- ============================================================================
-- 5. submit_quest(p_acceptance_id, p_instance_id, p_text_content)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_quest(
    p_acceptance_id uuid,
    p_instance_id uuid,
    p_text_content text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_acceptance record;
    v_instance record;
    v_word_count int;
    v_submission_id uuid;
    v_quest_title text;
    v_teacher_id uuid;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
    END IF;

    IF (p_acceptance_id IS NULL) = (p_instance_id IS NULL) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'exactly_one_target_required');
    END IF;

    IF coalesce(length(trim(p_text_content)), 0) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'empty_submission');
    END IF;

    v_word_count := public.count_words(p_text_content);

    IF p_acceptance_id IS NOT NULL THEN
        SELECT qa.*, q.title AS quest_title
        INTO v_acceptance
        FROM public.quest_acceptances qa
        JOIN public.quests q ON q.id = qa.quest_id
        WHERE qa.id = p_acceptance_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'error', 'acceptance_not_found');
        END IF;
        IF v_acceptance.student_id <> v_uid THEN
            RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
        END IF;
        IF v_acceptance.status <> 'active' THEN
            RETURN jsonb_build_object('ok', false, 'error', 'acceptance_not_active');
        END IF;
        IF v_acceptance.instance_id IS NOT NULL THEN
            RETURN jsonb_build_object('ok', false, 'error', 'use_instance_path_for_coop');
        END IF;

        v_quest_title := v_acceptance.quest_title;
    ELSE
        SELECT cqi.*, q.title AS quest_title
        INTO v_instance
        FROM public.coop_quest_instances cqi
        JOIN public.quests q ON q.id = cqi.quest_id
        WHERE cqi.id = p_instance_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'error', 'instance_not_found');
        END IF;
        IF v_instance.status <> 'active' THEN
            RETURN jsonb_build_object('ok', false, 'error', 'instance_not_active');
        END IF;
        IF NOT EXISTS(
            SELECT 1 FROM public.quest_acceptances
            WHERE instance_id = p_instance_id
              AND student_id = v_uid
              AND status = 'active'
        ) THEN
            RETURN jsonb_build_object('ok', false, 'error', 'not_team_member');
        END IF;

        v_quest_title := v_instance.quest_title;
    END IF;

    BEGIN
        INSERT INTO public.quest_submissions (
            acceptance_id, instance_id, submitted_by,
            text_content, word_count, status, submitted_at
        )
        VALUES (
            p_acceptance_id, p_instance_id, v_uid,
            p_text_content, v_word_count, 'pending_review', now()
        )
        RETURNING id INTO v_submission_id;
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('ok', false, 'error', 'pending_submission_exists');
    END;

    IF p_instance_id IS NOT NULL THEN
        UPDATE public.coop_quest_instances
        SET status = 'submitted', submitted_at = now()
        WHERE id = p_instance_id;
    END IF;

    FOR v_teacher_id IN
        SELECT id FROM public.profiles WHERE role = 'teacher'
    LOOP
        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (
            v_teacher_id,
            'submission_received',
            'New submission to review',
            format('New submission for "%s".', v_quest_title),
            jsonb_build_object(
                'submission_id', v_submission_id,
                'acceptance_id', p_acceptance_id,
                'instance_id', p_instance_id
            )
        );
    END LOOP;

    RETURN jsonb_build_object(
        'ok', true,
        'submission_id', v_submission_id,
        'word_count', v_word_count
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_quest(uuid, uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_quest(uuid, uuid, text) TO authenticated;

-- ============================================================================
-- 6. review_submission(p_submission_id, p_pass, p_feedback)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.review_submission(
    p_submission_id uuid,
    p_pass boolean,
    p_feedback text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_submission record;
    v_quest record;
    v_xp_awarded int := 0;
    v_members_affected int := 0;
    v_member_record record;
BEGIN
    IF v_uid IS NULL OR NOT public.is_teacher(v_uid) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_teacher');
    END IF;

    IF p_pass = false AND coalesce(length(trim(p_feedback)), 0) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'feedback_required_on_fail');
    END IF;

    SELECT * INTO v_submission FROM public.quest_submissions WHERE id = p_submission_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'submission_not_found');
    END IF;
    IF v_submission.status <> 'pending_review' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'already_reviewed');
    END IF;

    IF v_submission.acceptance_id IS NOT NULL THEN
        SELECT q.* INTO v_quest
        FROM public.quest_acceptances qa
        JOIN public.quests q ON q.id = qa.quest_id
        WHERE qa.id = v_submission.acceptance_id;
    ELSE
        SELECT q.* INTO v_quest
        FROM public.coop_quest_instances cqi
        JOIN public.quests q ON q.id = cqi.quest_id
        WHERE cqi.id = v_submission.instance_id;
    END IF;

    IF p_pass THEN
        UPDATE public.quest_submissions
        SET status = 'passed', reviewed_at = now(), teacher_feedback = p_feedback
        WHERE id = p_submission_id;

        IF v_submission.acceptance_id IS NOT NULL THEN
            UPDATE public.quest_acceptances
            SET status = 'passed', completed_at = now()
            WHERE id = v_submission.acceptance_id
            RETURNING student_id INTO v_member_record;

            INSERT INTO public.xp_ledger (student_id, amount, reason, source_table, source_id)
            VALUES (v_member_record.student_id, v_quest.xp_reward, 'quest_passed',
                    'quest_submissions', p_submission_id);

            INSERT INTO public.notifications (user_id, type, title, body, data)
            VALUES (
                v_member_record.student_id,
                'submission_passed',
                'Quest passed',
                format('Your submission for "%s" passed! +%s XP', v_quest.title, v_quest.xp_reward),
                jsonb_build_object('quest_id', v_quest.id, 'submission_id', p_submission_id)
            );

            v_xp_awarded := v_quest.xp_reward;
            v_members_affected := 1;
        ELSE
            UPDATE public.coop_quest_instances
            SET status = 'passed', reviewed_at = now()
            WHERE id = v_submission.instance_id;

            FOR v_member_record IN
                SELECT student_id, id AS acceptance_id
                FROM public.quest_acceptances
                WHERE instance_id = v_submission.instance_id
                  AND status = 'active'
            LOOP
                UPDATE public.quest_acceptances
                SET status = 'passed', completed_at = now()
                WHERE id = v_member_record.acceptance_id;

                INSERT INTO public.xp_ledger (student_id, amount, reason, source_table, source_id)
                VALUES (v_member_record.student_id, v_quest.xp_reward, 'quest_passed',
                        'quest_submissions', p_submission_id);

                INSERT INTO public.notifications (user_id, type, title, body, data)
                VALUES (
                    v_member_record.student_id,
                    'submission_passed',
                    'Co-op quest passed',
                    format('Your team passed "%s"! +%s XP', v_quest.title, v_quest.xp_reward),
                    jsonb_build_object('quest_id', v_quest.id, 'submission_id', p_submission_id)
                );

                v_members_affected := v_members_affected + 1;
            END LOOP;
            v_xp_awarded := v_quest.xp_reward * v_members_affected;
        END IF;
    ELSE
        UPDATE public.quest_submissions
        SET status = 'failed', reviewed_at = now(), teacher_feedback = p_feedback
        WHERE id = p_submission_id;

        IF v_submission.acceptance_id IS NOT NULL THEN
            SELECT student_id INTO v_member_record
            FROM public.quest_acceptances WHERE id = v_submission.acceptance_id;

            INSERT INTO public.notifications (user_id, type, title, body, data)
            VALUES (
                v_member_record.student_id,
                'submission_failed',
                'Quest needs revision',
                format('Your submission for "%s" needs revision. See feedback and resubmit.', v_quest.title),
                jsonb_build_object('quest_id', v_quest.id, 'submission_id', p_submission_id)
            );
            v_members_affected := 1;
        ELSE
            UPDATE public.coop_quest_instances
            SET status = 'active', submitted_at = NULL
            WHERE id = v_submission.instance_id;

            FOR v_member_record IN
                SELECT student_id FROM public.quest_acceptances
                WHERE instance_id = v_submission.instance_id
                  AND status = 'active'
            LOOP
                INSERT INTO public.notifications (user_id, type, title, body, data)
                VALUES (
                    v_member_record.student_id,
                    'submission_failed',
                    'Co-op quest needs revision',
                    format('Your team submission for "%s" needs revision. See feedback and resubmit.', v_quest.title),
                    jsonb_build_object('quest_id', v_quest.id, 'submission_id', p_submission_id)
                );
                v_members_affected := v_members_affected + 1;
            END LOOP;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'xp_awarded', v_xp_awarded,
        'members_affected', v_members_affected
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_submission(uuid, boolean, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_submission(uuid, boolean, text) TO authenticated;

-- ============================================================================
-- 7. disband_coop_instance(p_instance_id)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.disband_coop_instance(p_instance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_instance record;
    v_quest_title text;
    v_member_record record;
    v_members_released int := 0;
BEGIN
    IF v_uid IS NULL OR NOT public.is_teacher(v_uid) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_teacher');
    END IF;

    SELECT cqi.*, q.title AS quest_title
    INTO v_instance
    FROM public.coop_quest_instances cqi
    JOIN public.quests q ON q.id = cqi.quest_id
    WHERE cqi.id = p_instance_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'instance_not_found');
    END IF;
    IF v_instance.status <> 'active' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'instance_not_active');
    END IF;

    v_quest_title := v_instance.quest_title;

    UPDATE public.coop_quest_instances
    SET status = 'disbanded'
    WHERE id = p_instance_id;

    FOR v_member_record IN
        SELECT id AS acceptance_id, student_id
        FROM public.quest_acceptances
        WHERE instance_id = p_instance_id
          AND status = 'active'
    LOOP
        UPDATE public.quest_acceptances
        SET status = 'disbanded'
        WHERE id = v_member_record.acceptance_id;

        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (
            v_member_record.student_id,
            'quest_disbanded',
            'Team disbanded',
            format('Your team for "%s" was disbanded by the teacher.', v_quest_title),
            jsonb_build_object('instance_id', p_instance_id)
        );
        v_members_released := v_members_released + 1;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'members_released', v_members_released);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.disband_coop_instance(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.disband_coop_instance(uuid) TO authenticated;

COMMIT;

-- ============================================================================
-- Post-commit: pin search_path on count_words to silence the
-- function_search_path_mutable advisor warning. LANGUAGE sql functions
-- can't carry SET inside the body the way plpgsql does.
-- ============================================================================

ALTER FUNCTION public.count_words(text) SET search_path = public, pg_catalog;
