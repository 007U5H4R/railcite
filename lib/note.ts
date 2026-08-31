import type { ConclusionBlock, SourceView } from './types';
import { STRUCTURAL } from './validate';
import { t, type Language } from './i18n';

// Shared, pure justification-note structure. Used by BOTH components/DraftedNote (rendering,
// Copy/Export) AND app/api/translate (to know which blocks are substantive prose worth
// translating, and to keep the Hindi content index-aligned with what DraftedNote renders).
// Keeping the structure in one place means the two can't drift.
//
// Trust invariants preserved here: the "Ref:" line is rebuilt from real SourceView data (never
// the model's free prose), and only blocks that carry a real citation are treated as content —
// extractive-only, every rendered point traces to a source.

export function stripSubLabel(text: string): string {
  return text.trim().replace(/^sub:\s*/i, '').trim();
}

// The model echoes its citations inline ("…Rs.300/- [5].") AND we render the authoritative
// citations as chips from `b.citations` — so the reader saw "…Rs.300/- [5]. [5]" on screen and in
// the copied note. The chips/marks are the trust anchor; the prose echo is a duplicate. Strip it
// from the PROSE only — never from the Ref line, the Sources footer, or `citations` itself.
export function stripInlineCitations(text: string): string {
  return text
    .replace(/\s*(?:\[\d+\]\s*)+(?=[.,;:।]|$)/g, '')   // trailing run, before terminal punctuation
    .replace(/\s*(?:\[\d+\]\s*)+/g, ' ')                // any remaining mid-sentence run
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// The model often numbers its own note points ("1. Free time is…"), which the <ol> then numbers
// again — rendering "1. 1. Free time is…" on screen and in the exported document.
export function stripLeadingNumber(text: string): string {
  return text.replace(/^\s*\(?\d{1,2}[.)]\s+/, '').trim();
}

/** Prose as it should be READ: no duplicated citation echo, no duplicated list number. */
export function displayText(text: string): string {
  return stripLeadingNumber(stripInlineCitations(text));
}

// One citation, formatted "circular/para/page" — shared by the on-screen Ref: line and the
// Copy/Export footer so both stay identical. Never translated: these are source identities.
export function formatCitation(s: SourceView): string {
  const d = s.document;
  const identity = d.circular_no ?? d.title;
  const withSection = s.section_ref ? `${identity} — ${s.section_ref}` : identity;
  return s.page_ref ? `${withSection} (${s.page_ref})` : withSection;
}

export interface ParsedNote {
  sub: string | null;
  contentBlocks: ConclusionBlock[];   // cited, non-structural — in note order
  citedSources: SourceView[];         // ascending by n, deduped — only sources an [n] points to
  refLine: string | null;
}

export function parseNote(note: ConclusionBlock[], sources: SourceView[]): ParsedNote {
  const byN = new Map(sources.map(s => [s.n, s]));
  const subBlock = note.find(b => /^sub:/i.test(b.text.trim()));
  const sub = subBlock ? stripSubLabel(subBlock.text) || null : null;
  const contentBlocks = note.filter(b => !STRUCTURAL.test(b.text.trim()) && b.citations.length > 0);
  const citedNs = [...new Set(contentBlocks.flatMap(b => b.citations))]
    .filter(n => byN.has(n)).sort((a, b) => a - b);
  const citedSources = citedNs.map(n => byN.get(n)!);
  const refLine = citedSources.length ? citedSources.map(formatCitation).join(' · ') : null;
  return { sub, contentBlocks, citedSources, refLine };
}

// Hindi overrides for the note, index-aligned to parseNote(note, sources): `sub` is the Hindi
// subject VALUE (no label); `content[i]` is the Hindi of contentBlocks[i].text. Passing these
// keeps the labels/close-line localized while the Ref line, [n] marks and Sources footer stay
// verbatim — provenance survives the clipboard in Hindi.
export interface NoteHindi { sub: string | null; content: string[] }

// Plain-text rendering shared by Copy and Export. `lang`/`hi` optional; English by default so
// existing callers are unchanged.
export function buildNoteText(
  note: ConclusionBlock[], sources: SourceView[], lang: Language = 'en', hi?: NoteHindi,
): string {
  const { sub, contentBlocks, citedSources, refLine } = parseNote(note, sources);
  const subText = displayText(lang === 'hi' && hi ? (hi.sub || sub || '') : (sub ?? '')) || null;
  // `||` not `??`: an empty Hindi item must fall back to the English text, not blank the point.
  const pointText = (i: number, b: ConclusionBlock) =>
    displayText(lang === 'hi' && hi ? (hi.content[i] || b.text) : b.text);

  const lines: string[] = [];
  if (subText) lines.push(`${t('subLabel', lang)} ${subText}`);
  if (refLine) lines.push(`${t('refLabel', lang)} ${refLine}`);
  if (lines.length) lines.push('');
  contentBlocks.forEach((b, i) => {
    const marks = b.citations.map(n => `[${n}]`).join('');
    lines.push(`${i + 1}. ${pointText(i, b)}${marks ? ` ${marks}` : ''}`);
  });
  lines.push('', t('reviewClose', lang));
  if (citedSources.length) {
    lines.push('', t('sources', lang));
    citedSources.forEach(s => lines.push(`[${s.n}] ${formatCitation(s)}`));
  }
  return lines.join('\n');
}
