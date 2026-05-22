-- Migration 028: Eliminate the 'disbanded' status entirely.
--
-- Product decision: disbanding a quest or a coop team should remove the
-- affected students from the enrollments and members lists, not leave
-- them in a vestigial 'disbanded' state. The state had no UI affordance
-- and just cluttered the data model.
--
-- Side effect: a student who was disbanded can re-enroll in the same
-- coop quest as long as expires_at > now() and matchmaking hasn't run
-- in their class — because the acceptance row is gone, not just flagged.
--
-- Changes:
--   1. Wipe existing 'disbanded' rows on both tables.
--   2. Drop the unique indexes that reference the enum (so the swap can
--      proceed) — these are recreated after.
--   3. Swap quest_acceptance_status: drop the 'disbanded' value.
--   4. Swap coop_instance_status: drop the 'disbanded' value.
--   5. Recreate the three unique indexes.
--   6. Rewrite disband_quest and disband_coop_instance to DELETE
--      instead of UPDATE … SET status='disbanded'.

-- 1. Wipe existing 'disbanded' rows. quest_submissions cascade via FK.
DELETE FROM public.coop_quest_instances WHERE status = 'disbanded';
DELETE FROM public.quest_acceptances WHERE status = 'disbanded';

-- 2. Drop indexes referencing the enum
DROP INDEX IF EXISTS public.idx_one_active_solo_per_student;
DROP INDEX IF EXISTS public.idx_one_active_coop_per_student;
DROP INDEX IF EXISTS public.idx_no_repeat_coop_per_student;

-- 3. Swap quest_acceptance_status (drop 'disbanded')
ALTER TABLE public.quest_acceptances ALTER COLUMN status DROP DEFAULT;
CREATE TYPE public.quest_acceptance_status_new AS ENUM (
    'active', 'submitted', 'passed', 'failed', 'enrolled'
);
ALTER TABLE public.quest_acceptances
    ALTER COLUMN status TYPE public.quest_acceptance_status_new
    USING status::text::public.quest_acceptance_status_new;
DROP TYPE public.quest_acceptance_status;
ALTER TYPE public.quest_acceptance_status_new RENAME TO quest_acceptance_status;
ALTER TABLE public.quest_acceptances
    ALTER COLUMN status SET DEFAULT 'active'::public.quest_acceptance_status;

-- 4. Swap coop_instance_status (drop 'disbanded')
ALTER TABLE public.coop_quest_instances ALTER COLUMN status DROP DEFAULT;
CREATE TYPE public.coop_instance_status_new AS ENUM ('active', 'submitted', 'passed');
ALTER TABLE public.coop_quest_instances
    ALTER COLUMN status TYPE public.coop_instance_status_new
    USING status::text::public.coop_instance_status_new;
DROP TYPE public.coop_instance_status;
ALTER TYPE public.coop_instance_status_new RENAME TO coop_instance_status;
ALTER TABLE public.coop_quest_instances
    ALTER COLUMN status SET DEFAULT 'active'::public.coop_instance_status;

-- 5. Recreate the unique indexes
CREATE UNIQUE INDEX idx_one_active_solo_per_student
    ON public.quest_acceptances (student_id)
    WHERE quest_type = 'solo' AND status = 'active';
CREATE UNIQUE INDEX idx_one_active_coop_per_student
    ON public.quest_acceptances (student_id)
    WHERE quest_type = 'coop' AND status IN ('active', 'enrolled');
CREATE UNIQUE INDEX idx_no_repeat_coop_per_student
    ON public.quest_acceptances (student_id, quest_id)
    WHERE quest_type = 'coop' AND status IN ('active', 'passed');

-- 6. Rewrite disband_quest: DELETE instead of UPDATE
CREATE OR REPLACE FUNCTION public.disband_quest(p_quest_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_quest record;
  v_student_id uuid;
  v_students_affected int := 0;
  v_instances_affected int := 0;
BEGIN
  IF NOT public.is_teacher(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_teacher');
  END IF;

  SELECT id, title INTO v_quest FROM public.quests WHERE id = p_quest_id;
  IF v_quest IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'quest_not_found');
  END IF;

  FOR v_student_id IN
    SELECT DISTINCT student_id FROM public.quest_acceptances
    WHERE quest_id = p_quest_id
      AND status IN ('active', 'enrolled', 'submitted')
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_student_id, 'quest_disbanded',
      'Quest disbanded',
      format('The quest "%s" was disbanded by the teacher. Your enrollment has been removed.', v_quest.title),
      jsonb_build_object('quest_id', p_quest_id)
    );
    v_students_affected := v_students_affected + 1;
  END LOOP;

  DELETE FROM public.quest_acceptances
  WHERE quest_id = p_quest_id
    AND status IN ('active', 'enrolled', 'submitted');

  WITH deleted AS (
    DELETE FROM public.coop_quest_instances
    WHERE quest_id = p_quest_id
      AND status IN ('active', 'submitted')
    RETURNING id
  )
  SELECT count(*) INTO v_instances_affected FROM deleted;

  RETURN jsonb_build_object(
    'ok', true,
    'students_affected', v_students_affected,
    'instances_affected', v_instances_affected
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.disband_quest(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.disband_quest(uuid) TO authenticated;

-- 7. Rewrite disband_coop_instance: DELETE instead of UPDATE
CREATE OR REPLACE FUNCTION public.disband_coop_instance(p_instance_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_instance record;
  v_quest_title text;
  v_member record;
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

  FOR v_member IN
    SELECT student_id FROM public.quest_acceptances
    WHERE instance_id = p_instance_id AND status = 'active'
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_member.student_id,
      'quest_disbanded',
      'Team disbanded',
      format('Your team for "%s" was disbanded by the teacher. You have been removed from the quest.', v_quest_title),
      jsonb_build_object('instance_id', p_instance_id)
    );
    v_members_released := v_members_released + 1;
  END LOOP;

  -- DELETE the instance; cascades to member acceptances + their submissions.
  DELETE FROM public.coop_quest_instances WHERE id = p_instance_id;

  RETURN jsonb_build_object('ok', true, 'members_released', v_members_released);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.disband_coop_instance(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.disband_coop_instance(uuid) TO authenticated;
