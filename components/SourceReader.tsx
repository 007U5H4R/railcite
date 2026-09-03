'use client';
import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { SourceView } from '@/lib/types';
import { safeHref } from '@/lib/safe-href';
import { StatusBadge, statusForText } from './StatusBadge';
import styles from './evidence.module.css';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// Accessible modal: focus moves to the close button on mount, Tab is trapped inside the
// panel, and Esc or a backdrop click both close it (same `onClose`).
export function SourceReader({ source, onClose }: { source: SourceView; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const d = source.document;
  const originalHref = safeHref(d.source_url);

  useEffect(() => {
    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} aria-hidden="true" onClick={onClose} />
      <motion.div ref={panelRef} role="dialog" aria-modal="true"
        aria-label={`Source: ${d.circular_no ?? d.title}`} className={styles.readerPanel}
        initial={reduced ? false : { x: '100%' }} animate={{ x: 0 }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 30, mass: 1 }}>
        <div className={styles.readerHeader}>
          <span className={`${styles.readerMeta} mono`}>{d.circular_no ?? d.title} · {d.issue_date ?? '—'}</span>
          <button type="button" ref={closeRef} className={styles.closeBtn} onClick={onClose}
            aria-label="Close source">✕</button>
        </div>
        <StatusBadge kind={statusForText(d)} />
        {source.page_ref && <p className={`${styles.pageRef} mono`}>{source.page_ref}</p>}
        <p className={`${styles.readerBody} reading`}>{source.snippet}</p>
        {d.source_url && (
          originalHref ? (
            <a href={originalHref} target="_blank" rel="noreferrer" className={styles.openOriginal}>
              Open original PDF ↗
            </a>
          ) : (
            <span className={styles.openOriginal}>Open original PDF ↗</span>
          )
        )}
      </motion.div>
    </div>
  );
}
