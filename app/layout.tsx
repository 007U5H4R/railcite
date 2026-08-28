import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Serif, IBM_Plex_Mono } from 'next/font/google';
import './globals.css'; import './app.css';

const sans = IBM_Plex_Sans({ subsets:['latin'], weight:['400','500','600','700'], variable:'--font-sans' });
const serif = IBM_Plex_Serif({ subsets:['latin'], weight:['400','600'], variable:'--font-serif' });
const mono = IBM_Plex_Mono({ subsets:['latin'], weight:['400','500'], variable:'--font-mono' });

export const metadata: Metadata = {
  title: 'RailCite — cited railway circular research',
  description: 'Search real Indian Railways circulars and manuals. Every answer cites its source — or RailCite says no governing rule was found.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${serif.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
