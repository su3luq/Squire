-- Migration 031: schedule the send-pushes Edge Function cron.
--
-- DO NOT APPLY UNTIL THE FOLLOWING ARE SET:
--   1. Postgres settings (run as superuser via Supabase SQL Editor):
--      ALTER DATABASE postgres SET app.settings.functions_url =
--          'https://dicufymnejhrkrakgluu.supabase.co/functions/v1';
--      ALTER DATABASE postgres SET app.settings.cron_secret =
--          '<any-random-uuid>';
--      Then `SELECT pg_reload_conf();` (or wait for the next session).
--
--   2. Edge Function secrets (Supabase dashboard → Edge Functions → secrets):
--      VAPID_PUBLIC_KEY  = (same as NEXT_PUBLIC_VAPID_PUBLIC_KEY)
--      VAPID_PRIVATE_KEY = (private half of the VAPID keypair)
--      VAPID_SUBJECT     = mailto:your-email@example.com
--      CRON_SECRET       = (same value as app.settings.cron_secret)
--
--   3. The send-pushes function has been deployed.
--
-- See docs/PUSH_SETUP.md for the full walkthrough.

SELECT cron.schedule(
    'send-pushes',
    '* * * * *',
    $cron$
    SELECT net.http_post(
        url := current_setting('app.settings.functions_url') || '/send-pushes',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', current_setting('app.settings.cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
    );
    $cron$
);
