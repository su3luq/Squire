-- Migration 029: Functional coop matchmaking — captain + team numbers + one-shot
--
-- Three problems fixed in one bundle:
--
--   1. run_matchmaking was crashing on every cron tick because
--      gen_random_bytes lives in the `extensions` schema and the
--      function's search_path is `public` only. Fully-qualify the call.
--
--   2. The cron was looping over the same quest every minute even after
--      matchmaking had effectively run. Add quests.matchmaking_ran_at
--      and gate the cron on it so each quest matchmakes exactly once.
--
--   3. Coop teams had no identity. Add a per-class team number
--      (1, 2, 3…) and a captain. Captain is the team member with the
--      lowest learning_velocity (NULLS LAST, ties broken randomly).
--      submit_quest now rejects non-captain submissions on coop.

-- 1. Schema additions
ALTER TABLE public.quests
    ADD COLUMN IF NOT EXISTS matchmaking_ran_at timestamptz;

ALTER TABLE public.coop_quest_instances
    ADD COLUMN IF NOT EXISTS team_number int,
    ADD COLUMN IF NOT EXISTS captain_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coop_team_number_per_class
    ON public.coop_quest_instances (quest_id, class_id, team_number)
    WHERE team_number IS NOT NULL;

-- 2. Rewrite run_matchmaking
CREATE OR REPLACE FUNCTION public.run_matchmaking(p_quest_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_quest record;
    v_class_id uuid;
    v_n int;
    v_m int;
    v_num_teams int;
    v_base int;
    v_remainder int;
    v_acceptance_ids uuid[];
    v_student_ids uuid[];
    v_team_sizes int[];
    v_instance_id uuid;
    v_idx int;
    v_team int;
    v_size int;
    v_member int;
    v_team_member_ids uuid[];
    v_captain_id uuid;
    v_class_results jsonb := '[]'::jsonb;
    v_total_students int := 0;
    v_total_teams int := 0;
    v_teacher_id uuid;
    v_already_notified boolean;
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

    v_m := v_quest.max_team_size;

    FOR v_class_id IN
        SELECT DISTINCT p.class_id
        FROM public.quest_acceptances qa
        JOIN public.profiles p ON p.id = qa.student_id
        WHERE qa.quest_id = p_quest_id
          AND qa.status = 'enrolled'
          AND p.class_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.coop_quest_instances cqi
            WHERE cqi.quest_id = p_quest_id AND cqi.class_id = p.class_id
          )
    LOOP
        SELECT array_agg(id ORDER BY rnd), array_agg(student_id ORDER BY rnd)
        INTO v_acceptance_ids, v_student_ids
        FROM (
            SELECT qa.id, qa.student_id,
                   encode(extensions.gen_random_bytes(16), 'hex') AS rnd
            FROM public.quest_acceptances qa
            JOIN public.profiles p ON p.id = qa.student_id
            WHERE qa.quest_id = p_quest_id
              AND qa.status = 'enrolled'
              AND p.class_id = v_class_id
        ) s;

        v_n := coalesce(array_length(v_acceptance_ids, 1), 0);
        v_total_students := v_total_students + v_n;
        IF v_n = 0 THEN CONTINUE; END IF;

        IF v_n = 1 THEN
            UPDATE public.quest_acceptances
            SET status = 'active', instance_id = NULL
            WHERE id = v_acceptance_ids[1];

            INSERT INTO public.notifications (user_id, type, title, body, data)
            VALUES (
                v_student_ids[1],
                'quest_matchmaking_solo',
                'Co-op converted to solo',
                format('Co-op quest "%s" had only one enrollment in your class; you can complete it solo for the same XP.', v_quest.title),
                jsonb_build_object('quest_id', p_quest_id, 'class_id', v_class_id, 'acceptance_id', v_acceptance_ids[1])
            );
            v_class_results := v_class_results || jsonb_build_array(jsonb_build_object(
                'class_id', v_class_id, 'students_placed', 1, 'teams_formed', 0, 'solo_conversion', true
            ));
            CONTINUE;
        END IF;

        v_num_teams := LEAST(ceil(v_n::numeric / v_m)::int, (v_n / 2));
        v_base := v_n / v_num_teams;
        v_remainder := v_n % v_num_teams;
        v_total_teams := v_total_teams + v_num_teams;

        v_team_sizes := ARRAY[]::int[];
        FOR v_team IN 1..v_num_teams LOOP
            IF v_team <= v_remainder THEN
                v_team_sizes := array_append(v_team_sizes, v_base + 1);
            ELSE
                v_team_sizes := array_append(v_team_sizes, v_base);
            END IF;
        END LOOP;

        v_idx := 1;
        FOR v_team IN 1..v_num_teams LOOP
            v_size := v_team_sizes[v_team];

            v_team_member_ids := ARRAY(
                SELECT v_student_ids[v_idx + g - 1] FROM generate_series(1, v_size) AS g
            );

            SELECT id INTO v_captain_id
            FROM public.profiles
            WHERE id = ANY(v_team_member_ids)
            ORDER BY learning_velocity ASC NULLS LAST,
                     encode(extensions.gen_random_bytes(8), 'hex');

            INSERT INTO public.coop_quest_instances
                (quest_id, class_id, status, team_number, captain_id, started_at)
            VALUES
                (p_quest_id, v_class_id, 'active', v_team, v_captain_id, now())
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
                    format(
                        'You''re on Team %s for "%s"%s.',
                        v_team, v_quest.title,
                        CASE WHEN v_student_ids[v_idx] = v_captain_id
                             THEN ' — you are the team captain'
                             ELSE '' END
                    ),
                    jsonb_build_object(
                        'quest_id', p_quest_id,
                        'class_id', v_class_id,
                        'instance_id', v_instance_id,
                        'acceptance_id', v_acceptance_ids[v_idx],
                        'team_number', v_team,
                        'is_captain', v_student_ids[v_idx] = v_captain_id
                    )
                );
                v_idx := v_idx + 1;
            END LOOP;
        END LOOP;

        v_class_results := v_class_results || jsonb_build_array(jsonb_build_object(
            'class_id', v_class_id, 'students_placed', v_n, 'teams_formed', v_num_teams, 'team_sizes', to_jsonb(v_team_sizes)
        ));
    END LOOP;

    IF jsonb_array_length(v_class_results) = 0
       AND NOT EXISTS (SELECT 1 FROM public.coop_quest_instances WHERE quest_id = p_quest_id)
    THEN
        SELECT EXISTS (
            SELECT 1 FROM public.notifications n
            WHERE n.type = 'quest_matchmaking_no_enrollments'
              AND (n.data->>'quest_id')::uuid = p_quest_id
        ) INTO v_already_notified;

        IF NOT v_already_notified THEN
            FOR v_teacher_id IN SELECT id FROM public.profiles WHERE role = 'teacher' LOOP
                INSERT INTO public.notifications (user_id, type, title, body, data)
                VALUES (
                    v_teacher_id, 'quest_matchmaking_no_enrollments',
                    'Co-op quest closed with no enrollments',
                    format('No students enrolled in "%s" before matchmaking.', v_quest.title),
                    jsonb_build_object('quest_id', p_quest_id)
                );
            END LOOP;
        END IF;

        UPDATE public.quests SET matchmaking_ran_at = now() WHERE id = p_quest_id;
        RETURN jsonb_build_object('ok', true, 'no_enrollments', true, 'classes_processed', 0);
    END IF;

    UPDATE public.quests SET matchmaking_ran_at = now() WHERE id = p_quest_id;

    RETURN jsonb_build_object(
        'ok', true,
        'classes_processed', jsonb_array_length(v_class_results),
        'total_teams_formed', v_total_teams,
        'total_students_placed', v_total_students,
        'results', v_class_results
    );
