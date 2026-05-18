-- Migration 013: admin_create_teacher() — gotcha-free teacher seeding function.
--
-- Closes the v1 gap of "how do we create a teacher account safely?"
-- Direct INSERT into auth.users hits a GoTrue row-scan crash because eight
-- NOT-NULL-string columns (confirmation_token, recovery_token, etc.) crash
-- when left NULL. This function sets all of them to '' explicitly.
--
-- Applied via Supabase MCP. This file is the source-of-truth audit copy.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_create_teacher(
  p_email text,
  p_password text,
  p_full_name text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
  v_full_name text := trim(p_full_name);
BEGIN
  -- Input validation
  IF v_email = '' OR v_email NOT LIKE '%_@_%._%' THEN
    RAISE EXCEPTION 'Invalid email address';
  END IF;
  IF v_full_name = '' THEN
    RAISE EXCEPTION 'Full name cannot be empty';
  END IF;
  IF length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    RAISE EXCEPTION 'User with email % already exists', v_email;
  END IF;

  -- auth.users — every NOT-NULL-string GoTrue column set explicitly to ''
  -- pgcrypto lives in the extensions schema, so crypt/gen_salt are
  -- schema-qualified here (function's search_path covers public, auth).
  -- Bcrypt cost factor 10 matches GoTrue signup default; mixed costs across
  -- the user table leak admin-vs-user signal to attackers.
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user, is_anonymous,
    confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated', 'authenticated',
    v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(),
    false, false,
    '', '',          -- confirmation_token, recovery_token
    '', '', '',      -- email_change_token_new, email_change, email_change_token_current
    '', '', ''       -- phone_change, phone_change_token, reauthentication_token
  );

  -- auth.identities — the row GoTrue uses for email-provider lookup
  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id::text,
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(), now(), now()
  );

  -- public.profiles with role=teacher
  INSERT INTO public.profiles (id, role, full_name, email)
  VALUES (v_user_id, 'teacher'::user_role, v_full_name, v_email);

  RETURN v_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_teacher(text, text, text)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.admin_create_teacher(text, text, text) IS
'Creates a teacher account end-to-end: auth.users + auth.identities + public.profiles. Handles all GoTrue NOT-NULL-string column gotchas (the eight token columns that crash row-scan when NULL). Bcrypt cost 10 to match GoTrue signup default — mixed costs leak admin-vs-user signal. Uses extensions.crypt() and extensions.gen_salt() with explicit schema qualification (pgcrypto lives in extensions schema, not public). Bypasses RLS via SECURITY DEFINER. EXECUTE revoked from all roles — only callable as service role via Supabase MCP. Single-purpose by design (teacher only). Student seeding has its own flow; do not generalize this function. PASSWORD-IN-LOGS WARNING: the p_password argument transits through Postgres query logs. Use a throwaway bootstrap password and rotate immediately via the Supabase dashboard after first login. GOTRUE-COUPLING NOTE: this function is shape-coupled to GoTrue v2.x auth.users. If Supabase major-version-bumps Auth, verify the column list (especially the eight token columns) is still complete.';

COMMIT;
