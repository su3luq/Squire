// supabase/functions/send-pushes/index.ts
//
// Drains the notifications table by sending Web Push to every push_tokens
// row belonging to each user_id. Invoked by pg_cron every minute via
// net.http_post — never directly user-facing.
//
// Auth: a shared header `x-cron-secret`. The same value must be set as a
// Postgres setting (app.settings.cron_secret) and as this function's
// secret (CRON_SECRET). See docs/PUSH_SETUP.md.
//
// Notifications skipped (NOT marked pushed_at) when:
//   - the user is in quiet hours (Saigon-local), and
//   - the notification was inserted with override_quiet_hours = false.
// They'll be picked up again on the next tick after quiet hours end.
//
// Subscriptions deleted when the push service returns 404 or 410 —
// browser cleared site data, user denied permission, or the endpoint
// expired.

// @ts-expect-error Deno-only npm specifier; Deno provides the types at runtime.
import webpush from 'npm:web-push@3.6.7';
// @ts-expect-error Deno-only npm specifier.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

// Deno globals are not in our tsconfig — declare what we use.
declare const Deno: {
  env: { get: (key: string) => string | undefined };
  serve: (handler: (req: Request) => Promise<Response> | Response) => void;
};

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT');
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
  console.error('Missing VAPID env vars');
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars');
}

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const SAIGON_TZ = 'Asia/Ho_Chi_Minh';

function currentSaigonHour(): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    timeZone: SAIGON_TZ,
  });
  // Some Intl implementations return "24" at midnight — normalise to 0.
  return Number.parseInt(fmt.format(new Date()), 10) % 24;
}

function isInQuietHours(start: number | null, end: number | null): boolean {
  if (start == null || end == null) return false;
  const h = currentSaigonHour();
  // Same-day window (e.g., 13–17): in if start <= h < end.
  // Wrap-around window (e.g., 22–6): in if h >= start OR h < end.
  return start <= end ? h >= start && h < end : h >= start || h < end;
}

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  override_quiet_hours: boolean;
};

function deriveDeepLink(): string {
  // Send everyone to the inbox. Middleware role-gates the destination.
  return '/notifications';
}

type PushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function statusCodeOf(err: any): number | null {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const sc = (err as { statusCode?: unknown }).statusCode;
    if (typeof sc === 'number') return sc;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: notifications, error: nErr } = await supabase
    .from('notifications')
    .select('id, user_id, type, title, body, data, override_quiet_hours')
    .is('pushed_at', null)
    .order('created_at', { ascending: true })
    .limit(100);

  if (nErr) {
    console.error('select notifications failed:', nErr);
    return new Response(JSON.stringify({ error: nErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let sent = 0;
  let skipped = 0;
  let deleted = 0;
  let marked = 0;

  for (const n of (notifications ?? []) as NotificationRow[]) {
    // Quiet hours gate
    if (!n.override_quiet_hours) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('quiet_hours_start_hour, quiet_hours_end_hour')
        .eq('id', n.user_id)
        .single();
      if (
        profile &&
        isInQuietHours(profile.quiet_hours_start_hour, profile.quiet_hours_end_hour)
      ) {
        skipped++;
        continue; // Leave pushed_at NULL — retry next tick after hours end
      }
    }

    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', n.user_id);

    const payload = JSON.stringify({
      title: n.title,
      body: n.body,
      type: n.type,
      data: { ...(n.data ?? {}), url: deriveDeepLink(), notification_id: n.id },
      tag: n.type,
    });

    for (const t of (tokens ?? []) as PushSubscription[]) {
      try {
        await webpush.sendNotification(
          { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
          payload,
          { TTL: 60 * 60 * 24 } // 24h
        );
        sent++;
      } catch (err) {
        const code = statusCodeOf(err);
        if (code === 404 || code === 410) {
          // Subscription is gone — drop it. The user will be prompted to
          // re-subscribe next time they hit the home page.
          await supabase.from('push_tokens').delete().eq('id', t.id);
          deleted++;
        } else {
          console.error('push failed for', t.endpoint, code, err);
        }
      }
    }

    // Mark sent regardless of whether any tokens existed — no point
    // retrying a notification for a user who has no subscriptions.
    const { error: updErr } = await supabase
      .from('notifications')
      .update({ pushed_at: new Date().toISOString() })
      .eq('id', n.id);
    if (updErr) {
      console.error('mark pushed failed for', n.id, updErr);
    } else {
      marked++;
    }
  }

  return new Response(JSON.stringify({ sent, skipped, deleted, marked }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
