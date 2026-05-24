# Hosting Setup

How to take RankedLearning from local dev to a live URL at `rankedlearning.com`.

**Architecture:** domain at Cloudflare → DNS at Cloudflare (DNS-only mode) → app hosted on Vercel → API on Supabase. All free tier except the ~$10/yr domain.

```
rankedlearning.com  (Cloudflare Registrar, ~$10/yr)
        │
        ▼
  Cloudflare DNS  (free, grey cloud / DNS-only — NOT proxied)
        │
        ▼
      Vercel  (free hobby tier; serves the Next.js app)
        │
        ▼
     Supabase  (already configured; project id dicufymnejhrkrakgluu)
```

---

## 1. One-time Vercel project setup

1. Sign in at [vercel.com](https://vercel.com) → **Add New → Project**.
2. **Import Git Repository** → pick `su3luq/ranked-learning`.
3. **Framework Preset:** Next.js (autodetected). Leave build command + output dir at defaults.
4. **Root directory:** leave blank (repo root).
5. Don't click Deploy yet — set environment variables first.

## 2. Environment variables (Vercel → Project Settings → Environment Variables)

Add these for **all three environments** (Production, Preview, Development):

| Name | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://dicufymnejhrkrakgluu.supabase.co` | Same as local `.env`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key from Supabase dashboard → Settings → API | Same as local `.env`. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Same value as in local `.env` | Browser bundles this — it's intentionally public. |

**Do NOT add:**
- `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET` — these are Supabase Edge Function secrets, **not Vercel env vars**. They live in Supabase dashboard → Edge Functions → Secrets. (See `docs/PUSH_SETUP.md`.)
- `SUPABASE_SERVICE_ROLE_KEY` — never put this in Vercel; it bypasses RLS. The app never needs it.

After saving env vars, click **Deploy**. First build takes ~2 min. You'll get a temporary URL like `ranked-learning-abc123.vercel.app`.

## 3. Verify the temporary URL

Before wiring the custom domain:

- [ ] Open the `*.vercel.app` URL → login page loads
- [ ] Sign in with your teacher account → home page loads
- [ ] Open browser DevTools → no console errors
- [ ] Click "Enable notifications" → permission prompt appears

If any of these fail, fix before continuing — DNS setup won't help.

## 4. Add the custom domain in Vercel

1. Vercel project → **Settings → Domains** → **Add**.
2. Enter `rankedlearning.com`. Click **Add**.
3. Vercel will say "Invalid Configuration" and show DNS records to add. Note the values it gives you. Typically:
   - `A` record at `@` → `76.76.21.21` (Vercel's anycast IP)
   - `CNAME` at `www` → `cname.vercel-dns.com`
4. Click **Add** again for `www.rankedlearning.com` so both work.
5. Optionally choose which version is canonical (apex `rankedlearning.com` recommended; `www` redirects to it).

Leave the Domains page open — you'll come back here to click "Refresh" once DNS is set.

## 5. Set Cloudflare DNS records

1. Cloudflare dashboard → **rankedlearning.com** → **DNS → Records**.
2. **Delete any pre-existing records pointing elsewhere** (Cloudflare adds parking records on registration).
3. Add the records Vercel told you about:

| Type | Name | Content | Proxy status |
|---|---|---|---|
| `A` | `@` | `76.76.21.21` (or whatever Vercel showed) | **DNS only (grey cloud)** |
| `CNAME` | `www` | `cname.vercel-dns.com` | **DNS only (grey cloud)** |

**The grey-cloud / DNS-only setting matters.** Orange-cloud proxying through Cloudflare causes double-caching, SSL handshake issues, and breaks Vercel's preview deploys. You still get the DDoS protection Cloudflare gives at the DNS layer; you just don't proxy the HTTP traffic.

4. **SSL/TLS → Overview** → set encryption mode to **Full (strict)**. Vercel issues real Let's Encrypt certs, so strict mode is correct.

## 6. Verify

Wait 1–5 min for DNS propagation. Back in Vercel → Settings → Domains → click **Refresh**.

- [ ] `rankedlearning.com` shows green checkmark in Vercel.
- [ ] `https://rankedlearning.com` loads the app in the browser.
- [ ] SSL padlock is solid (no mixed-content warnings).
- [ ] `https://www.rankedlearning.com` redirects to the apex (or vice versa, whichever you set as canonical).

## 7. Post-launch smoke test

Same flow as section 3, now on the real domain:

- [ ] Login → home page → review session opens
- [ ] Subscribe to push notifications from the live URL
- [ ] Insert a test notification via Supabase SQL Editor → push fires within ~60s

If push fails, the most likely cause is that the subscription was created against the old `*.vercel.app` origin and isn't valid for `rankedlearning.com`. Re-click "Enable notifications" on the production domain.

---

## Operational notes

- **Preview deploys:** every PR auto-gets a preview URL like `ranked-learning-pr-42-su3luq.vercel.app`. These don't get the custom domain. Useful for testing before merge.
- **Production deploys:** every push to `main` rebuilds and replaces the live site within ~2 min. Roll back via Vercel dashboard → Deployments → "Promote to Production" on a past deployment.
- **Edge Function deploys:** `send-pushes` lives on Supabase, not Vercel. Redeploying the app doesn't redeploy the function. To update the function: `mcp__claude_ai_Supabase__deploy_edge_function` or `supabase functions deploy send-pushes`.
- **Cron jobs:** `pg_cron` runs inside the Supabase Postgres instance, independent of Vercel. Already configured (`send-pushes`, `matchmaking`, `recompute_learning_velocity`).
- **Logs:** Vercel → Project → Logs (function runtimes + middleware). Supabase → Logs Explorer (Postgres + Edge Functions). The two are separate; tail both during incidents.

## Cost ceiling

Current expected monthly cost: **$0** (only $10/yr for the domain).

Approximate ceilings before you'd jump to paid tiers:

| Vendor | Free tier ceiling | What pushes you over |
|---|---|---|
| Vercel | 100 GB bandwidth/mo, 100 GB-hours of function execution | ~10 k page-loads × 500 students per month is well under |
| Supabase | 500 MB database, 1 GB file storage, 2 GB egress, 50 MAUs ⚠️ | The 50 MAU limit applies to free-tier auth users — **for 500 students you'll need Supabase Pro ($25/mo)**. This is the only realistic paid line in v1. |
| Cloudflare | unlimited DNS, free SSL, generous DDoS | Hard to hit on a normal app |

So realistic v1 cost once you have actual students: **$10/yr domain + $25/mo Supabase Pro** = ~$310/yr. Flag this when ramping student count past ~40.

## Gotchas

- Don't proxy Vercel through Cloudflare's orange cloud — DNS-only.
- Don't add `SUPABASE_SERVICE_ROLE_KEY` to Vercel.
- After the first deploy, **regenerate VAPID keys** if you exposed the private key by mistake anywhere (commit history, screenshots, Slack). VAPID keys rotation invalidates every existing subscription.
- Browser push subscriptions are origin-scoped. A subscription created on `localhost:3000` doesn't work for `rankedlearning.com` — students will see one prompt per origin they use the app from.
