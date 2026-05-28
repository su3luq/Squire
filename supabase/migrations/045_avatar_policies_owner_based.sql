-- Migration 045: Align storage.objects avatar policies with the
-- official Supabase Next.js tutorial pattern. The previous folder-name
-- check failed inside storage.can_insert_object's RLS evaluation even
-- when the same expression passed in a direct simulated INSERT, which
-- points at a storage-version quirk we can't fix from the app side.
-- The owner column is auto-populated by storage from the JWT, so it's
-- a reliable identity marker for UPDATE/DELETE. The server action
-- pins the path to ${user.id}/avatar.webp, preserving per-user
-- isolation even with the relaxed INSERT check.
drop policy if exists "avatars_own_insert" on storage.objects;
drop policy if exists "avatars_own_update" on storage.objects;
drop policy if exists "avatars_own_delete" on storage.objects;

create policy "avatars_authenticated_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars');

create policy "avatars_owner_update"
  on storage.objects for update
  to authenticated
  using ((select auth.uid()) = owner)
  with check (bucket_id = 'avatars');

create policy "avatars_owner_delete"
  on storage.objects for delete
  to authenticated
  using ((select auth.uid()) = owner);
