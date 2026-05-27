-- Migration 037: Coop per-member team finalize + unlock (Phase 8 Day 3)
--
-- Replaces the captain-only submit_quest flow with a per-member submit
-- model. Members toggle submitted_at on their own coop_member_drafts row;
-- an AFTER UPDATE trigger calls finalize_team_submission when all members
-- have submitted. On finalize:
--   - one quest_submissions row is created with concatenated per-member sections
--   - coop_quest_instances.status flips to 'submitted'
--   - drafts lock via existing RLS (requires instance.status = 'active')

create or replace function public._coop_concatenate_drafts(p_instance_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
    v_out text := '';
    v_row record;
begin
    for v_row in
        select d.body_md, p.full_name
        from public.coop_member_drafts d
        join public.profiles p on p.id = d.student_id
        where d.instance_id = p_instance_id
        order by p.full_name asc
    loop
        if length(v_out) > 0 then v_out := v_out || E'\n\n'; end if;
        v_out := v_out || '## ' || v_row.full_name || E'\n\n' ||
                 case when length(trim(coalesce(v_row.body_md, ''))) = 0
                      then '*(No draft submitted)*'
                      else v_row.body_md end;
    end loop;
    return v_out;
end;
$$;
revoke execute on function public._coop_concatenate_drafts(uuid) from anon, authenticated, public;

create or replace function public.finalize_team_submission(p_instance_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_instance record;
    v_total int; v_submitted int;
    v_concatenated text;
    v_word_count int;
    v_last_submitter uuid;
    v_submission_id uuid;
begin
    select * into v_instance from public.coop_quest_instances
    where id = p_instance_id for update;
    if not found then
        return jsonb_build_object('ok', false, 'error', 'instance_not_found');
    end if;
    if v_instance.status <> 'active' then
        return jsonb_build_object('ok', false, 'error', 'instance_not_active');
    end if;

    select count(*) into v_total from public.coop_member_drafts where instance_id = p_instance_id;
    select count(*) into v_submitted from public.coop_member_drafts
    where instance_id = p_instance_id and submitted_at is not null;
    if v_total = 0 or v_submitted < v_total then
        return jsonb_build_object('ok', false, 'error', 'not_all_submitted');
    end if;

    if exists (
        select 1 from public.quest_submissions
        where instance_id = p_instance_id and status = 'pending_review'
    ) then
        return jsonb_build_object('ok', true, 'already_finalized', true);
    end if;

    select student_id into v_last_submitter
    from public.coop_member_drafts
    where instance_id = p_instance_id and submitted_at is not null
    order by submitted_at desc limit 1;

    v_concatenated := public._coop_concatenate_drafts(p_instance_id);
    v_word_count := public.count_words(v_concatenated);

    insert into public.quest_submissions
        (instance_id, submitted_by, text_content, word_count, status)
    values
        (p_instance_id, v_last_submitter, v_concatenated, v_word_count, 'pending_review')
    returning id into v_submission_id;

    update public.coop_quest_instances
    set status = 'submitted', submitted_at = now()
    where id = p_instance_id;

    return jsonb_build_object('ok', true, 'submission_id', v_submission_id,
                              'word_count', v_word_count, 'finalized_by', v_last_submitter);
end;
$$;
revoke execute on function public.finalize_team_submission(uuid) from anon, authenticated, public;

create or replace function public.force_finalize_team_submission(p_instance_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_uid uuid := auth.uid();
    v_instance record;
    v_concatenated text;
    v_word_count int;
    v_submission_id uuid;
begin
    if v_uid is null or not public.is_teacher(v_uid) then
        return jsonb_build_object('ok', false, 'error', 'not_teacher');
    end if;
    select * into v_instance from public.coop_quest_instances
    where id = p_instance_id for update;
    if not found then
        return jsonb_build_object('ok', false, 'error', 'instance_not_found');
    end if;
    if v_instance.status <> 'active' then
        return jsonb_build_object('ok', false, 'error', 'instance_not_active');
    end if;
    if exists (
        select 1 from public.quest_submissions
        where instance_id = p_instance_id and status = 'pending_review'
    ) then
        return jsonb_build_object('ok', true, 'already_finalized', true);
    end if;

    v_concatenated := public._coop_concatenate_drafts(p_instance_id);
    v_word_count := public.count_words(v_concatenated);

    insert into public.quest_submissions
        (instance_id, submitted_by, text_content, word_count, status)
    values
        (p_instance_id, v_uid, v_concatenated, v_word_count, 'pending_review')
    returning id into v_submission_id;

    update public.coop_quest_instances
    set status = 'submitted', submitted_at = now()
    where id = p_instance_id;

    return jsonb_build_object('ok', true, 'submission_id', v_submission_id);
end;
$$;
revoke execute on function public.force_finalize_team_submission(uuid) from anon, public;
grant execute on function public.force_finalize_team_submission(uuid) to authenticated;

create or replace function public.coop_member_drafts_maybe_finalize()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if new.submitted_at is not null
       and (old.submitted_at is null or old.submitted_at is distinct from new.submitted_at)
    then
        perform public.finalize_team_submission(new.instance_id);
    end if;
    return new;
end;
$$;
revoke execute on function public.coop_member_drafts_maybe_finalize() from anon, authenticated, public;

create trigger coop_member_drafts_maybe_finalize
  after update of submitted_at on public.coop_member_drafts
  for each row execute function public.coop_member_drafts_maybe_finalize();

create or replace function public.review_submission(
    p_submission_id uuid, p_pass boolean, p_feedback text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_uid uuid := auth.uid();
    v_submission record;
    v_quest record;
    v_xp_awarded int := 0;
    v_members_affected int := 0;
    v_member_record record;
begin
    if v_uid is null or not public.is_teacher(v_uid) then
        return jsonb_build_object('ok', false, 'error', 'not_teacher');
    end if;
    if p_pass = false and coalesce(length(trim(p_feedback)), 0) = 0 then
        return jsonb_build_object('ok', false, 'error', 'feedback_required_on_fail');
    end if;
    select * into v_submission from public.quest_submissions
    where id = p_submission_id for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'submission_not_found'); end if;
    if v_submission.status <> 'pending_review' then
        return jsonb_build_object('ok', false, 'error', 'already_reviewed');
    end if;

    if v_submission.acceptance_id is not null then
        select q.* into v_quest from public.quest_acceptances qa
        join public.quests q on q.id = qa.quest_id where qa.id = v_submission.acceptance_id;
    else
        select q.* into v_quest from public.coop_quest_instances cqi
        join public.quests q on q.id = cqi.quest_id where cqi.id = v_submission.instance_id;
    end if;

    if p_pass then
        update public.quest_submissions
        set status = 'passed', reviewed_at = now(), teacher_feedback = p_feedback
        where id = p_submission_id;
        if v_submission.acceptance_id is not null then
            update public.quest_acceptances
            set status = 'passed', completed_at = now()
            where id = v_submission.acceptance_id returning student_id into v_member_record;
            insert into public.xp_ledger (student_id, amount, reason, source_table, source_id)
            values (v_member_record.student_id, v_quest.xp_reward, 'quest_passed', 'quest_submissions', p_submission_id);
            insert into public.notifications (user_id, type, title, body, data)
            values (v_member_record.student_id, 'submission_passed', 'Quest passed',
                    format('Your submission for "%s" passed! +%s XP', v_quest.title, v_quest.xp_reward),
                    jsonb_build_object('quest_id', v_quest.id, 'submission_id', p_submission_id));
            v_xp_awarded := v_quest.xp_reward; v_members_affected := 1;
        else
            update public.coop_quest_instances
            set status = 'passed', reviewed_at = now() where id = v_submission.instance_id;
            for v_member_record in
                select student_id, id as acceptance_id from public.quest_acceptances
                where instance_id = v_submission.instance_id and status = 'active'
            loop
                update public.quest_acceptances set status = 'passed', completed_at = now()
                where id = v_member_record.acceptance_id;
                insert into public.xp_ledger (student_id, amount, reason, source_table, source_id)
                values (v_member_record.student_id, v_quest.xp_reward, 'quest_passed', 'quest_submissions', p_submission_id);
                insert into public.notifications (user_id, type, title, body, data)
                values (v_member_record.student_id, 'submission_passed', 'Co-op quest passed',
                        format('Your team passed "%s"! +%s XP', v_quest.title, v_quest.xp_reward),
                        jsonb_build_object('quest_id', v_quest.id, 'submission_id', p_submission_id));
                v_members_affected := v_members_affected + 1;
            end loop;
            v_xp_awarded := v_quest.xp_reward * v_members_affected;
        end if;
    else
        update public.quest_submissions
        set status = 'failed', reviewed_at = now(), teacher_feedback = p_feedback
        where id = p_submission_id;
        if v_submission.acceptance_id is not null then
            select student_id into v_member_record
            from public.quest_acceptances where id = v_submission.acceptance_id;
            insert into public.notifications (user_id, type, title, body, data)
            values (v_member_record.student_id, 'submission_failed', 'Quest needs revision',
                    format('Your submission for "%s" needs revision. See feedback and resubmit.', v_quest.title),
                    jsonb_build_object('quest_id', v_quest.id, 'submission_id', p_submission_id));
            v_members_affected := 1;
        else
            update public.coop_quest_instances set status = 'active', submitted_at = null
            where id = v_submission.instance_id;
            -- Phase 8 Day 3: clear per-member submitted_at so members can revise & retoggle.
            update public.coop_member_drafts set submitted_at = null
            where instance_id = v_submission.instance_id;
            for v_member_record in
                select student_id from public.quest_acceptances
                where instance_id = v_submission.instance_id and status = 'active'
            loop
                insert into public.notifications (user_id, type, title, body, data)
                values (v_member_record.student_id, 'submission_failed', 'Co-op quest needs revision',
                        format('Your team submission for "%s" needs revision. See feedback and resubmit.', v_quest.title),
                        jsonb_build_object('quest_id', v_quest.id, 'submission_id', p_submission_id));
                v_members_affected := v_members_affected + 1;
            end loop;
        end if;
    end if;

    return jsonb_build_object('ok', true, 'xp_awarded', v_xp_awarded, 'members_affected', v_members_affected);
end;
$$;
