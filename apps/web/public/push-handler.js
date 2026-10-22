// Web-push handlers for the service worker (ticket 13).
//
// This file is imported by the generated service worker
// (vite-plugin-pwa: workbox.importScripts) and adds the push and
// notificationclick listeners that the generated worker does not have.

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = { title: 'AVC Management', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'AVC Management';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/icon-96x96.png',
    requireInteraction: !!payload.requireInteraction,
    silent: !!payload.silent,
    timestamp: payload.timestamp || Date.now(),
    data: payload.data || {},
    actions: payload.actions || [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = data.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client && client.url !== targetUrl) {
            client.navigate(targetUrl).catch(() => undefined);
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
