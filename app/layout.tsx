import type { Metadata, Viewport } from 'next';
import { Poppins, Quicksand, IBM_Plex_Mono } from 'next/font/google';
import './globals.css'; import './app.css';
import { Shell } from '@/components/Shell';
import { AnalyticsInit } from '@/components/AnalyticsInit';
import { PWARegister } from '@/components/PWARegister';
// Vercel Web Analytics + Speed Insights go through our own wrapper, never the bare components —
// its beforeSend redacts case UUIDs out of the reported URL (see components/VercelTelemetry.tsx).
import { VercelTelemetry } from '@/components/VercelTelemetry';

const sans = Poppins({ subsets:['latin'], weight:['400','500','600','700'], variable:'--font-sans' });
const display = Quicksand({ subsets:['latin'], weight:['500','600','700'], variable:'--font-display' });
const mono = IBM_Plex_Mono({ subsets:['latin'], weight:['400','500','600'], variable:'--font-mono' });

// Absolute-URL base for OG/Twitter images (crawlers need absolute HTTPS). Set NEXT_PUBLIC_SITE_URL
// to the production domain in the deploy env; falls back to localhost for dev.
// The fallback must NEVER reach production: an explicit metadataBase also suppresses both Next's
// missing-metadataBase warning and its automatic Vercel-URL fallback, so a forgotten env var would
// silently ship og:url/og:image pointing at http://localhost:3000 — every unfurl broken, no signal.
// VERCEL_URL is injected by Vercel on every deploy, so it is a safe production backstop.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
const DESC = 'Search real Indian Railways circulars and manuals. Every answer cites its source — or RailCite says no governing rule was found.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: 'RailCite',
  title: 'RailCite — cited railway circular research',
  description: DESC,
  // og:image + twitter:image are supplied automatically by app/opengraph-image.tsx and
  // app/twitter-image.tsx (1200×630), resolved to absolute URLs via metadataBase above.
  openGraph: {
    type: 'website', siteName: 'RailCite', url: '/',
    title: 'RailCite — cited railway circular research', description: DESC,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RailCite — cited railway circular research',
    description: 'Every answer cites its source — or RailCite says no governing rule was found.',
  },
  // PWA: manifest is auto-linked from app/manifest.ts; add the iOS home-screen icon + standalone hints.
  icons: { apple: '/apple-icon.png' },
  appleWebApp: { capable: true, title: 'RailCite', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#2f7bf0',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${display.variable} ${mono.variable}`}>
        <AnalyticsInit />
        <PWARegister />
        <VercelTelemetry />
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
