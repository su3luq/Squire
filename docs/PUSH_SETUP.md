# Web Push setup (Phase 6)

One-time configuration needed before push notifications work in any environment.

## 1. Generate VAPID keys

VAPID (Voluntary Application Server Identification) is the mechanism browsers
use to verify that pushes are coming from a legitimate server. You need a
keypair: the **public** half is bundled to the client; the **private** half
signs each push request and must never leave the server.

```bash
npx web-push generate-vapid-keys
```

This prints two base64-url-encoded strings:

```
Public Key:
BG9...   (87 chars)

Private Key:
6tw...   (43 chars)
```

Keys are stable — generate once, then reuse forever. Regenerating them
invalidates every existing subscription (subscribers would need to re-subscribe).

## 2. Place the keys in env vars

| Variable | Value | Where |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public key | `.env` (local) + Vercel project env vars |
| `VAPID_PRIVATE_KEY` | Private key | Supabase Edge Function secrets only |
| `VAPID_SUBJECT` | `mailto:your-email@example.com` | Supabase Edge Function secrets only |

**The `NEXT_PUBLIC_` prefix is intentional** for the public key — it must be
exposed to the browser bundle so the client can pass it to
`pushManager.subscribe`. The private key has no `NEXT_PUBLIC_` prefix because
it must never be bundled to the client.

`VAPID_SUBJECT` is a contact URL (mailto: or https:) that push services
require so they can reach you about abuse. Use your real teacher email.

### Local

Add to `.env` (gitignored):

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BG9...
```

The private key only needs to be set when developing the Edge Function locally
via `supabase functions serve` (see below).

### Production

In Vercel → Project Settings → Environment Variables, add
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` for all environments.

For the Supabase Edge Function:

```bash
supabase secrets set VAPID_PRIVATE_KEY="6tw..." VAPID_SUBJECT="mailto:you@example.com"
```

Secrets set this way are available to deployed Edge Functions only — they're
not bundled to the client and not committed to the repo.

## 3. After Commit 2 ships

The "Enable notifications" button on the student/teacher home pages calls
`pushManager.subscribe()` with `applicationServerKey` set to the public key.
If the public key is missing the button will show an error.

## 4. Activate delivery (after commit 3 ships)

The Edge Function and the cron schedule both live in the repo but neither
is live until you do four things, in order:

### 4a. Pick a CRON_SECRET

Any random string. A UUID is fine:

```bash
# any way of generating a random opaque string
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

This value must match exactly in two places: a Postgres setting *and* an
Edge Function secret. The function checks it on every invocation.

### 4b. Store the secret in Supabase Vault

On hosted Supabase the `postgres` role isn't the cluster superuser, so
`ALTER DATABASE postgres SET …` is denied even via the SQL Editor.
Supabase Vault is the supported pattern for cron-readable secrets.

Run this once via the SQL Editor:

```sql
SELECT vault.create_secret(
    '<paste the value from 4a>',
    'cron_secret',
    'Shared secret for send-pushes cron -> Edge Function'
);
```

The value is encrypted at rest. The cron job reads it back via
`SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'`.

The Edge Function URL is public and hardcoded in migration 031, so it
doesn't need to be stored anywhere.

### 4c. Set the Edge Function secrets

Supabase dashboard → Edge Functions → `send-pushes` → Secrets (or via CLI
`supabase secrets set …`):

```
VAPID_PUBLIC_KEY  = (same as NEXT_PUBLIC_VAPID_PUBLIC_KEY)
VAPID_PRIVATE_KEY = (private half of the VAPID keypair from step 1)
VAPID_SUBJECT     = mailto:your-email@example.com
CRON_SECRET       = (same value you put in vault.secrets)
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically
by Supabase — you don't set those yourself.

### 4d. Deploy the function + apply migration 031

The function source lives at `supabase/functions/send-pushes/index.ts`.
Deploy via the Supabase CLI (`supabase functions deploy send-pushes`) or
via the Supabase MCP (`mcp__claude_ai_Supabase__deploy_edge_function`).

Then apply migration 031 to schedule the cron job:

```
supabase/migrations/031_schedule_send_pushes.sql
```

After this lands, the cron tick logs (Supabase dashboard → Postgres → Cron
Jobs) should show one successful run per minute, even if there's nothing
to push.

### 4e. Test it

Insert a notification by hand and watch it deliver:

```sql
INSERT INTO public.notifications (user_id, type, title, body)
VALUES (auth.uid(), 'test', 'RankedLearning test', 'Hello from the cron.');
```

(Run while logged in via the Supabase SQL Editor — `auth.uid()` returns
your own teacher id there. Replace with a specific user_id if needed.)

Within ~60 seconds you should see a browser notification appear AND
`pushed_at` populate on the row.

## What happens if push services reject a subscription?

The Edge Function deletes the bad `push_tokens` row on 404/410 responses
(subscription expired or user denied/reset permissions). The next time the
user opens the app they'll see the "Enable notifications" button again.
