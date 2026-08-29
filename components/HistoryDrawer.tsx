'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/hooks/useSession';
import { useRecentCases, groupRecentCases, type RecentCase } from '@/hooks/useRecentCases';
import styles from './HistoryDrawer.module.css';

const FOCUSABLE = 'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])';

// A real accessible slide-in dialog (NOT the mockup's CSS checkbox-hack): role="dialog"
// aria-modal, focus-trapped, Esc closes, scrim-click closes, focus returns to the toggle.
// Open/close state is owned by the Shell; `triggerRef` points at the TopBar toggle so we
// can restore focus to it on close regardless of browser click-focus quirks.
export function HistoryDrawer({ open, onClose, triggerRef }: {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const { cases, loading, error } = useRecentCases();
  const { user } = useSession();

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = triggerRef.current;   // stable (TopBar toggle) — captured for focus return

    dialog.querySelector<HTMLElement>(FOCUSABLE)?.focus();   // move focus into the dialog
    document.body.style.overflow = 'hidden';                  // lock background scroll

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);

    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = '';
      trigger?.focus();                                       // return focus to the toggle
    };
  }, [open, onClose, triggerRef]);

  const q = query.trim().toLowerCase();
  const filtered = q ? cases.filter(c => c.question.toLowerCase().includes(q)) : cases;
  const groups = groupRecentCases(filtered);
  const isEmpty = !loading && !error && filtered.length === 0;

  return (
    <>
      <div className={`${styles.scrim} ${open ? styles.open : ''}`} aria-hidden="true" onClick={onClose} />
      <div
        ref={dialogRef}
        className={`${styles.drawer} ${open ? styles.open : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Case history"
      >
        <div className={styles.top}>
          <span className={`${styles.title} wordmark`}>History</span>
          <button type="button" className={styles.close} aria-label="Close history" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <Link href="/ask" className={styles.newCase} onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New case
        </Link>

        <div className={styles.search}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="search"
            placeholder="Search cases"
            aria-label="Search cases"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div className={styles.list}>
          {loading && <p className={styles.state}>Loading cases…</p>}
          {error && !loading && <p className={styles.state}>Couldn’t load your cases.</p>}
          {isEmpty && (
            <p className={styles.state}>{q ? 'No cases match your search.' : 'No cases yet.'}</p>
          )}
          <CaseGroup label="Today" cases={groups.today} onPick={onClose} />
          <CaseGroup label="Yesterday" cases={groups.yesterday} onPick={onClose} />
          <CaseGroup label="Previous 7 days" cases={groups.previous7} onPick={onClose} />
        </div>

        {user && (
          <div className={styles.foot}>
            <span className={styles.avatar} aria-hidden="true">{(user.name ?? '?').slice(0, 1)}</span>
            <span className={styles.footText}>
              <b>{user.name ?? 'Signed in'}</b>
              <small>Signed in</small>
            </span>
          </div>
        )}
      </div>
    </>
  );
}

// R4 reopen: each case is a real navigation (not a button) to /ask?case=<id>, which
// CaseConsole reads to rehydrate the cited answer. onPick still fires (closes the drawer).
function CaseGroup({ label, cases, onPick }: { label: string; cases: RecentCase[]; onPick: () => void }) {
  if (cases.length === 0) return null;
  return (
    <>
      <div className={styles.group}>{label}</div>
      {cases.map(c => (
        <Link key={c.id} href={`/ask?case=${encodeURIComponent(c.id)}`} className={styles.item} onClick={onPick}>
          <span
            className={`${styles.dot} ${c.status === 'answered' ? styles.dotOk : styles.dotNo}`}
            role="img"
            aria-label={c.status === 'answered' ? 'answered' : 'no rule found'}
          />
          <span className={styles.q}>{c.question}</span>
        </Link>
      ))}
    </>
  );
}
