-- Migration 023: Class management overhaul.
--
-- Behavior changes:
--   * Registration is now per-class. Each class has its own
--     `registration_open` boolean. The global toggle is gone.
--   * `invite_code` is deprecated and dropped — students pick their class
--     from a dropdown at /register.
--   * Teachers can transfer a student between classes
--     (transfer_student RPC) and hard-delete a student
--     (delete_student RPC; cascades through auth.users → profiles → all
--     child rows).
--
-- Applied via Supabase MCP. This file is the source-of-truth audit copy.

-- 1. Per-class registration toggle
ALTER TABLE public.classes
  ADD COLUMN registration_open boolean NOT NULL DEFAULT false;
UPDATE public.classes SET registration_open = true WHERE archived_at IS NULL;

-- 2. Drop deprecated invite_code
ALTER TABLE public.classes DROP COLUMN invite_code;

-- 3. Drop global registration toggle
DELETE FROM public.app_settings WHERE key = 'registration_open';
DROP FUNCTION IF EXISTS public.is_registration_open();
DROP FUNCTION IF EXISTS public.lookup_class_by_invite(text);

-- 4. Rewrite get_registration_state (per-class only)
CREATE OR REPLACE FUNCTION public.get_registration_state()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_classes jsonb;
BEGIN
  SELECT coalesce(
    jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY name),
    '[]'::jsonb
  ) INTO v_classes
  FROM public.classes
  WHERE archived_at IS NULL AND registration_open = true;
  RETURN jsonb_build_object('classes', v_classes);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_registration_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_registration_state() TO anon, authenticated;

-- 5. Rewrite register_student (no global gate)
CREATE OR REPLACE FUNCTION public.register_student(
  p_user_id uuid, p_full_name text, p_age integer, p_email text, p_class_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_class record;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot register on behalf of another user.');
  END IF;

  SELECT id, registration_open, archived_at INTO v_class
  FROM public.classes WHERE id = p_class_id;

  IF v_class IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Class not found.');
  END IF;
  IF v_class.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Class is archived.');
  END IF;
  IF NOT v_class.registration_open THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This class is not accepting new students.');
  END IF;

  INSERT INTO public.profiles (id, role, full_name, age, email, class_id)
  VALUES (p_user_id, 'student', p_full_name, p_age, p_email, p_class_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 6. transfer_student
CREATE OR REPLACE FUNCTION public.transfer_student(p_student_id uuid, p_to_class_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_student record; v_class record;
BEGIN
  IF NOT public.is_teacher(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized.');
  END IF;

  SELECT id, role INTO v_student FROM public.profiles WHERE id = p_student_id;
  IF v_student IS NULL OR v_student.role <> 'student' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Student not found.');
  END IF;

  SELECT id, archived_at INTO v_class FROM public.classes WHERE id = p_to_class_id;
  IF v_class IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Target class not found.');
  END IF;
  IF v_class.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Target class is archived.');
  END IF;

  UPDATE public.profiles SET class_id = p_to_class_id WHERE id = p_student_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.transfer_student(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_student(uuid, uuid) TO authenticated;

-- 7. delete_student — hard delete (cascades through auth.users → profiles → children)
CREATE OR REPLACE FUNCTION public.delete_student(p_student_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE v_student record;
BEGIN
  IF NOT public.is_teacher(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized.');
  END IF;

  SELECT id, role INTO v_student FROM public.profiles WHERE id = p_student_id;
  IF v_student IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Student not found.');
  END IF;
  IF v_student.role <> 'student' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot delete teacher accounts via this RPC.');
  END IF;

  DELETE FROM auth.users WHERE id = p_student_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_student(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_student(uuid) TO authenticated;