END;
$$;

-- 3. Captain-only submit on coop
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
    END IF;

    RETURN jsonb_build_object('ok', true, 'submission_id', v_submission_id, 'word_count', v_word_count);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_quest(uuid, uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_quest(uuid, uuid, text) TO authenticated;

-- 4. Update cron: one-shot per quest
SELECT cron.unschedule('matchmaking');
SELECT cron.schedule(
    'matchmaking',
    '* * * * *',
    $cron$
    DO $do$
    DECLARE
        v_quest_id uuid;
    BEGIN
        FOR v_quest_id IN
            SELECT q.id
            FROM public.quests q
            WHERE q.quest_type = 'coop'
              AND q.expires_at IS NOT NULL
              AND q.expires_at <= now()
              AND q.closed_at IS NULL
              AND q.matchmaking_ran_at IS NULL
        LOOP
            PERFORM public.run_matchmaking(v_quest_id);
        END LOOP;
    END $do$;
    $cron$
);

-- 5. Clear stale "no enrollments" notifications on quests that actually have enrollments
DELETE FROM public.notifications
WHERE type = 'quest_matchmaking_no_enrollments'
  AND EXISTS (
    SELECT 1 FROM public.quest_acceptances qa
    WHERE qa.quest_id = (notifications.data->>'quest_id')::uuid
      AND qa.status = 'enrolled'
  );
