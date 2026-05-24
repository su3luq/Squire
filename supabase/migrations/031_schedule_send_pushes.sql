-- Migration 031: schedule the send-pushes Edge Function cron.
--
-- Prerequisites (one-time, see docs/PUSH_SETUP.md):
--   1. Edge Function secrets set in the Supabase dashboard:
--        VAPID_PUBLIC_KEY  = (same as NEXT_PUBLIC_VAPID_PUBLIC_KEY)
--        VAPID_PRIVATE_KEY = (private half of the VAPID keypair)
--        VAPID_SUBJECT     = mailto:your-email@example.com
--        CRON_SECRET       = (random opaque string; must match the
--                             value stored in vault.secrets below)
--
--   2. The send-pushes function has been deployed.
--
--   3. A row exists in vault.secrets named 'cron_secret', holding the
--      same string as the CRON_SECRET function secret. Created via:
--        SELECT vault.create_secret(
--            '<the secret>',
--            'cron_secret',
--            'Shared secret for send-pushes cron -> Edge Function'
--        );
--
-- Why Vault and not `app.settings.*`? On hosted Supabase the `postgres`
-- role isn't the cluster superuser, so `ALTER DATABASE postgres SET ...`
-- is denied. Vault is the supported pattern for cron-readable secrets.
-- The function URL itself is public, so it's safe to hardcode here.

SELECT cron.schedule(
    'send-pushes',
    '* * * * *',
    $cron$
    SELECT net.http_post(
        url := 'https://dicufymnejhrkrakgluu.supabase.co/functions/v1/send-pushes',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (
                SELECT decrypted_secret
                FROM vault.decrypted_secrets
                WHERE name = 'cron_secret'
                LIMIT 1
            )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
    );
    $cron$
);
