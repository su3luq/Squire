-- Migration 027: disband_quest(p_quest_id) RPC.
--
-- Teacher-side "disband everything" — cancels all ongoing work on a quest:
--   - quest_acceptances with status IN ('active', 'enrolled', 'submitted')
--     → 'disbanded'
--   - coop_quest_instances with status IN ('active', 'submitted') → 'disbanded'
--   - one notification per affected student
--
-- Does NOT close the quest (closed_at stays as-is) — teacher pairs disband
-- with Close when they want a total stop. Already-passed and already-failed
-- history is preserved.

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
      format('The quest "%s" was disbanded by the teacher. Your work on it has been cancelled.', v_quest.title),
      jsonb_build_object('quest_id', p_quest_id)
    );
    v_students_affected := v_students_affected + 1;
  END LOOP;

  UPDATE public.quest_acceptances
  SET status = 'disbanded'
  WHERE quest_id = p_quest_id
    AND status IN ('active', 'enrolled', 'submitted');

  WITH updated AS (
    UPDATE public.coop_quest_instances
    SET status = 'disbanded'
    WHERE quest_id = p_quest_id
      AND status IN ('active', 'submitted')
    RETURNING id
  )
  SELECT count(*) INTO v_instances_affected FROM updated;

  RETURN jsonb_build_object(
    'ok', true,
    'students_affected', v_students_affected,
    'instances_affected', v_instances_affected
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.disband_quest(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.disband_quest(uuid) TO authenticated;
