-- Migration 009: Registration toggle and registration helper functions.
--
-- Adds:
--   1. app_settings table (global key-value store)
--   2. Seed row: registration_open = false
--   3. is_registration_open() helper (anon-callable)
--   4. get_registration_state() RPC (anon-callable, returns {open, classes})
--   5. register_student() RPC (authenticated-callable, gated profile insert)
--
-- Applied via Supabase MCP. This file is the source-of-truth audit copy.

BEGIN;

-- ============================================================================
-- PART 1: app_settings TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text UNIQUE NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_settings_read_authenticated ON public.app_settings
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY app_settings_teacher_insert ON public.app_settings
    FOR INSERT TO authenticated
    WITH CHECK (public.is_teacher());

CREATE POLICY app_settings_teacher_update ON public.app_settings
    FOR UPDATE TO authenticated
    USING (public.is_teacher())
    WITH CHECK (public.is_teacher());

CREATE POLICY app_settings_teacher_delete ON public.app_settings
    FOR DELETE TO authenticated
    USING (public.is_teacher());

CREATE TRIGGER trg_app_settings_updated_at
    BEFORE UPDATE ON public.app_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.app_settings IS
'Global key-value settings. Read by all authenticated users; write by teachers only via RLS.';

-- Seed the registration_open setting as false (registration closed by default).
INSERT INTO public.app_settings (key, value)
VALUES ('registration_open', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- PART 2: is_registration_open() HELPER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_registration_open()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT (value::text)::boolean FROM public.app_settings WHERE key = 'registration_open' LIMIT 1),
        false
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_registration_open() TO anon, authenticated;

COMMENT ON FUNCTION public.is_registration_open() IS
'Returns whether self-registration is currently enabled. Anon-callable; used by the registration page pre-auth.';

-- ============================================================================
-- PART 3: get_registration_state() — combined state for the registration page
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_registration_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    is_open boolean;
    cls jsonb;
BEGIN
    is_open := public.is_registration_open();

    IF NOT is_open THEN
        RETURN jsonb_build_object('open', false, 'classes', '[]'::jsonb);
    END IF;

    SELECT COALESCE(
        jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY name),
        '[]'::jsonb
    )
    INTO cls
    FROM public.classes
    WHERE archived_at IS NULL;

    RETURN jsonb_build_object('open', true, 'classes', cls);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_registration_state() TO anon, authenticated;

COMMENT ON FUNCTION public.get_registration_state() IS
'Returns {open: bool, classes: [{id,name}]} for the registration page. Anon-callable. When closed, classes is empty.';

-- ============================================================================
-- PART 4: register_student() — gated atomic registration RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.register_student(
    p_user_id uuid,
    p_username text,
    p_display_name text,
    p_full_name text,
    p_age int,
    p_email text,
    p_class_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    class_exists boolean;
BEGIN
    -- Defensive check: caller must be registering themselves.
    -- SECURITY DEFINER bypasses RLS; without this, any authenticated user could
    -- create a profile row for any auth.users id.
    IF p_user_id IS DISTINCT FROM auth.uid() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Cannot register on behalf of another user.');
    END IF;

    -- Gate 1: registration must be open
    IF NOT public.is_registration_open() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Registration is currently closed.');
    END IF;

    -- Gate 2: class must exist and not be archived
    SELECT EXISTS (
        SELECT 1 FROM public.classes
        WHERE id = p_class_id AND archived_at IS NULL
    ) INTO class_exists;

    IF NOT class_exists THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Class not found.');
    END IF;

    -- Gate 3: username must be available
    IF NOT public.is_username_available(p_username) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Username is already taken.');
    END IF;

    -- All gates passed; insert the profile row.
    -- SECURITY DEFINER means this bypasses RLS — the gates above ARE the policy.
    INSERT INTO public.profiles (
        id, role, username, display_name, full_name, age, email, class_id
    ) VALUES (
        p_user_id, 'student', lower(p_username), p_display_name, p_full_name, p_age, p_email, p_class_id
    );

    RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_student(uuid, text, text, text, int, text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.register_student(uuid, text, text, text, int, text, uuid) FROM anon, PUBLIC;

COMMENT ON FUNCTION public.register_student(uuid, text, text, text, int, text, uuid) IS
'Atomically registers a student profile after auth.signUp(). Server-enforced gates: caller identity (auth.uid), registration_open, class exists, username available. SECURITY DEFINER bypasses RLS for the profile insert; the function''s own checks are the gate.';

COMMIT;
