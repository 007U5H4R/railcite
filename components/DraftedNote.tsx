'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ConclusionBlock, SourceView, Translation } from '@/lib/types';
import { CitationChip } from './CitationChip';
import { LanguageToggle } from './LanguageToggle';
import { analytics } from '@/lib/analytics';
import { parseNote, buildNoteText, displayText } from '@/lib/note';
import { t, type Language } from '@/lib/i18n';
import styles from './DraftedNote.module.css';

// Note structure + plain-text rendering now live in lib/note.ts (shared with app/api/translate
// so the Hindi content stays index-aligned with what we render here). Re-exported so existing
// importers of buildNoteText from this module keep working.
export { buildNoteText };

// The drafted justification note (Phase 4a). The backend already generates `note` alongside
// the cited conclusion (see lib/synthesize.ts); this only renders it. A native <details> so
// the disclosure is keyboard/AT-operable for free — open by default, matching the mockup.
// Citation chips reuse CitationChip verbatim and share CaseConsole's onCite handler so
// clicking [n] here highlights the same source card as clicking [n] in the conclusion does.
// `lang`/`hi` drive the Hindi toggle. When lang==='hi' and `hi` is present, the note's PROSE
// (subject value + each cited point) shows in Hindi and the Sub:/Ref: labels + close line are
// localized — but the Ref line, inline [n] marks and the Sources footer stay verbatim, so the
// citation provenance survives on screen and through Copy/Export. Citations still come from the
// English `note`, never from the translation.
export function DraftedNote({ note, sources, onCite, lang = 'en', hi, onLangChange = null,
  langBusy = false, onLangRetry = null }: {
  note: ConclusionBlock[]; sources: SourceView[]; onCite: (s: SourceView) => void;
  // This segment's OWN EN|हिं toggle (independent of the response's). Rendered when a handler is
  // supplied; `hi` carries the Hindi note payload.
  lang?: Language; hi?: Translation; onLangChange?: ((l: Language) => void) | null;
  langBusy?: boolean; onLangRetry?: (() => void) | null;
}) {
  const [copied, setCopied] = useState(false);
  const byN = useMemo(() => new Map(sources.map(s => [s.n, s])), [sources]);
  const parsed = useMemo(() => parseNote(note, sources), [note, sources]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  // Nothing citable survived (e.g. the model only returned structural lines) — an
  // uncited "note" would violate extractive-only, so render nothing rather than a shell.
  if (!parsed.contentBlocks.length) return null;

  const showHi = lang === 'hi' && !!hi;
  // EFFECTIVE language — labels must follow the PROSE, not the toggle. With हिं selected but the
  // translation still loading (or failed), driving labels off `lang` alone produced a macaronic
  // note: विषय:/संदर्भ:/स्रोत: and the Hindi close line wrapped around English points — which
  // Copy/Export then wrote verbatim into a document a CCI may paste into an official submission.
  const effLang: Language = showHi ? 'hi' : 'en';
  const noteHi = showHi ? { sub: hi!.noteSub, content: hi!.noteContent } : undefined;
  // `|| parsed.sub` (not `??`): the translation array can legally carry '' for an item, and an
  // empty string must fall back to the English text, not render as blank prose.
  const subText = displayText(showHi ? (hi!.noteSub || parsed.sub || '') : (parsed.sub ?? '')) || null;
  const pointText = (i: number, b: ConclusionBlock) => displayText(showHi ? (hi!.noteContent[i] || b.text) : b.text);
  const plainText = () => buildNoteText(note, sources, effLang, noteHi);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plainText());
      setCopied(true);
      analytics.draftNoteCopied();
    } catch {
      /* clipboard unavailable/denied — non-blocking, just no confirmation */
    }
  };

  const handleExport = () => {
    const blob = new Blob([plainText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'railcite-justification-note.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    analytics.draftNoteExported();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <details className={styles.note} open>
      <summary className={styles.summary}>
        <span className={styles.icon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
            <path d="M14 4v5h5M8 13h8M8 17h5" />
          </svg>
        </span>
        <span className={styles.headText}>
          {t('draftedNoteTitle', effLang)}
          <small className={styles.subtext}>{t('reviewBeforeSubmitting', effLang)}</small>
        </span>
        <span className={styles.chevron} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </summary>
      <div className={styles.docWrap}>
        <div className={styles.docInner}>
          {onLangChange && (
            <div className={styles.langRow}>
              <LanguageToggle value={lang} onChange={onLangChange} label={t('noteLanguage', lang)}
                busy={langBusy} onRetry={onLangRetry} />
            </div>)}
          {showHi && <p className={styles.caveat} role="note">{t('caveat', 'hi')}</p>}
          {subText && <p className={`${styles.kv} mono`}><b>{t('subLabel', effLang)}</b> {subText}</p>}
          {parsed.refLine && <p className={`${styles.kv} mono`}><b>{t('refLabel', effLang)}</b> {parsed.refLine}</p>}
          <ol className={styles.points}>
            {parsed.contentBlocks.map((b, i) => (
              <li key={i} className={styles.point}>
                {pointText(i, b)}{' '}
                {b.citations.map(n => byN.get(n)).filter((s): s is SourceView => Boolean(s))
                  .map(s => <CitationChip key={s.chunk_id + s.n} source={s} onOpen={onCite} />)}
              </li>
            ))}
          </ol>
          <p className={styles.close}>{t('reviewClose', effLang)}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.btnSolid} onClick={handleCopy}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
              {t('copyNote', effLang)}
            </button>
            <button type="button" className={styles.btn} onClick={handleExport}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12M8 11l4 4 4-4M5 21h14" />
              </svg>
              {t('export', effLang)}
            </button>
            <span aria-live="polite" className={styles.liveHint}>{copied ? t('copied', effLang) : ''}</span>
          </div>
        </div>
      </div>
    </details>
  );
}
