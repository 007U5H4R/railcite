import type { SourceView } from '@/lib/types';
import { StatusBadge } from './StatusBadge';
import styles from './evidence.module.css';

// Law of Common Region: each source is one bordered region grouping its own metadata,
// fully clickable → SourceReader. `active` (a matching citation chip was just clicked)
// gets a 2px accent outline + a brief background pulse — never color alone (see StatusBadge).
export function SourceCard({ source, active, onOpen }: {
  source: SourceView; active: boolean; onOpen: (s: SourceView) => void;
}) {
  const d = source.document;
  const label = d.doc_type === 'circular' ? 'Primary circular' : 'Supporting';
  const kind = d.is_ocr ? 'ocr' : 'verified';

  return (
    <article className={`${styles.card} ${active ? styles.active : ''}`}>
      <button type="button" className={styles.openBtn} onClick={() => onOpen(source)}
        aria-label={`Open source: ${d.circular_no ?? d.title}`}>
        <span className={styles.cardHeader}>
          <span className={styles.docLabel}>{label}</span>
          <StatusBadge kind={kind} />
        </span>
        <span className={`${styles.meta} mono`}>
          {d.circular_no ?? d.title} · {d.issue_date ?? '—'} · {source.page_ref}
        </span>
        <span className={`${styles.snippet} reading`}>{source.snippet}</span>
      </button>
    </article>
  );
}
