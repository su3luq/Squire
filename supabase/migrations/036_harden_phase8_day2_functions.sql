-- Migration 036: Harden Phase 8 day 2 functions

-- a) Add explicit search_path on the touch trigger function.
alter function public.coop_member_drafts_touch() set search_path = public;

-- b) Revoke REST-exposed execute on the seed trigger function. The
--    BEFORE/AFTER trigger keeps firing because Postgres triggers don't
--    honor the function's EXECUTE grants. Direct /rest/v1/rpc calls
--    fail with a permission error.
revoke execute on function public.coop_member_drafts_seed() from anon, authenticated, public;
