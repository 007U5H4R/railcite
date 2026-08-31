'use client';
import { useEffect } from 'react';

// Registers the service worker (public/sw.js) on the client so RailCite is installable. Best-effort:
// gated on support, runs after load, and a failure never touches the app. Renders nothing.
export function PWARegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* never break the app */ }); };
    if (document.readyState === 'complete') register();
    else { window.addEventListener('load', register, { once: true }); return () => window.removeEventListener('load', register); }
  }, []);
  return null;
}
