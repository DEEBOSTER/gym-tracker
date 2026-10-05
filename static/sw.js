const CACHE_NAME = 'gymtracker-v20';
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
