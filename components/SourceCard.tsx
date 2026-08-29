import type { DocType, SourceView } from '@/lib/types';
import { StatusBadge } from './StatusBadge';
import styles from './evidence.module.css';

// Decorative tile abbreviation, derived from the document type (+ domain when known).
// Presentational only — the real identity is the [n] index + title + circular number.
const TILE: Record<DocType, { big: string; small: string }> = {
  manual: { big: 'M', small: 'Manual' },
  circular: { big: 'C', small: 'Circular' },
  correction_slip: { big: 'CS', small: 'Slip' },
  tariff: { big: 'T', small: 'Tariff' },
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Law of Common Region: each source is one bordered region grouping its own metadata.
// Numbered [n] to match the inline citation chips in ConclusionCard (sources arrive in
// citation order). `active` (a matching chip was just clicked) gets a 2px accent outline
// + a brief background pulse. The chevron is the one real control — it opens SourceReader;
// StatusBadge pairs an icon with color + text so status is never carried by color alone.
export function SourceCard({ source, active, onOpen }: {
  source: SourceView; active: boolean; onOpen: (s: SourceView) => void;
}) {
  const d = source.document;
  const label = d.doc_type === 'circular' ? 'Primary circular' : 'Supporting';
  const kind = d.is_ocr ? 'ocr' : 'verified';
  const tile = TILE[d.doc_type];
  const rest = [d.issue_date, source.page_ref].filter((x): x is string => Boolean(x)).join(' · ');

  return (
    <article className={`${styles.card} ${active ? styles.active : ''}`}>
      <span className={styles.tile} aria-hidden="true">
        <b className="mono">{tile.big}</b>
        <span>{d.domain ? cap(d.domain) : tile.small}</span>
      </span>
      <span className={styles.meta}>
        <span className={styles.metaHead}>
          <span className={`${styles.idx} mono`}>[{source.n}]</span>
          <span className={styles.docLabel}>{label}</span>
        </span>
        <p className={styles.title}>{d.title}</p>
        <span className={`${styles.detail} mono`}>
          {d.circular_no && <span className={styles.cno}>{d.circular_no}</span>}
          {d.circular_no && rest && ' · '}
          {rest}
          <StatusBadge kind={kind} />
        </span>
      </span>
      <button type="button" className={styles.act} onClick={() => onOpen(source)}
        aria-label={`Open source ${source.n}: ${d.circular_no ?? d.title}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </article>
  );
}
