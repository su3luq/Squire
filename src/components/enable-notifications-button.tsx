'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { saveSubscription, removeSubscription } from '@/app/notifications/actions';

type State =
  | 'loading'
  | 'unsupported'
  | 'denied'
  | 'idle' // supported, not yet subscribed
  | 'subscribed'
  | 'working';

/**
 * Convert a base64url-encoded VAPID public key (the one printed by
 * `npx web-push generate-vapid-keys`) to the ArrayBuffer shape that
 * pushManager.subscribe expects. Backing buffer is a fresh ArrayBuffer
 * (not SharedArrayBuffer) to satisfy strict TS lib types.
 */
function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

function isIOSSafariNotStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  if (!isIOS) return false;
  // The standalone flag is non-standard but iOS Safari sets it when launched
  // from a home-screen icon.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone !== true;
}

export function EnableNotificationsButton() {
  const [state, setState] = useState<State>('loading');
  const [error, setError] = useState<string | null>(null);
  const [needsA2HS, setNeedsA2HS] = useState(false);

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  // Probe support + existing subscription on mount.
  useEffect(() => {
    let cancelled = false;

    async function probe() {
      if (typeof window === 'undefined') return;

      // iOS Safari requires PWA install for Web Push. Detect early.
      if (isIOSSafariNotStandalone()) {
        if (!cancelled) {
          setNeedsA2HS(true);
          setState('unsupported');
        }
        return;
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        if (!cancelled) setState('unsupported');
        return;
      }

      if (Notification.permission === 'denied') {
        if (!cancelled) setState('denied');
        return;
      }

      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (reg) {
          const existing = await reg.pushManager.getSubscription();
          if (!cancelled) setState(existing ? 'subscribed' : 'idle');
          return;
        }
        if (!cancelled) setState('idle');
      } catch {
        if (!cancelled) setState('idle');
      }
    }

    probe();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnable() {
    setError(null);
    setState('working');

    if (!vapidPublicKey) {
      setError(
        'NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing — generate one and add it to .env.'
      );
      setState('idle');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'idle');
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      // Make sure the SW is active before subscribing — Safari is strict
      // about this.
      await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey),
      });

      const json = sub.toJSON();
      const endpoint = json.endpoint;
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!endpoint || !p256dh || !auth) {
        setError('subscription_missing_keys');
        setState('idle');
        return;
      }

      const r = await saveSubscription(
        { endpoint, p256dh, auth },
        navigator.userAgent
      );
      if (!r.ok) {
        setError(r.error);
        setState('idle');
        return;
      }

      setState('subscribed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
      setState('idle');
    }
  }

  async function handleDisable() {
    setError(null);
    setState('working');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await removeSubscription(endpoint);
      }
      setState('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
      setState('subscribed');
    }
  }

  if (state === 'loading') {
    return (
      <Button variant="outline" disabled>
        Loading…
      </Button>
    );
  }

  if (state === 'unsupported') {
    if (needsA2HS) {
      return (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          On iPhone, install RankedLearning to your Home Screen first
          (Share → Add to Home Screen), then open it from there to enable
          notifications.
        </div>
      );
    }
    return (
      <p className="text-xs text-slate-500">
        Notifications aren&apos;t supported in this browser.
      </p>
    );
  }

  if (state === 'denied') {
    return (
      <p className="text-xs text-slate-500">
        Notifications were blocked. Re-enable them in your browser&apos;s
        site settings, then refresh.
      </p>
    );
  }

  if (state === 'subscribed') {
    return (
      <div className="space-y-1">
        <Button variant="outline" onClick={handleDisable}>
          Disable notifications
        </Button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        onClick={handleEnable}
        disabled={state === 'working'}
      >
        {state === 'working' ? 'Enabling…' : 'Enable notifications'}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
