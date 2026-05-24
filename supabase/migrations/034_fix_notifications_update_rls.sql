-- Migration 034: fix broken RLS update CHECK on notifications.
--
-- The original notifications_user_update_own policy tried to forbid clients
-- from changing title/body/type by comparing them via self-referential scalar
-- subqueries. The subquery aliases collided
-- (`notifications_1.id = notifications_1.id` is always true), so the subquery
-- returned every row and every UPDATE failed — silently from the app's POV.
-- Symptom: "Mark all read" did nothing and the unread badge persisted.
--
-- Fix: simple owner-only policy + column-level GRANT restricting writes
-- to read_at. RLS in Postgres is row-level; column restrictions belong at
-- the GRANT layer.

DROP POLICY IF EXISTS notifications_user_update_own ON public.notifications;

CREATE POLICY notifications_user_update_own ON public.notifications
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
