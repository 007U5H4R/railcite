import type { MetadataRoute } from 'next';

// PWA manifest (Next serves it at /manifest.webmanifest and auto-links it). Makes RailCite
// installable ("Add to Home Screen") and launch standalone (no browser chrome). Icons are rendered
// from app/icon.tsx into public/icon-*.png.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RailCite — cited railway circular research',
    short_name: 'RailCite',
    description:
      'Search real Indian Railways circulars and manuals. Every answer cites its source — or says no governing rule was found.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#eef2fb',
    theme_color: '#2f7bf0',
    orientation: 'portrait',
    categories: ['productivity', 'reference', 'government'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
