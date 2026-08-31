/* RailCite service worker — minimal + NETWORK-FIRST by design.
 * RailCite is a live tool: every cited answer must come fresh from the network (a stale circular is
 * a trust hazard). So this SW caches nothing dynamic — it exists only to (1) satisfy the browser's
 * installability criteria ("Add to Home Screen") and (2) fall back to the cached app shell for a
 * top-level navigation when the network is down, instead of the browser's error page. */
const SHELL = 'railcite-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL).then((cache) => cache.add('/')).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle top-level navigations. Network-first; on failure, serve the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/')));
  }
  // API calls and assets are never intercepted — always straight to the network, never stale.
});
