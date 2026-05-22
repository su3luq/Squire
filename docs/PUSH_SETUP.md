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

## 4. After Commit 3 ships

The `send-pushes` Edge Function reads `VAPID_PRIVATE_KEY` and
`VAPID_SUBJECT` to sign each push. A `pg_cron` job runs the function every
minute to drain `notifications` rows where `pushed_at IS NULL`.

## What happens if push services reject a subscription?

The Edge Function deletes the bad `push_tokens` row on 404/410 responses
(subscription expired or user denied/reset permissions). The next time the
user opens the app they'll see the "Enable notifications" button again.
