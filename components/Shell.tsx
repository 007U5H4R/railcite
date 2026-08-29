'use client';
import { useCallback, useRef, useState } from 'react';
import styles from './Shell.module.css';
import { TopBar } from './TopBar';
import { TrustFooter } from './TrustFooter';
import { BottomNav } from './BottomNav';
import { HistoryDrawer } from './HistoryDrawer';

// App shell: a mobile-first single column (max-width ~900px) on a fixed pastel-glass
// backdrop, with a sticky TopBar, in-flow TrustFooter, a fixed lifted-knob BottomNav, and
// the history drawer. Rendered once by app/layout.tsx so every route lives inside it.
// Owns the drawer open/close state; the TopBar toggle opens it, focus returns there on close.
export function Shell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <>
      <div className={styles.bgfx} aria-hidden="true">
        <svg viewBox="0 0 1440 1024" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="rc-ga" x1="0" y1="0" x2="1" y2="1.1">
              <stop offset="0" stopColor="#9db6f1" /><stop offset=".5" stopColor="#bfa4ea" /><stop offset="1" stopColor="#ef9cd3" />
            </linearGradient>
            <linearGradient id="rc-gb" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#f0a0d5" /><stop offset="1" stopColor="#a9bef2" />
            </linearGradient>
            <filter id="rc-fb" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="62" /></filter>
            <filter id="rc-fe" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="6" /></filter>
          </defs>
          <g filter="url(#rc-fb)">
            <ellipse cx="210" cy="150" rx="340" ry="200" fill="url(#rc-ga)" opacity=".5" transform="rotate(-20 210 150)" />
            <ellipse cx="120" cy="470" rx="280" ry="160" fill="url(#rc-gb)" opacity=".42" transform="rotate(22 120 470)" />
            <ellipse cx="500" cy="300" rx="210" ry="380" fill="url(#rc-ga)" opacity=".38" transform="rotate(40 500 300)" />
            <ellipse cx="90" cy="800" rx="240" ry="150" fill="#f0a3d6" opacity=".4" transform="rotate(-12 90 800)" />
          </g>
          <g filter="url(#rc-fe)" fill="none" stroke="#ffffff" strokeOpacity=".4" strokeWidth="2" strokeLinecap="round">
            <path d="M40 960 C 190 660 300 520 400 150" />
            <path d="M150 975 C 300 690 470 470 620 200" />
            <path d="M270 985 C 430 700 600 470 780 260" />
            <path d="M-20 720 C 140 560 260 480 300 300" />
          </g>
        </svg>
      </div>

      <div className={styles.app}>
        <TopBar onOpenDrawer={openDrawer} toggleRef={toggleRef} />
        <main className={styles.main}>{children}</main>
        <TrustFooter />
      </div>

      <BottomNav />
      <HistoryDrawer open={drawerOpen} onClose={closeDrawer} triggerRef={toggleRef} />
    </>
  );
}
