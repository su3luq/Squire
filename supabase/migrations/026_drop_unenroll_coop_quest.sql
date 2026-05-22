-- Migration 026: Drop unenroll_coop_quest.
--
-- Product decision: students cannot back out of a coop enrollment.
-- They commit when they enroll; the only ways out are (a) the teacher
-- disbands the team after matchmaking, or (b) matchmaking cancels the
-- quest in their class.
--
-- Removing the RPC ensures a student can't bypass the missing UI by
-- crafting a direct supabase.rpc call.
--
-- Applied via Supabase MCP. This file is the source-of-truth audit copy.

DROP FUNCTION IF EXISTS public.unenroll_coop_quest(uuid);
