// ASCILI Offline Service Worker
const CACHE_NAME = 'ascili-cache-v4';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './public/favicon.svg',
  './public/icon-192.svg',
  './public/icon-512.svg',
  './src/style.css',
  './src/website-upgrade.css',
  './src/app.js',
  './src/engine.js',
  './src/exporter.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Pre-caching asset warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Network-first for HTML pages and script modules to avoid serving stale builds
  if (req.mode === 'navigate' || req.destination === 'document' || req.destination === 'script' || req.url.endsWith('.html') || req.url.endsWith('.js')) {
    event.respondWith(
      fetch(req)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const resClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  // Stale-while-revalidate for static assets like fonts and images
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      const fetchPromise = fetch(req).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        }
        return networkResponse;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
