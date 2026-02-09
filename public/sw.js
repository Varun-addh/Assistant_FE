// NOTE: Bump this when changing caching logic.
const CACHE_NAME = 'stratax-ai-v18';
const ASSETS = [
  '/index.html',
  '/manifest.webmanifest',
  '/icons/stratax-ai-192.png?v=18',
  '/icons/stratax-ai-512.png?v=18',
  '/icons/apple-touch-icon.png?v=18'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Cache assets individually so a single 404/network hiccup doesn't block SW installation.
    try {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        ASSETS.map(async (url) => {
          try {
            const req = new Request(url, { cache: 'reload' });
            const res = await fetch(req);
            if (res && res.ok) await cache.put(req, res);
          } catch {
            // Ignore individual precache failures.
          }
        })
      );
    } finally {
      // Always allow the new SW to activate.
      await self.skipWaiting();
    }
  })());
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

  // Never intercept video/media requests.
  // If a video was missing during a previous deploy, Firebase may have rewritten it to /index.html,
  // and a cache-first SW would keep serving that HTML forever (appearing "stuck").
  if (request.destination === 'video' || url.pathname.endsWith('.mp4') || url.pathname.endsWith('.webm')) return;

  // Never intercept fonts.
  // If a font URL was missing during a previous deploy, it can get rewritten to /index.html and cached,
  // which later causes "Failed to decode downloaded font" / OTS parsing errors.
  if (
    request.destination === 'font' ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.ttf') ||
    url.pathname.endsWith('.otf')
  ) return;

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
            const contentType = response.headers.get('content-type') || '';
            // Avoid caching SPA fallback HTML under asset URLs.
            if (contentType.includes('text/html')) return response;
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => Response.error());
    })
  );
});
