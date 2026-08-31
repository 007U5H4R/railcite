import type { DocType, SourceView } from '@/lib/types';
import styles from './evidence.module.css';

// Explains the tile abbreviations (C, CS, …) shown on each SourceCard, rendered top-right of the
// Sources header. Only the doc types actually present in the current answer are listed, in first-
// appearance order, so the legend stays short and never claims a code no card is showing.
const MEANING: Record<DocType, { big: string; full: string }> = {
  circular: { big: 'C', full: 'Circular' },
  correction_slip: { big: 'CS', full: 'Correction slip' },
  manual: { big: 'M', full: 'Manual' },
  tariff: { big: 'T', full: 'Tariff' },
};

export function SourceLegend({ sources }: { sources: SourceView[] }) {
  const seen = new Set<DocType>();
  const items: DocType[] = [];
  for (const s of sources) {
    const t = s.document.doc_type;
    if (!seen.has(t)) { seen.add(t); items.push(t); }
  }
  if (items.length === 0) return null;

  return (
    <span className={styles.legend} aria-label="What the source codes mean">
      {items.map(t => (
        <span key={t} className={styles.legendItem}>
          <b className="mono">{MEANING[t].big}</b>{MEANING[t].full}
        </span>
      ))}
    </span>
  );
}
