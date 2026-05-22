-- Migration 030: Web Push schema — push_tokens columns + quiet hours
--
-- Phase 6 (Web Push) foundation. Three things in one bundle:
--
--   1. Repurpose push_tokens from the abandoned Expo-native shape to
--      real Web Push subscriptions. The table is empty so the destructive
--      column drop is safe; no data migration needed.
--      Web Push subscriptions are { endpoint, keys: { p256dh, auth } }.
--      The endpoint is the unique subscription identity (per Push
--      Service URL) — enforce with a unique index.
--
--   2. Quiet hours on profiles. Two nullable smallint columns
--      (Saigon-local 0–23). NULL means no quiet hours. Stored as
--      hours of day rather than a time/interval because the delivery
--      cron only ever needs to compare "is the current hour inside the
--      range." Keeps the cron query trivial.
--
--   3. Replace the legacy RLS policies on push_tokens (which referenced
--      expo_push_token semantics) with owner-manages-own + teacher-reads-all.
--
--   4. Partial index on notifications.pushed_at IS NULL so the delivery
--      cron can find the work fast.

-- 1. push_tokens → web-push columns
ALTER TABLE public.push_tokens
    DROP COLUMN expo_push_token,
    ADD COLUMN endpoint text NOT NULL,
    ADD COLUMN p256dh text NOT NULL,
    ADD COLUMN auth text NOT NULL;

CREATE UNIQUE INDEX push_tokens_endpoint_key
    ON public.push_tokens (endpoint);

CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx
    ON public.push_tokens (user_id);

-- 2. Quiet hours on profiles (Saigon-local; NULL = no quiet hours)
ALTER TABLE public.profiles
    ADD COLUMN quiet_hours_start_hour smallint
        CHECK (quiet_hours_start_hour BETWEEN 0 AND 23),
    ADD COLUMN quiet_hours_end_hour smallint
        CHECK (quiet_hours_end_hour BETWEEN 0 AND 23);

-- 3. RLS — replace the legacy policies on push_tokens with owner/teacher.
DROP POLICY IF EXISTS push_tokens_owner_all ON public.push_tokens;
DROP POLICY IF EXISTS push_tokens_teacher_read ON public.push_tokens;

CREATE POLICY push_tokens_owner_all
    ON public.push_tokens
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY push_tokens_teacher_read
    ON public.push_tokens
    FOR SELECT
    TO authenticated
    USING (public.is_teacher());

-- 4. Index for the delivery cron — "find unpushed notifications fast".
CREATE INDEX IF NOT EXISTS notifications_unpushed_idx
    ON public.notifications (created_at)
    WHERE pushed_at IS NULL;
