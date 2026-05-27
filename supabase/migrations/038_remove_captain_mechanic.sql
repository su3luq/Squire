-- Migration 038: Remove the team-captain mechanic (Phase 8 follow-up)
--
-- Per-member drafts + auto-finalize trigger replaced the captain-only
-- submit flow. Captain assignment is no longer needed. We keep the
-- captain_id column nullable so existing data isn't lost, but stop
-- populating it going forward, and simplify submit_quest to handle
-- only solo (coop now goes through finalize_team_submission).
-- run_matchmaking is rewritten to skip captain selection and drop the
-- captain-specific notification text.

-- 1. submit_quest: drop the coop branch entirely. Coop now flows
-- through coop_member_drafts -> finalize trigger -> quest_submissions.
-- Solo path is unchanged.
create or replace function public.submit_quest(
    p_acceptance_id uuid default null,
    p_instance_id uuid default null,
    p_text_content text default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_acceptance record;
    v_word_count int;
    v_submission_id uuid;
begin
    if v_uid is null then
        return jsonb_build_object('ok', false, 'error', 'not_authenticated');
    end if;
    if p_text_content is null or length(trim(p_text_content)) = 0 then
        return jsonb_build_object('ok', false, 'error', 'empty_submission');
    end if;
    if p_acceptance_id is null then
        return jsonb_build_object('ok', false, 'error', 'acceptance_id_required');
    end if;
    if p_instance_id is not null then
        return jsonb_build_object('ok', false, 'error', 'coop_uses_member_drafts');
    end if;

    v_word_count := public.count_words(p_text_content);

    select * into v_acceptance
    from public.quest_acceptances
    where id = p_acceptance_id for update;
    if not found then
        return jsonb_build_object('ok', false, 'error', 'acceptance_not_found');
    end if;
    if v_acceptance.student_id <> v_uid then
        return jsonb_build_object('ok', false, 'error', 'not_your_acceptance');
    end if;
    if v_acceptance.status <> 'active' then
        return jsonb_build_object('ok', false, 'error', 'not_active');
    end if;
    if v_acceptance.instance_id is not null then
        return jsonb_build_object('ok', false, 'error', 'coop_uses_member_drafts');
    end if;
    if exists (
        select 1 from public.quest_submissions
        where acceptance_id = p_acceptance_id and status = 'pending_review'
    ) then
        return jsonb_build_object('ok', false, 'error', 'pending_review_exists');
    end if;

    insert into public.quest_submissions
        (acceptance_id, submitted_by, text_content, word_count, status)
    values
        (p_acceptance_id, v_uid, p_text_content, v_word_count, 'pending_review')
    returning id into v_submission_id;

    return jsonb_build_object('ok', true, 'submission_id', v_submission_id, 'word_count', v_word_count);
end;
$$;

-- 2. run_matchmaking: drop captain selection + simplify the
-- "team ready" notification.
create or replace function public.run_matchmaking(p_quest_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_quest record;
    v_class_id uuid;
    v_n int; v_m int; v_num_teams int;
    v_base int; v_remainder int;
    v_acceptance_ids uuid[]; v_student_ids uuid[]; v_team_sizes int[];
    v_instance_id uuid;
    v_idx int; v_team int; v_size int; v_member int;
    v_class_results jsonb := '[]'::jsonb;
    v_total_students int := 0; v_total_teams int := 0;
    v_teacher_id uuid;
    v_already_notified boolean;
begin
    if v_uid is not null and not public.is_teacher(v_uid) then
        return jsonb_build_object('ok', false, 'error', 'not_teacher_or_cron');
    end if;

    select * into v_quest from public.quests where id = p_quest_id for update;
    if not found then
        return jsonb_build_object('ok', false, 'error', 'quest_not_found');
    end if;
    if v_quest.quest_type <> 'coop' then
        return jsonb_build_object('ok', false, 'error', 'not_coop_quest');
    end if;

    v_m := v_quest.max_team_size;

    for v_class_id in
        select distinct p.class_id from public.quest_acceptances qa
        join public.profiles p on p.id = qa.student_id
        where qa.quest_id = p_quest_id and qa.status = 'enrolled'
          and p.class_id is not null
          and not exists (
            select 1 from public.coop_quest_instances cqi
            where cqi.quest_id = p_quest_id and cqi.class_id = p.class_id
          )
    loop
        select array_agg(id order by rnd), array_agg(student_id order by rnd)
        into v_acceptance_ids, v_student_ids
        from (
            select qa.id, qa.student_id,
                   encode(extensions.gen_random_bytes(16), 'hex') as rnd
            from public.quest_acceptances qa
            join public.profiles p on p.id = qa.student_id
            where qa.quest_id = p_quest_id and qa.status = 'enrolled'
              and p.class_id = v_class_id
        ) s;

        v_n := coalesce(array_length(v_acceptance_ids, 1), 0);
        v_total_students := v_total_students + v_n;
        if v_n = 0 then continue; end if;

        if v_n = 1 then
            update public.quest_acceptances
            set status = 'active', instance_id = null
            where id = v_acceptance_ids[1];

            insert into public.notifications (user_id, type, title, body, data)
            values (v_student_ids[1], 'quest_matchmaking_solo', 'Co-op converted to solo',
                    format('Co-op quest "%s" had only one enrollment in your class; you can complete it solo for the same XP.', v_quest.title),
                    jsonb_build_object('quest_id', p_quest_id, 'class_id', v_class_id, 'acceptance_id', v_acceptance_ids[1]));
            v_class_results := v_class_results || jsonb_build_array(jsonb_build_object(
                'class_id', v_class_id, 'students_placed', 1, 'teams_formed', 0, 'solo_conversion', true));
            continue;
        end if;

        v_num_teams := least(ceil(v_n::numeric / v_m)::int, (v_n / 2));
        v_base := v_n / v_num_teams;
        v_remainder := v_n % v_num_teams;
        v_total_teams := v_total_teams + v_num_teams;

        v_team_sizes := array[]::int[];
        for v_team in 1..v_num_teams loop
            if v_team <= v_remainder then
                v_team_sizes := array_append(v_team_sizes, v_base + 1);
            else
                v_team_sizes := array_append(v_team_sizes, v_base);
            end if;
        end loop;

        v_idx := 1;
        for v_team in 1..v_num_teams loop
            v_size := v_team_sizes[v_team];

            insert into public.coop_quest_instances
                (quest_id, class_id, status, team_number, started_at)
            values
                (p_quest_id, v_class_id, 'active', v_team, now())
            returning id into v_instance_id;

            for v_member in 1..v_size loop
                update public.quest_acceptances
                set status = 'active', instance_id = v_instance_id
                where id = v_acceptance_ids[v_idx];

                insert into public.notifications (user_id, type, title, body, data)
                values (v_student_ids[v_idx], 'quest_matchmaking_complete', 'Co-op team ready',
                        format('You''re on Team %s for "%s".', v_team, v_quest.title),
                        jsonb_build_object('quest_id', p_quest_id, 'class_id', v_class_id,
                                           'instance_id', v_instance_id,
                                           'acceptance_id', v_acceptance_ids[v_idx],
                                           'team_number', v_team));
                v_idx := v_idx + 1;
            end loop;
        end loop;

        v_class_results := v_class_results || jsonb_build_array(jsonb_build_object(
            'class_id', v_class_id, 'students_placed', v_n, 'teams_formed', v_num_teams, 'team_sizes', to_jsonb(v_team_sizes)));
    end loop;

    if jsonb_array_length(v_class_results) = 0
       and not exists (select 1 from public.coop_quest_instances where quest_id = p_quest_id)
    then
        select exists (
            select 1 from public.notifications n
            where n.type = 'quest_matchmaking_no_enrollments'
              and (n.data->>'quest_id')::uuid = p_quest_id
        ) into v_already_notified;

        if not v_already_notified then
            for v_teacher_id in select id from public.profiles where role = 'teacher' loop
                insert into public.notifications (user_id, type, title, body, data)
                values (v_teacher_id, 'quest_matchmaking_no_enrollments',
                        'Co-op quest closed with no enrollments',
                        format('No students enrolled in "%s" before matchmaking.', v_quest.title),
                        jsonb_build_object('quest_id', p_quest_id));
            end loop;
        end if;

        update public.quests set matchmaking_ran_at = now() where id = p_quest_id;
        return jsonb_build_object('ok', true, 'no_enrollments', true, 'classes_processed', 0);
    end if;

    update public.quests set matchmaking_ran_at = now() where id = p_quest_id;
    return jsonb_build_object('ok', true,
                              'classes_processed', jsonb_array_length(v_class_results),
                              'total_teams_formed', v_total_teams,
                              'total_students_placed', v_total_students,
                              'results', v_class_results);
end;
$$;

-- 3. Clear captain_id on all existing rows.
update public.coop_quest_instances set captain_id = null where captain_id is not null;
