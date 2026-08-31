'use client';
import { useEffect } from 'react';

// Registers the service worker (public/sw.js) so RailCite is installable — PRODUCTION ONLY.
// In dev the SW cache-first'd /_next/static and served stale chunks, fighting hot reload; so on a
// non-production build we instead UNREGISTER any existing SW and clear its caches, letting a dev
// machine that previously ran the SW heal itself. Best-effort: gated on support, runs after load,
// and a failure never touches the app. Renders nothing.
export function PWARegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      // Dev: tear down any previously-registered SW + its caches so localhost always serves fresh.
      navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => void r.unregister())).catch(() => {});
      if (typeof caches !== 'undefined') caches.keys().then(ks => ks.forEach(k => void caches.delete(k))).catch(() => {});
      return;
    }

    const register = () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* never break the app */ }); };
    if (document.readyState === 'complete') register();
    else { window.addEventListener('load', register, { once: true }); return () => window.removeEventListener('load', register); }
  }, []);
  return null;
}
