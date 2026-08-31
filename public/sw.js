/* RailCite service worker — minimal + NETWORK-FIRST by design.
 * RailCite is a live tool: every cited answer must come fresh from the network (a stale circular is
 * a trust hazard). So no API response is ever cached. The SW exists to (1) satisfy the browser's
 * installability criteria ("Add to Home Screen") and (2) serve a WORKING app shell when a
 * top-level navigation fails offline.
 *
 * Two things the first version got wrong, fixed here:
 *  - It cached only '/' at install, so offline the HTML loaded but every /_next/static script and
 *    stylesheet 404'd — a blank, unstyled page. Content-hashed build assets are immutable, so they
 *    are now runtime-cached as they're fetched, which is safe (a hash change means a new URL).
 *  - The cached HTML was written once at install and never refreshed, so after any redeploy it
 *    referenced chunks that no longer exist. '/' is now re-cached on every successful navigation.
 */
const SHELL = 'railcite-shell-v2';
const ASSETS = 'railcite-assets-v2';
const KEEP = [SHELL, ASSETS];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL).then((cache) => cache.add('/')).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never touch third-party (analytics, fonts)

  // Top-level navigation: network-first, refreshing the cached shell on every success so the
  // offline copy always matches the current deploy. On failure, fall back to that shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          event.waitUntil(caches.open(SHELL).then((c) => c.put('/', copy)).catch(() => {}));
          return res;
        })
        .catch(async () => (await caches.match('/')) || Response.error()),
    );
    return;
  }

  // Immutable, content-hashed build assets: serve from cache when present, otherwise fetch and
  // store. A new build produces new URLs, so this can never serve stale code.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          event.waitUntil(caches.open(ASSETS).then((c) => c.put(req, copy)).catch(() => {}));
        }
        return res;
      })),
    );
  }
  // Everything else (API calls, images, fonts) goes straight to the network — never stale.
});
