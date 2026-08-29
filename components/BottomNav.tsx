'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './BottomNav.module.css';

const IconHome = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11l9-7 9 7M5 10v10h14V10" />
  </svg>
);
const IconAsk = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.5 8.5 0 0 1-11.9 7.8L3 21l1.7-6.1A8.5 8.5 0 1 1 21 11.5z" />
  </svg>
);
const IconSaved = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);
const IconYou = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

const TABS = [
  { href: '/', label: 'Home', icon: IconHome },
  { href: '/ask', label: 'Ask', icon: IconAsk },
  { href: '/saved', label: 'Saved', icon: IconSaved },
  { href: '/you', label: 'You', icon: IconYou },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Primary">
      <div className={styles.bar}>
        {TABS.map(t => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={`${styles.tab} ${active ? styles.active : ''}`}
            >
              {active ? <span className={styles.knob}>{t.icon}</span> : t.icon}
              <span className={styles.lb}>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
