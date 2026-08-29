'use client';
import { useId, useState } from 'react';
import type { SourceView } from '@/lib/types';
import { analytics } from '@/lib/analytics';
import styles from './conclusion.module.css';
export function CitationChip({ source, onOpen }: { source: SourceView; onOpen: (s: SourceView) => void }) {
  const [open, setOpen] = useState(false);
  const popId = useId();
  const d = source.document;
  const label = `Source ${source.n}: ${d.circular_no ?? d.title}${d.is_ocr ? ', OCR — verify against original' : ', verified text'}`;
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
          <span className={d.is_ocr ? styles.popWarn : styles.popOk}>
            {d.is_ocr ? '⚠ OCR — verify against original' : '✓ verified text'}</span>
        </span>
      )}
    </span>
  );
}
