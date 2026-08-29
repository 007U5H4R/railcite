import type { ReactNode } from 'react';
import styles from './evidence.module.css';

// The trust vocabulary (Design.md §3.2): one component, four variants, each icon + color +
// text — status is never conveyed by color alone.
export type StatusKind = 'verified' | 'ocr' | 'superseded' | 'in_force';

const ICONS: Record<StatusKind, ReactNode> = {
  verified: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  ),
  ocr: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  ),
  superseded: null,
  in_force: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="5" /></svg>
  ),
};

const COPY: Record<StatusKind, string> = {
  verified: 'Verified text',
  ocr: 'OCR — verify against original',
  superseded: 'Superseded',
  in_force: 'In force',
};

const KIND_CLASS: Record<StatusKind, string> = {
  verified: styles.verified,
  ocr: styles.ocr,
  superseded: styles.superseded,
  in_force: styles.inForce,
};

export function StatusBadge({ kind }: { kind: StatusKind }) {
  return (
    <span className={`${styles.badge} ${KIND_CLASS[kind]}`}>
      {ICONS[kind]}
      {COPY[kind]}
    </span>
  );
}
