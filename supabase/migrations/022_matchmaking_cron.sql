-- Migration 022: pg_cron schedule for coop matchmaking.
--
-- Behavior:
--   * Every minute, find any coop quest whose expires_at has passed and
--     either has enrolled students or has no instances yet.
--   * Call run_matchmaking(quest_id) on each — which is idempotent per
--     (quest, class), so already-matched classes are skipped on subsequent
--     ticks and a class that enrolled late is still picked up.
--
-- Also tightens run_matchmaking: the "no enrollments" notification is now
-- guarded by a pre-existence check so a zero-enrollment quest gets exactly
-- one notification (not one per cron tick).
--
-- Same precedent as migration 017 (velocity cron) — no Edge Function needed.
--
-- Applied via Supabase MCP. This file is the source-of-truth audit copy.

-- 1. Update run_matchmaking with idempotent no-enrollments notification
CREATE OR REPLACE FUNCTION public.run_matchmaking(p_quest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
            SELECT qa.id, qa.student_id, encode(gen_random_bytes(16), 'hex') AS rnd
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

            INSERT INTO public.coop_quest_instances (quest_id, class_id, status, started_at)
            VALUES (p_quest_id, v_class_id, 'active', now())
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
                        'class_id', v_class_id,
                        'instance_id', v_instance_id,
                        'acceptance_id', v_acceptance_ids[v_idx]
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
        RETURN jsonb_build_object('ok', true, 'no_enrollments', true, 'classes_processed', 0);
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'classes_processed', jsonb_array_length(v_class_results),
        'total_teams_formed', v_total_teams,
        'total_students_placed', v_total_students,
        'results', v_class_results
    );
END;
$$;

-- 2. Schedule the matchmaking cron every minute
SELECT cron.schedule(
    'matchmaking',
    '* * * * *',
    $cron$
    DO $do$
    DECLARE
        v_quest_id uuid;
    BEGIN
        FOR v_quest_id IN
            SELECT DISTINCT q.id
            FROM public.quests q
            WHERE q.quest_type = 'coop'
              AND q.expires_at IS NOT NULL
              AND q.expires_at <= now()
              AND q.closed_at IS NULL
              AND (
                EXISTS (
                    SELECT 1 FROM public.quest_acceptances qa
                    WHERE qa.quest_id = q.id AND qa.status = 'enrolled'
                )
                OR NOT EXISTS (
                    SELECT 1 FROM public.coop_quest_instances cqi
                    WHERE cqi.quest_id = q.id
                )
              )
        LOOP
            PERFORM public.run_matchmaking(v_quest_id);
        END LOOP;
    END $do$;
    $cron$
);
