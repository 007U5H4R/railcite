'use client';
import { useId, useState } from 'react';
import type { SourceView } from '@/lib/types';
import { analytics } from '@/lib/analytics';
import styles from './conclusion.module.css';
import { statusForText } from './StatusBadge';
export function CitationChip({ source, onOpen }: { source: SourceView; onOpen: (s: SourceView) => void }) {
  const [open, setOpen] = useState(false);
  const popId = useId();
  const d = source.document;
  // Same precedence as the source cards: illegible text outranks how the text was obtained,
  // so a mojibake extraction can never be announced here as "verified text".
  const status = statusForText(d);
  const statusCopy = status === 'low_quality'
    ? 'low-quality extraction — verify against original'
    : status === 'ocr' ? 'OCR — verify against original' : 'verified text';
  const label = `Source ${source.n}: ${d.circular_no ?? d.title}, ${statusCopy}`;
  return (
    <span className={styles.chipWrap}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className={`${styles.chip} mono`} aria-label={label}
        aria-describedby={open ? popId : undefined}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
        onClick={() => { analytics.citationClickedThrough(); onOpen(source); }}>[{source.n}]</button>
      {open && (
        <span role="tooltip" id={popId} className={styles.popover}>
          <span className="mono">{d.circular_no ?? d.title} · {d.issue_date ?? 'date n/a'}</span>
          <span className={styles.popSnippet}>{source.snippet.slice(0, 140)}…</span>
          <span className={status === 'verified' ? styles.popOk : styles.popWarn}>
            {status === 'verified' ? '✓ ' : '⚠ '}{statusCopy}</span>
        </span>
      )}
    </span>
  );
}
