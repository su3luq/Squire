-- Migration 044: Allow authenticated users to read storage.buckets.
-- The storage service queries storage.buckets while handling uploads;
-- with no SELECT policy on this table, the lookup returns zero rows
-- under the authenticated role and the upload is rejected. The error
-- surfaces on storage.objects as "new row violates row-level security
-- policy" but the real cause is bucket invisibility.
create policy "buckets_authenticated_read"
  on storage.buckets for select
  to authenticated
  using (true);
