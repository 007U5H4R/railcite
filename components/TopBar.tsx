'use client';
import { AccountChip } from './AccountChip';
import styles from './topbar.module.css';

// Header: drawer-toggle (opens the history drawer) · two-tone tittle wordmark with the
// elephant glyph · AccountChip. `toggleRef` is forwarded to the toggle button so the drawer
// can return focus to it on close. Sticky + translucent per the mockup.
export function TopBar({ onOpenDrawer, toggleRef }: {
  onOpenDrawer: () => void;
  toggleRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <header role="banner" className={styles.top}>
      <button
        ref={toggleRef}
        type="button"
        className={styles.iconBtn}
        aria-label="Open history"
        aria-haspopup="dialog"
        onClick={onOpenDrawer}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />
        </svg>
      </button>

      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">
          <svg className={styles.glyph} viewBox="0 0 64 64">
            <g fill="currentColor">
              <ellipse cx="17" cy="28" rx="11" ry="13" />
              <ellipse cx="47" cy="28" rx="11" ry="13" />
              <circle cx="32" cy="30" r="15" />
            </g>
            <path
              d="M32 44 C31 51 33 57 39 59 C44 60.6 46 56 44 53 C42.6 51 39.6 51.6 40 54"
              fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className={`${styles.wm} wordmark`}>
          Ra<span className={styles.diBlue}>{'ı'}</span>l<span className={styles.c2}>C<span className={styles.diDark}>{'ı'}</span>te</span>
        </span>
      </div>

      <span className={styles.spacer} />
      <AccountChip />
    </header>
  );
}
