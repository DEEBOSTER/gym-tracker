const CACHE_NAME = 'gymtracker-v56';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/static/manifest.json',
  '/static/icon.svg',
  '/static/app-icon.png',
  '/static/app-icon-192.png',
  '/static/apple-touch-icon.png',
  '/static/icon-192.png',
  '/static/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell');
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.warn('Cache addAll note:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// --- BACKGROUND REST TIMER NOTIFICATIONS ---
let restNotificationTimeout = null;

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SCHEDULE_REST_NOTIFICATION') {
    if (restNotificationTimeout) {
      clearTimeout(restNotificationTimeout);
      restNotificationTimeout = null;
    }
    const delayMs = Math.max(0, parseInt(event.data.delayMs, 10) || 0);
    const title = event.data.title || 'GymTracker ⏱️ Отдых окончен!';
    const body = event.data.body || 'Пора на следующий подход! 💪';

    if (delayMs > 0) {
      restNotificationTimeout = setTimeout(() => {
        self.registration.showNotification(title, {
          body: body,
          icon: '/static/icon-192.png',
          badge: '/static/icon-192.png',
          vibrate: [300, 100, 300, 100, 300],
          tag: 'rest-timer',
          renotify: true,
          requireInteraction: true,
          data: { url: '/' }
        });
        restNotificationTimeout = null;
      }, delayMs);
    }
  } else if (event.data?.type === 'CANCEL_REST_NOTIFICATION') {
    if (restNotificationTimeout) {
      clearTimeout(restNotificationTimeout);
      restNotificationTimeout = null;
    }
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Network-only for API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // 2. Network-first for HTML, JS and dynamic files so fresh code is always loaded
  if (url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Cache-first for images, fonts, icons, manifest
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((netRes) => {
        if (netRes.status === 200) {
          const clone = netRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return netRes;
      });
    })
  );
});
