-- Migration 010: Drop username/display_name shim. Email becomes the auth identity.
--
-- Changes:
--   1. Drops is_username_available() (no longer relevant).
--   2. Drops the old register_student(uuid, text, text, text, int, text, uuid) signature.
--   3. Drops the public_profiles view (depends on columns we remove).
--   4. ALTER TABLE profiles: DROP username, DROP display_name, full_name NOT NULL, email NOT NULL.
--   5. Recreates public_profiles view with full_name as the public display field (no username/display_name).
--   6. Recreates register_student(uuid, text, int, text, uuid) with the simplified signature.
--
-- Applied via Supabase MCP. This file is the source-of-truth audit copy.

BEGIN;

-- 1. Drop functions tied to the old model
DROP FUNCTION IF EXISTS public.is_username_available(text);
DROP FUNCTION IF EXISTS public.register_student(uuid, text, text, text, int, text, uuid);

-- 2. Drop the security-barrier view (depends on columns we're dropping)
DROP VIEW IF EXISTS public.public_profiles;

-- 3. Schema changes on profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS username;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS display_name;
ALTER TABLE public.profiles ALTER COLUMN full_name SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN email SET NOT NULL;

-- 4. Recreate public_profiles view with full_name as the public display field
CREATE VIEW public.public_profiles
WITH (security_barrier = true)
AS
SELECT
    p.id,
    p.role,
    p.full_name,
    p.avatar_url,
    p.age,
    p.class_id,
    p.interest_tags,
    p.xp_total,
    p.current_rank,
    p.learning_velocity,
    p.created_at
FROM public.profiles p
WHERE
    public.is_teacher()
    OR p.id = auth.uid()
    OR p.role = 'student';

GRANT SELECT ON public.public_profiles TO authenticated;

COMMENT ON VIEW public.public_profiles IS
'Student-facing profile view. full_name is the public display field. Email is excluded (private; access via profiles for self + teacher only).';

-- 5. Recreate register_student with simplified signature
CREATE OR REPLACE FUNCTION public.register_student(
    p_user_id uuid,
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
    -- Defensive identity check: caller must be registering themselves.
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

    -- Insert profile (no username, no display_name)
    INSERT INTO public.profiles (
        id, role, full_name, age, email, class_id
    ) VALUES (
        p_user_id, 'student', p_full_name, p_age, p_email, p_class_id
    );

    RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_student(uuid, text, int, text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.register_student(uuid, text, int, text, uuid) FROM anon, PUBLIC;

COMMENT ON FUNCTION public.register_student(uuid, text, int, text, uuid) IS
'Atomically registers a student profile after auth.signUp(). Server-enforced gates: caller identity (auth.uid), registration_open, class exists.';

COMMIT;
