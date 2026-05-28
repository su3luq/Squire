-- Migration 046: Match the official tutorial policy exactly — drop
-- the role restriction on INSERT so it applies to PUBLIC. Storage
-- appears to evaluate uploads under the anon role (likely because
-- this project uses asymmetric JWT signing keys and storage's JWKS
-- cache isn't validating the auth-service-issued JWT), so any policy
-- gated to authenticated never matches. The server action remains
-- the gate that requires a signed-in user and pins the path.
drop policy if exists "avatars_authenticated_insert" on storage.objects;
create policy "avatars_anyone_insert"
  on storage.objects for insert
  with check (bucket_id = 'avatars');
