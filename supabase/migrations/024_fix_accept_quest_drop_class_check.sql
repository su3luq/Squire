-- Migration 024: Hotfix — drop the v_quest.class_id check from
-- accept_solo_quest and accept_coop_quest.
--
-- Bug: migration 019 defined these RPCs back when quests had a class_id
-- column. Migration 021 dropped that column when quests became
-- class-agnostic, but the function bodies were not updated. Trying to
-- accept any quest raised:
--   ERROR: record "v_quest" has no field "class_id"
--
-- Fix: remove the v_student_class lookup and the wrong_class check — they
-- are no longer meaningful since any student in any class can accept any
-- open quest. Also tighten accept_coop_quest's matchmaking-done check so
-- it scopes by the student's own class (a coop quest that has already
-- matched in OTHER classes should still allow enrollment in a class
-- that hasn't been matched yet, as long as the deadline hasn't passed).
--
-- Applied via Supabase MCP. This file is the source-of-truth audit copy.

CREATE OR REPLACE FUNCTION public.accept_solo_quest(p_quest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_quest record;
    v_acceptance_id uuid;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
    END IF;
    IF public.is_teacher(v_uid) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'teacher_cannot_accept_quest');
    END IF;

    SELECT * INTO v_quest FROM public.quests WHERE id = p_quest_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'quest_not_found');
    END IF;
    IF v_quest.quest_type <> 'solo' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_solo_quest');
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

CREATE OR REPLACE FUNCTION public.accept_coop_quest(p_quest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
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

    SELECT * INTO v_quest FROM public.quests WHERE id = p_quest_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'quest_not_found');
    END IF;
    IF v_quest.quest_type <> 'coop' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_coop_quest');
    END IF;
    IF v_quest.closed_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'quest_closed');
    END IF;
    IF v_quest.expires_at IS NULL OR v_quest.expires_at <= now() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'quest_expired_or_no_deadline');
    END IF;

    -- Coop visibility rule: matchmaking must not have run yet for THIS
    -- student's class. Matchmaking in OTHER classes does not block.
    SELECT EXISTS(
        SELECT 1 FROM public.coop_quest_instances cqi
        JOIN public.profiles p ON p.id = v_uid
        WHERE cqi.quest_id = p_quest_id AND cqi.class_id = p.class_id
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
