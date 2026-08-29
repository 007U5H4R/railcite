import type { Metadata } from 'next';
import { Poppins, Quicksand, IBM_Plex_Mono } from 'next/font/google';
import './globals.css'; import './app.css';
import { Shell } from '@/components/Shell';

const sans = Poppins({ subsets:['latin'], weight:['400','500','600','700'], variable:'--font-sans' });
const display = Quicksand({ subsets:['latin'], weight:['500','600','700'], variable:'--font-display' });
const mono = IBM_Plex_Mono({ subsets:['latin'], weight:['400','500','600'], variable:'--font-mono' });

export const metadata: Metadata = {
  title: 'RailCite — cited railway circular research',
  description: 'Search real Indian Railways circulars and manuals. Every answer cites its source — or RailCite says no governing rule was found.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${display.variable} ${mono.variable}`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
