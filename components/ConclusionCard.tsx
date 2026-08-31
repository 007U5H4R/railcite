'use client';
import { motion, useReducedMotion } from 'motion/react';
import type { ConclusionBlock, SourceView } from '@/lib/types';
import { CitationChip } from './CitationChip';
import { stripInlineCitations } from '@/lib/note';
import { LanguageToggle } from './LanguageToggle';
import { citedFrom, t, type Language } from '@/lib/i18n';
import styles from './conclusion.module.css';

// "Cited from N passages in the X manual" lead line — a decorative status dot pairs with
// this text (never color alone). Falls back to domain-agnostic phrasing when sources span
// more than one domain. Localized via lib/i18n's citedFrom.
function leadText(sources: SourceView[], lang: Language): string {
  const domains = new Set(sources.map(s => s.document.domain).filter((d): d is string => Boolean(d)));
  const domain = domains.size === 1 ? [...domains][0] : null;
  return citedFrom(sources.length, domain, lang);
}

// `lang`/`hindiBlocks` drive the Hindi toggle: hindiBlocks is index-aligned to the RAW `blocks`
// array (same order/length), so a block rendered from raw index i shows hindiBlocks[i] when
// Hindi is on. Citations always come from the English block, so the chips never change.
export function ConclusionCard({ blocks, sources, onCite, isSaved = false, saveDisabled = false,
  onToggleSave = null, lang = 'en', hindiBlocks, onLangChange = null,
  langBusy = false, onLangRetry = null }: {
  blocks: ConclusionBlock[]; sources: SourceView[]; onCite: (s: SourceView) => void;
  // R4: bookmark toggle for the current case. onToggleSave is null when there's no live
  // case to save against (e.g. the offline cached-answer fallback in CaseConsole) — the
  // button just doesn't render then, rather than rendering disabled-forever.
  isSaved?: boolean; saveDisabled?: boolean; onToggleSave?: (() => void) | null;
  // This segment's own EN|हिं toggle (independent of the note's). Rendered only when a handler
  // is supplied; `hindiBlocks` (index-aligned to `blocks`) carries the Hindi text.
  lang?: Language; hindiBlocks?: string[]; onLangChange?: ((l: Language) => void) | null;
  // Translation status, rendered AT the toggle (see LanguageToggle) rather than atop the column.
  langBusy?: boolean; onLangRetry?: (() => void) | null;
}) {
  const still = useReducedMotion();
  const byN = new Map(sources.map(s => [s.n, s]));
  const showHi = lang === 'hi' && !!hindiBlocks;
  // Effective language — the lead line must follow the PROSE, not the toggle, or a pending/failed
  // translation renders a Hindi lead over an English body (and the offline cached card, which can
  // never translate, showed exactly that permanently).
  const effLang: Language = showHi ? 'hi' : 'en';
  // No aria-live on the card: it is not a status region, and announcing it re-read the ENTIRE
  // multi-paragraph answer on every language swap. Progress is announced at the toggle instead.
  return (
    <section aria-label="Cited conclusion" className={styles.card}>
      {showHi && <p className={styles.caveat} role="note">{t('caveat', 'hi')}</p>}
      <div className={styles.leadRow}>
        <p className={styles.lead}>
          {/* Keyed to the WEAKEST source: a green dot beside an answer resting on an OCR'd
              passage overstated its footing. Decorative only — the badges carry the real signal. */}
          <span className={`${styles.leadDot} ${sources.some(s => s.document.is_ocr) ? styles.leadDotOcr : ''}`} aria-hidden="true" />
          {leadText(sources, effLang)}
        </p>
        <div className={styles.leadActions}>
        {onLangChange && (
          <LanguageToggle value={lang} onChange={onLangChange} label={t('responseLanguage', lang)}
            busy={langBusy} onRetry={onLangRetry} />)}
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
      </div>
      {blocks.map((b, rawIdx) => ({ b, rawIdx }))
        .filter(({ b }) => b.citations.length > 0)   // defense in depth vs P0
        .map(({ b, rawIdx }, i) => (
        <motion.p key={rawIdx} className={`reading ${styles.block}`}
          initial={still ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: i * 0.04, ease: [0, 0, 0.2, 1] }}>
          {/* `||` not `??`: an empty Hindi item (the schema permits '', and uncited slots are
              ''-padded) must fall back to English, not render a blank cited paragraph. */}
          {stripInlineCitations(showHi ? (hindiBlocks![rawIdx] || b.text) : b.text)}{' '}
          {b.citations.map(n => byN.get(n)).filter(Boolean).map(s => (
            <CitationChip key={s!.chunk_id + s!.n} source={s!} onOpen={onCite} />))}
        </motion.p>
      ))}
    </section>
  );
}
