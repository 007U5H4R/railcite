'use client';
import { motion, useReducedMotion } from 'motion/react';
import type { ConclusionBlock, SourceView } from '@/lib/types';
import { CitationChip } from './CitationChip';
import styles from './conclusion.module.css';

// "Cited from N passages in the X manual" lead line — a decorative status dot pairs with
// this text (never color alone). Falls back to domain-agnostic phrasing when sources span
// more than one domain.
function leadText(sources: SourceView[]): string {
  const n = sources.length;
  const noun = n === 1 ? 'passage' : 'passages';
  const domains = new Set(sources.map(s => s.document.domain).filter((d): d is string => Boolean(d)));
  if (domains.size === 1) {
    const [domain] = domains;
    return `Cited from ${n} ${noun} in the ${domain.charAt(0).toUpperCase()}${domain.slice(1)} manual`;
  }
  return `Cited from ${n} ${noun}`;
}

export function ConclusionCard({ blocks, sources, onCite, isSaved = false, saveDisabled = false,
  onToggleSave = null }: {
  blocks: ConclusionBlock[]; sources: SourceView[]; onCite: (s: SourceView) => void;
  // R4: bookmark toggle for the current case. onToggleSave is null when there's no live
  // case to save against (e.g. the offline cached-answer fallback in CaseConsole) — the
  // button just doesn't render then, rather than rendering disabled-forever.
  isSaved?: boolean; saveDisabled?: boolean; onToggleSave?: (() => void) | null;
}) {
  const still = useReducedMotion();
  const byN = new Map(sources.map(s => [s.n, s]));
  return (
    <section aria-label="Cited conclusion" aria-live="polite" className={styles.card}>
      <div className={styles.leadRow}>
        <p className={styles.lead}>
          <span className={styles.leadDot} aria-hidden="true" />
          {leadText(sources)}
        </p>
        {onToggleSave && (
          <button type="button" className={`${styles.saveBtn} ${isSaved ? styles.saveBtnOn : ''}`}
            aria-pressed={isSaved} aria-label={isSaved ? 'Saved' : 'Save case'}
            disabled={saveDisabled} onClick={onToggleSave}>
            <svg viewBox="0 0 24 24" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V20l-6-4-6 4V4.5Z" />
            </svg>
          </button>
        )}
      </div>
      {blocks.filter(b => b.citations.length > 0).map((b, i) => (   // defense in depth vs P0
        <motion.p key={i} className={`reading ${styles.block}`}
          initial={still ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: i * 0.04, ease: [0, 0, 0.2, 1] }}>
          {b.text}{' '}
          {b.citations.map(n => byN.get(n)).filter(Boolean).map(s => (
            <CitationChip key={s!.chunk_id + s!.n} source={s!} onOpen={onCite} />))}
        </motion.p>
      ))}
    </section>
  );
}
