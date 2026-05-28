-- Migration 047: Drop unused avatar storage policies. Avatars are now
-- stored as base64 data URLs in profiles.avatar_url because this
-- project's storage-api consistently rejected authenticated uploads
-- even with maximally permissive RLS (see migrations 041-046 for the
-- failed attempts; Postgres-level INSERT simulations all passed, so
-- the rejection lives inside Supabase storage-api itself and is out
-- of reach from the application).
--
-- Note: the avatars bucket row and the one test image uploaded via
-- the Supabase dashboard are left in place. The storage.protect_delete
-- trigger refuses direct DELETEs on storage.objects, and these objects
-- are harmless. Drop them from the Supabase dashboard if cleanup is
-- desired.
drop policy if exists "avatars_anyone_insert" on storage.objects;
drop policy if exists "avatars_owner_update" on storage.objects;
drop policy if exists "avatars_owner_delete" on storage.objects;
drop policy if exists "buckets_authenticated_read" on storage.buckets;
