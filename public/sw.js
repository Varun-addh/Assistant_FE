// NOTE: Bump this when changing caching logic.
const CACHE_NAME = 'stratax-ai-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/stratax-ai-192.png',
  '/icons/stratax-ai-512.png',
  '/icons/stratax-ai-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {
        // If precache fails (e.g., transient network), don't brick SW install.
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle same-origin GET requests. Let the browser deal with everything else.
  // This prevents infinite console spam for failed cross-origin/API requests.
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // SPA navigation fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/index.html'))
        .then((res) => res || Response.error())
    );
    return;
  }

  // Cache-first for static same-origin assets, with network fallback.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => Response.error());
    })
  );
});
