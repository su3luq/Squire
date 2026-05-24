-- Migration 032: enrich submission notifications.
--
-- Migration 029 rewrote submit_quest and silently dropped the teacher
-- notification insert that 019 had. This restores it and enriches the
-- body to show class · student · quest at a glance (solo) or
-- class · team · quest · captain (coop). The data jsonb gets the same
-- fields broken out for future deep-linking from the inbox UI.

CREATE OR REPLACE FUNCTION public.submit_quest(
    p_acceptance_id uuid DEFAULT NULL,
    p_instance_id uuid DEFAULT NULL,
    p_text_content text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_acceptance record;
    v_instance record;
    v_word_count int;
    v_submission_id uuid;
    v_teacher_id uuid;
    v_class_id uuid;
    v_class_name text;
    v_quest_id uuid;
    v_quest_title text;
    v_student_id uuid;
    v_student_name text;
    v_team_number int;
    v_team_size int;
    v_captain_name text;
    v_body text;
    v_data jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
    END IF;
    IF p_text_content IS NULL OR length(trim(p_text_content)) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'empty_submission');
    END IF;
    IF (p_acceptance_id IS NULL) = (p_instance_id IS NULL) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'pass_exactly_one_id');
    END IF;

    v_word_count := public.count_words(p_text_content);

    IF p_acceptance_id IS NOT NULL THEN
        SELECT * INTO v_acceptance
        FROM public.quest_acceptances
        WHERE id = p_acceptance_id FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'error', 'acceptance_not_found');
        END IF;
        IF v_acceptance.student_id <> v_uid THEN
            RETURN jsonb_build_object('ok', false, 'error', 'not_your_acceptance');
        END IF;
        IF v_acceptance.status <> 'active' THEN
            RETURN jsonb_build_object('ok', false, 'error', 'not_active');
        END IF;
        IF v_acceptance.instance_id IS NOT NULL THEN
            RETURN jsonb_build_object('ok', false, 'error', 'use_instance_id_for_coop');
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.quest_submissions
            WHERE acceptance_id = p_acceptance_id AND status = 'pending_review'
        ) THEN
            RETURN jsonb_build_object('ok', false, 'error', 'pending_review_exists');
        END IF;

        INSERT INTO public.quest_submissions
            (acceptance_id, submitted_by, text_content, word_count, status)
        VALUES
            (p_acceptance_id, v_uid, p_text_content, v_word_count, 'pending_review')
        RETURNING id INTO v_submission_id;

        SELECT q.title, p.full_name, p.class_id, c.name
        INTO v_quest_title, v_student_name, v_class_id, v_class_name
        FROM public.quests q
        CROSS JOIN public.profiles p
        LEFT JOIN public.classes c ON c.id = p.class_id
        WHERE q.id = v_acceptance.quest_id
          AND p.id = v_acceptance.student_id;

        v_quest_id := v_acceptance.quest_id;
        v_student_id := v_acceptance.student_id;

        v_body := format(
            'Class %s · %s — "%s"',
            COALESCE(v_class_name, 'Unknown'),
            COALESCE(v_student_name, 'Unknown student'),
            v_quest_title
        );

        v_data := jsonb_build_object(
            'submission_id', v_submission_id,
            'acceptance_id', p_acceptance_id,
            'instance_id', NULL,
            'quest_id', v_quest_id,
            'quest_title', v_quest_title,
            'class_id', v_class_id,
            'class_name', v_class_name,
            'student_id', v_student_id,
            'student_name', v_student_name,
            'quest_type', 'solo'
        );

    ELSE
        SELECT * INTO v_instance
        FROM public.coop_quest_instances
        WHERE id = p_instance_id FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'error', 'instance_not_found');
        END IF;
        IF v_instance.status <> 'active' THEN
            RETURN jsonb_build_object('ok', false, 'error', 'instance_not_active');
        END IF;
        IF v_instance.captain_id IS NULL OR v_instance.captain_id <> v_uid THEN
            RETURN jsonb_build_object('ok', false, 'error', 'not_team_captain');
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.quest_submissions
            WHERE instance_id = p_instance_id AND status = 'pending_review'
        ) THEN
            RETURN jsonb_build_object('ok', false, 'error', 'pending_review_exists');
        END IF;

        INSERT INTO public.quest_submissions
            (instance_id, submitted_by, text_content, word_count, status)
        VALUES
            (p_instance_id, v_uid, p_text_content, v_word_count, 'pending_review')
        RETURNING id INTO v_submission_id;

        SELECT q.title, c.name, p.full_name
        INTO v_quest_title, v_class_name, v_captain_name
        FROM public.quests q
        CROSS JOIN public.classes c
        CROSS JOIN public.profiles p
        WHERE q.id = v_instance.quest_id
          AND c.id = v_instance.class_id
          AND p.id = v_instance.captain_id;

        v_quest_id := v_instance.quest_id;
        v_class_id := v_instance.class_id;
        v_team_number := v_instance.team_number;

        SELECT count(*) INTO v_team_size
        FROM public.quest_acceptances
        WHERE instance_id = p_instance_id;

        v_body := format(
            'Class %s · Team %s (%s members) — "%s" — submitted by %s',
            COALESCE(v_class_name, 'Unknown'),
            v_team_number::text,
            v_team_size::text,
            v_quest_title,
            COALESCE(v_captain_name, 'Unknown')
        );

        v_data := jsonb_build_object(
            'submission_id', v_submission_id,
            'acceptance_id', NULL,
            'instance_id', p_instance_id,
            'quest_id', v_quest_id,
            'quest_title', v_quest_title,
            'class_id', v_class_id,
            'class_name', v_class_name,
            'team_number', v_team_number,
            'team_size', v_team_size,
            'captain_id', v_instance.captain_id,
            'captain_name', v_captain_name,
            'quest_type', 'coop'
        );
    END IF;

    FOR v_teacher_id IN
        SELECT id FROM public.profiles WHERE role = 'teacher'
    LOOP
        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (
            v_teacher_id,
            'submission_received',
            'New submission to review',
            v_body,
            v_data
        );
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'submission_id', v_submission_id, 'word_count', v_word_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_quest(uuid, uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_quest(uuid, uuid, text) TO authenticated;
