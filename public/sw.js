// Squire service worker — Web Push delivery.
//
// Registered at /sw.js so the scope is the whole origin. The browser keeps
// this running independently of any open tab; it wakes up whenever the push
// service forwards a notification or when the user clicks one.
//
// Plain JS on purpose — no bundling. Logic is intentionally minimal: the
// payload's shape is set by the send-pushes Edge Function.

self.addEventListener('install', () => {
  // Activate immediately instead of waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of any tab that was open before this SW was installed.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Squire', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Squire';
  const options = {
    body: payload.body || '',
    icon: '/next.svg', // placeholder; real icon ships later
    badge: '/next.svg',
    data: payload.data || {},
    tag: payload.tag || payload.type || undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If a Squire tab is already open, focus it and navigate.
      for (const client of clients) {
        if ('focus' in client) {
          try {
            const url = new URL(client.url);
            if (url.origin === self.location.origin) {
              client.navigate(targetUrl);
              return client.focus();
            }
          } catch {
            // ignore parse errors
          }
        }
      }
      // Otherwise open a fresh window.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
