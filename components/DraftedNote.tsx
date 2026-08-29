'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ConclusionBlock, SourceView } from '@/lib/types';
import { CitationChip } from './CitationChip';
import { analytics } from '@/lib/analytics';
import { STRUCTURAL } from '@/lib/validate';
import styles from './DraftedNote.module.css';

// synthesize.ts's SYSTEM_PROMPT opens the note with "Sub:"/"Ref:" lines and closes with
// "Submitted for consideration." — lib/validate.ts lets those structural blocks through with
// zero citations, and now EXPORTS the STRUCTURAL regex we reuse here (single source of truth,
// so the two can't drift) to keep the numbered body below to the substantive, cited points.
// The "Ref:" line is NOT taken from the model's own prose (unverified free text) — it's rebuilt
// from real SourceView data, so it can never cite something ungrounded.

function stripSubLabel(text: string): string {
  return text.trim().replace(/^sub:\s*/i, '').trim();
}

// One citation, formatted "circular/para/page" — e.g. "TCR/1078/2019 (p. 4)" or, once
// section_ref is populated by ingest, "IRCM Vol. II — Para 2511 (p. 178–179)". Shared by the
// on-screen Ref: line and the Copy/Export footer so both stay identical.
function formatCitation(s: SourceView): string {
  const d = s.document;
  const identity = d.circular_no ?? d.title;
  const withSection = s.section_ref ? `${identity} — ${s.section_ref}` : identity;
  return s.page_ref ? `${withSection} (${s.page_ref})` : withSection;
}

interface ParsedNote {
  sub: string | null;
  contentBlocks: ConclusionBlock[];
  citedSources: SourceView[];   // ascending by n, deduped — only sources an [n] marker points to
  refLine: string | null;
}

function parseNote(note: ConclusionBlock[], sources: SourceView[]): ParsedNote {
  const byN = new Map(sources.map(s => [s.n, s]));
  const subBlock = note.find(b => /^sub:/i.test(b.text.trim()));
  const sub = subBlock ? stripSubLabel(subBlock.text) || null : null;
  // Defense in depth (mirrors ConclusionCard): drop structural lines and any block that
  // slipped through validation without a real citation — extractive-only, every point here
  // must trace to a source.
  const contentBlocks = note.filter(b => !STRUCTURAL.test(b.text.trim()) && b.citations.length > 0);
  const citedNs = [...new Set(contentBlocks.flatMap(b => b.citations))]
    .filter(n => byN.has(n)).sort((a, b) => a - b);
  const citedSources = citedNs.map(n => byN.get(n)!);
  const refLine = citedSources.length ? citedSources.map(formatCitation).join(' · ') : null;
  return { sub, contentBlocks, citedSources, refLine };
}

// Plain-text rendering shared by Copy and Export — provenance-complete: the Ref line, each
// numbered point with its inline [n] marks intact, and a footer resolving every [n] back to
// its circular/para/page (R5: citation provenance must survive the clipboard).
export function buildNoteText(note: ConclusionBlock[], sources: SourceView[]): string {
  const { sub, contentBlocks, citedSources, refLine } = parseNote(note, sources);
  const lines: string[] = [];
  if (sub) lines.push(`Sub: ${sub}`);
  if (refLine) lines.push(`Ref: ${refLine}`);
  if (lines.length) lines.push('');
  contentBlocks.forEach((b, i) => {
    const marks = b.citations.map(n => `[${n}]`).join('');
    lines.push(`${i + 1}. ${b.text}${marks ? ` ${marks}` : ''}`);
  });
  lines.push('', 'Assembled from the cited passages — review before submitting.');
  if (citedSources.length) {
    lines.push('', 'Sources:');
    citedSources.forEach(s => lines.push(`[${s.n}] ${formatCitation(s)}`));
  }
  return lines.join('\n');
}

// The drafted justification note (Phase 4a). The backend already generates `note` alongside
// the cited conclusion (see lib/synthesize.ts); this only renders it. A native <details> so
// the disclosure is keyboard/AT-operable for free — open by default, matching the mockup.
// Citation chips reuse CitationChip verbatim and share CaseConsole's onCite handler so
// clicking [n] here highlights the same source card as clicking [n] in the conclusion does.
export function DraftedNote({ note, sources, onCite }: {
  note: ConclusionBlock[]; sources: SourceView[]; onCite: (s: SourceView) => void;
}) {
  const [copied, setCopied] = useState(false);
  const byN = useMemo(() => new Map(sources.map(s => [s.n, s])), [sources]);
  const parsed = useMemo(() => parseNote(note, sources), [note, sources]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  // Nothing citable survived (e.g. the model only returned structural lines) — an
  // uncited "note" would violate extractive-only, so render nothing rather than a shell.
  if (!parsed.contentBlocks.length) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildNoteText(note, sources));
      setCopied(true);
      analytics.draftNoteCopied();
    } catch {
      /* clipboard unavailable/denied — non-blocking, just no confirmation */
    }
  };

  const handleExport = () => {
    const blob = new Blob([buildNoteText(note, sources)], { type: 'text/plain;charset=utf-8' });
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
          Drafted justification note
          <small className={styles.subtext}>assembled from the cited passages — review before submitting</small>
        </span>
        <span className={styles.chevron} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </summary>
      <div className={styles.docWrap}>
        <div className={styles.docInner}>
          {parsed.sub && <p className={`${styles.kv} mono`}><b>Sub:</b> {parsed.sub}</p>}
          {parsed.refLine && <p className={`${styles.kv} mono`}><b>Ref:</b> {parsed.refLine}</p>}
          <ol className={styles.points}>
            {parsed.contentBlocks.map((b, i) => (
              <li key={i} className={styles.point}>
                {b.text}{' '}
                {b.citations.map(n => byN.get(n)).filter((s): s is SourceView => Boolean(s))
                  .map(s => <CitationChip key={s.chunk_id + s.n} source={s} onOpen={onCite} />)}
              </li>
            ))}
          </ol>
          <p className={styles.close}>Assembled from the cited passages — review before submitting.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.btnSolid} onClick={handleCopy}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
              Copy note
            </button>
            <button type="button" className={styles.btn} onClick={handleExport}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12M8 11l4 4 4-4M5 21h14" />
              </svg>
              Export
            </button>
            <span aria-live="polite" className={styles.liveHint}>{copied ? 'Copied ✓' : ''}</span>
          </div>
        </div>
      </div>
    </details>
  );
}
