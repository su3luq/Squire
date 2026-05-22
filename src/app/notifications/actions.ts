'use server';

import { createClient } from '@/lib/supabase/server';

type SubscriptionPayload = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function detectPlatform(userAgent: string): 'ios' | 'android' | 'web' {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'web';
}

/**
 * Persist (or refresh) a Web Push subscription for the current user.
 *
 * The browser may produce the same endpoint on re-subscribe (in which case
 * we touch last_used_at) or a brand-new endpoint (e.g., after the user
 * cleared site data). We upsert on endpoint to handle both cases.
 */
export async function saveSubscription(
  sub: SubscriptionPayload,
  userAgent: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!sub.endpoint || !sub.p256dh || !sub.auth) {
    return { ok: false, error: 'incomplete_subscription' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_authenticated' };

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        platform: detectPlatform(userAgent),
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Remove a subscription. Called when the user clicks "Disable" or when the
 * browser reports the subscription was revoked.
 */
export async function removeSubscription(
  endpoint: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!endpoint) return { ok: false, error: 'no_endpoint' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_authenticated' };

  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
