-- Migration 043: Harden bucket SELECT policy + trigger function.

-- The avatars bucket is public (anyone can fetch by URL via the
-- /storage/v1/object/public/... endpoint), so we don't need a broad
-- SELECT policy on storage.objects — that just lets clients list
-- every avatar. Drop it.
drop policy if exists "avatars_public_read" on storage.objects;

-- sync_profile_email is only called by an auth.users trigger, never
-- by clients. Revoke REST EXECUTE so it can't be invoked via
-- /rest/v1/rpc/.
revoke execute on function public.sync_profile_email() from anon, authenticated, public;
