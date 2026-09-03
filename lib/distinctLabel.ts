/**
 * Builds a distinguishing, citable label for documents that would otherwise share one.
 *
 * WHY: the source-integrity backfill (lib/circularNo.ts) derived circular_no from the
 * series + year in a document's URL. That fixed "FM-01 means fourteen circulars", but it
 * COLLAPSED families the title used to separate — all 27 corrigenda to RC-62 of 2009 became
 * the single label "RC-62 / 2009" — and it did nothing for the rate letters filed under one
 * Board file number (TC-I/2005/108/3 covers 37 distinct letters). 1,492 documents still
 * display a label shared by at least one other: the exact traceability failure the backfill
 * set out to remove.
 *
 * The distinguisher is drawn from the document's OWN filename (always present, and unique to
 * the document across this corpus once duplicates were removed): the corrigendum / correction
 * number when it is a corrigendum, else a date parsed from the filename, else the document's
 * stored issue_date, else — only to break a residual tie — the humanised filename stem. No
 * value is invented: every distinguisher is read from the document's URL or its own date.
 *
 * The base identifier and the group logic live in the backfill script; this module is the
 * pure, per-document derivation so it can be unit-tested against real filenames.
 */

export interface LabelDoc {
  circular_no: string | null;
  title: string | null;
  source_url: string | null;
  issue_date: string | null;   // ISO 'YYYY-MM-DD' or null
}

/** Decoded last path segment with the .pdf extension removed. '' when there is no url. */
export function filenameStem(sourceUrl: string | null): string {
  if (!sourceUrl) return '';
  let url = sourceUrl;
  try { url = decodeURIComponent(sourceUrl); } catch { /* raw */ }
  const seg = url.split('/').filter(Boolean).pop() ?? '';
  return seg.replace(/\.pdf$/i, '');
}

/** Humanised filename stem for the last-resort unique tag: "RC_62_09_Corrigendum-25" -> "rc 62 09 corrigendum 25". */
export function humanStem(sourceUrl: string | null): string {
  return filenameStem(sourceUrl).replace(/[^0-9A-Za-z]+/g, ' ').trim().toLowerCase();
}

/**
 * The filename stem with tokens the base already carries removed, so a tie-break label reads
 * "RC-20 / 2018 · corri 4" instead of "RC-20 / 2018 · corri 4 rc 20 2018". Falls back to the
 * full stem if reduction empties it (nothing but base tokens in the name).
 */
export function reducedStem(base: string, sourceUrl: string | null): string {
  const baseTokens = new Set(base.replace(/[^0-9A-Za-z]+/g, ' ').trim().toLowerCase().split(' ').filter(Boolean));
  const kept = humanStem(sourceUrl).split(' ').filter(w => w && !baseTokens.has(w));
  return kept.length ? kept.join(' ') : humanStem(sourceUrl);
}

/** "Corrigendum-25", "corri_44", "Corr. Slip 3", "Correction Slip-2" -> a compact "Corr-25" tag. */
function corrigendumTag(text: string): string | null {
  const t = text.replace(/[_%]+/g, ' ');
  // Correction slip is its own series; keep it distinct from a corrigendum.
  const slip = t.match(/corr(?:ection)?[.\s-]*slip[.\s#-]*(\d{1,3})\b/i);
  if (slip) return `CS-${Number(slip[1])}`;
  const corr = t.match(/corr(?:igendum|igenda|i|)[.\s#_-]*(?:no[.\s#_-]*)?(\d{1,3})\b/i);
  if (corr) return `Corr-${Number(corr[1])}`;
  // A corrigendum with no number at all still deserves the marker (rare, but real).
  if (/\bcorrigend|\bcorri[\s_-]|\bcorr[.\s-]*slip/i.test(t)) return 'Corr';
  return null;
}

const clampYear = (yy: number) => (yy <= 79 ? 2000 + yy : 1900 + yy);
const valid = (d: number, m: number) => d >= 1 && d <= 31 && m >= 1 && m <= 12;
const fmt = (d: number, m: number, y: number) =>
  `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;

/**
 * A date read from the filename — the reliable per-document signal for the file-number series,
 * where the STORED issue_date is often a crawl artefact (37 letters all stamped 03.04.2023).
 * Board filenames spell dates as DD.MM.YYYY, dt_DDMMYY, or a trailing _DDMMYY. Indian
 * convention is day-first; ranges are validated so a stray number is not misread as a date.
 */
export function dateFromFilename(sourceUrl: string | null): string | null {
  const stem = filenameStem(sourceUrl);
  if (!stem) return null;

  // 1. Explicit separated date: 30.04.2010, 23_02_2026, dt-27-01-2023, dt_30_06_11
  const sep = stem.match(/(?:^|[^0-9])(\d{1,2})[._-](\d{1,2})[._-]((?:19|20)\d{2}|\d{2})(?![0-9])/);
  if (sep) {
    const d = +sep[1], m = +sep[2];
    const y = sep[3].length === 4 ? +sep[3] : clampYear(+sep[3]);
    if (valid(d, m)) return fmt(d, m, y);
  }

  // 2. Compact trailing date: EIMWB_280113, Weighbridge_301013, _dt_290711 -> DDMMYY(YY)
  const compact = [...stem.matchAll(/(?:^|[^0-9])(\d{6}|\d{8})(?![0-9])/g)];
  for (const c of compact) {
    const s = c[1];
    const d = +s.slice(0, 2), m = +s.slice(2, 4);
    const y = s.length === 8 ? +s.slice(4) : clampYear(+s.slice(4));
    if (valid(d, m) && y >= 1990 && y <= 2100) return fmt(d, m, y);
  }
  return null;
}

/** Stored issue_date as DD.MM.YYYY, or null. Used only after filename signals are exhausted. */
function issueDateTag(iso: string | null): string | null {
  const m = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null;
}

/**
 * The preferred human distinguisher for a document, or null when none is available.
 * Priority: corrigendum/slip number → date in filename → stored issue_date. The filename-stem
 * fallback is NOT here — it is applied by the backfill only when a preferred tag still leaves a
 * collision, so clean labels are not littered with raw filenames unnecessarily.
 */
export function distinctSuffix(doc: LabelDoc): string | null {
  const stem = filenameStem(doc.source_url);
  const corr = corrigendumTag(`${doc.title ?? ''} ${stem}`);
  if (corr) return corr;
  return dateFromFilename(doc.source_url) ?? issueDateTag(doc.issue_date);
}

/** Strip a distinguisher this module previously appended, so re-runs recompute from a clean base. */
export function stripSuffix(label: string | null): string | null {
  if (!label) return label;
  return label.replace(/\s+·\s+.*$/, '').trim() || null;
}
