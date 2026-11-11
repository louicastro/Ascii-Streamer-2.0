// ASCILI Offline Service Worker
const CACHE_NAME = 'ascili-cache-v2.4.2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './public/favicon.svg',
  './public/icon-192.svg',
  './public/icon-512.svg',
  './src/style.css',
  './src/website-upgrade.css',
  './src/index.css',
  './src/app.js',
  './src/segmentation.js',
  './src/engine.js',
  './src/exporter.js',
  './src/gif-encoder.js',
  './src/canvas-renderer.worker.js',
  './fonts/jetbrains-mono-400.woff2',
  './fonts/jetbrains-mono-700.woff2',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Pre-cache all core assets safely using Promise.allSettled
      // so a single optional or missing asset will not fail the installation.
      await Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => {
            console.warn('[SW] Pre-caching asset notice for', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Purging outdated cache:', k);
          return caches.delete(k);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // 1. Navigation requests (HTML documents)
  // Network-first with immediate offline fallback to cached page or index.html
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const resClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(req, { ignoreSearch: true });
          if (cached) return cached;
          return (await caches.match('./index.html', { ignoreSearch: true })) ||
                 (await caches.match('index.html', { ignoreSearch: true })) ||
                 (await caches.match('./', { ignoreSearch: true }));
        })
    );
    return;
  }

  // 2. Static application resources (scripts, workers, styles, fonts, images)
  // Stale-While-Revalidate: return cached version immediately for 100% offline support
  // and instant load, while updating cache from network in background when online.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cachedResponse => {
      const fetchPromise = fetch(req)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
            const resClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
          }
          return networkResponse;
        })
        .catch(err => {
          if (!cachedResponse) {
            console.warn('[SW] Offline fetch failed and no cache entry for:', req.url);
          }
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
