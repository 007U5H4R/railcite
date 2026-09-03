/**
 * Derives a unique, citable circular label from a document's own source URL.
 *
 * WHY: `circular_no` is NULL across the crawled corpus, so the UI falls back to `title` —
 * and titles came from filenames. The result is 556 titles shared by 2,822 documents:
 * "FM-01" is fourteen different circulars (2007, 2011, 2012, 2013…), "CC-10" is eighteen.
 * An officer clicking one source card and opening a different year's PDF is exactly the
 * traceability failure reported against FM-01.
 *
 * The Board's own filing gives us both halves: the series folder (Commercial Circular /
 * Freight Marketing / Freight Rate) and the year (folder or filename, including the "2k8"
 * shorthand it used through the 2000s).
 *
 * Returns null when the URL does not yield BOTH a number and a year — a half-guessed label
 * is worse than the honest title fallback.
 */

export type Series = 'CC' | 'FM' | 'RC';

const SERIES_FROM_FOLDER: [RegExp, Series][] = [
  [/comm[-_ ]?cir|commercial[-_ ]?circulars?|comml[-_ ]?cir|\bCC[-_]\d{4}/i, 'CC'],
  [/freight[-_ ]?marke?t+ing|fr[e]?ght[-_ ]?mktg|freight[-_ ]?mktg|\bFM[-_ ]?\d{4}\b/i, 'FM'],
  [/freight[-_ ]?rate/i, 'RC'],
];

/**
 * Separators in these filenames are a mix of `-`, `_`, `.` and %20. Underscore is a word
 * character, so `\b` does not fire inside `CC-73_2016` — normalise to spaces first and every
 * boundary behaves.
 */
const norm = (t: string) => t.replace(/[^0-9A-Za-z]+/g, ' ').trim();

/** "2016" -> 2016; "2k8" -> 2008; "2K12" -> 2012. The Board used both forms. */
function readYear(token: string): number | null {
  const t = norm(token);
  const full = t.match(/\b(19|20)\d{2}\b/);
  if (full) return Number(full[0]);
  const k = t.match(/\b2[kK](\d{1,2})\b/);
  if (k) return 2000 + Number(k[1]);
  return null;
}

export function deriveCircularNo(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null;
  let url = sourceUrl;
  try { url = decodeURIComponent(sourceUrl); } catch { /* fall through with the raw string */ }

  const parts = url.split('/').filter(Boolean);
  const file = parts[parts.length - 1] ?? '';
  const folder = parts[parts.length - 2] ?? '';
  const stem = file.replace(/\.pdf$/i, '');

  const stemN = norm(stem);

  // Series: prefer an explicit prefix in the filename, else infer from the folder it is filed under.
  let series: Series | null = null;
  const filePrefix = stemN.match(/\b(CC|FM|RC)\b/i);
  if (filePrefix) series = filePrefix[1].toUpperCase() as Series;
  if (!series) {
    for (const [re, s] of SERIES_FROM_FOLDER) if (re.test(folder)) { series = s; break; }
  }
  if (!series) return null;

  // Year: the filename is more specific than the folder (a 2016 folder can hold a 2015
  // circular republished), so read it first.
  const year = readYear(stem) ?? readYear(folder);
  if (!year) return null;

  // Number: the digits attached to the series token, ignoring the year we just consumed.
  // Handles CC-73, CC_63, CC-No_61, FM 01 of 2023, FM_1, RC_08.
  const stemNoYear = stemN
    .replace(new RegExp(`\\b${year}\\b`, 'g'), ' ')
    .replace(/\b2[kK]\d{1,2}\b/g, ' ');
  const numMatch =
    stemNoYear.match(new RegExp(`${series}[^0-9A-Za-z]*(?:No[^0-9A-Za-z]*)?(\\d{1,3})\\b`, 'i')) ??
    stemNoYear.match(/\b(?:No|Circular)[^0-9A-Za-z]*(\d{1,3})\b/i);
  if (!numMatch) return null;

  const num = Number(numMatch[1]);
  if (!Number.isFinite(num) || num <= 0 || num > 999) return null;

  return `${series}-${String(num).padStart(2, '0')} / ${year}`;
}
