import styles from './evidence.module.css';

// The trust vocabulary (Design.md §3.2): one component, four variants, each icon + color +
// text — status is never conveyed by color alone.
export type StatusKind = 'verified' | 'ocr' | 'superseded' | 'in_force';

const COPY: Record<StatusKind, string> = {
  verified: '✓ Verified text',
  ocr: '⚠ OCR — verify against original',
  superseded: 'Superseded',
  in_force: '● In force',
};

const KIND_CLASS: Record<StatusKind, string> = {
  verified: styles.verified,
  ocr: styles.ocr,
  superseded: styles.superseded,
  in_force: styles.inForce,
};

export function StatusBadge({ kind }: { kind: StatusKind }) {
  return <span className={`${styles.badge} ${KIND_CLASS[kind]}`}>{COPY[kind]}</span>;
}
