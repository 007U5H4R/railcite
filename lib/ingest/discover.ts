/**
 * Discovery for the daily incremental crawl.
 *
 * Pure: no network, no DB. Everything here is a function of HTML text, so the
 * whole crawl surface is unit-testable against saved fixtures of the real pages.
 *
 * Two site facts drive this module (spec §3):
 *   1. Every page embeds the whole site navigation (~200 `view_section.jsp?id=`
 *      links). Real children are identified by ID PREFIX — a child's id starts
 *      with the parent's id plus a comma. Measured on Freight Marketing: 201 id
 *      links on the page, 31 true children.
 *   2. Href quoting is inconsistent. `rate-letter.jsp` uses single quotes, so a
 *      /href="([^"]+)"/ matcher finds 0 of its 80 PDFs. The matcher below accepts
 *      double, single and unquoted forms.
 */

export type SectionDomain = 'goods' | 'coaching' | null;

export interface Section {
  id: string;
  label: string;
  domain: SectionDomain;
  /** true = mapping corroborated against documents already in the corpus. */
  verified: boolean;
}

export const TC_ROOT_ID = '0,1,304,366,555';
export const SECTION_BASE = 'https://indianrailways.gov.in/railwayboard/view_section.jsp';

/**
 * Traffic Commercial content sections. `verified` records how much we actually
 * know: a wrong domain here silently mis-scopes an entire series, which is the
 * defect the domain backfill was written to fix. Unverified rows must be
 * spot-checked against a real document before the first live run; anything
 * still doubtful becomes null rather than a guess.
 */
export const SECTIONS: Section[] = [
  { id: `${TC_ROOT_ID},737`,  label: 'Commercial Circular',                 domain: 'coaching', verified: true  },
  { id: `${TC_ROOT_ID},862`,  label: 'Freight Marketing Circulars',         domain: 'goods',    verified: true  },
  { id: `${TC_ROOT_ID},765`,  label: 'Freight Rate Circulars',              domain: 'goods',    verified: true  },
  { id: `${TC_ROOT_ID},787`,  label: 'Rates Letters',                       domain: 'goods',    verified: true  },
  { id: `${TC_ROOT_ID},1430`, label: 'Rates Master Circulars',              domain: 'goods',    verified: false },
  { id: `${TC_ROOT_ID},788`,  label: 'Freight Rates',                       domain: 'goods',    verified: false },
  { id: `${TC_ROOT_ID},860`,  label: 'Classification of Commodities',       domain: 'goods',    verified: false },
  { id: `${TC_ROOT_ID},861`,  label: 'Notified PCC Routes',                 domain: 'goods',    verified: false },
  { id: `${TC_ROOT_ID},1913`, label: 'Compendium Goods Traffic',            domain: 'goods',    verified: false },
  { id: `${TC_ROOT_ID},1796`, label: 'Claims Circulars',                    domain: null,       verified: false },
  { id: `${TC_ROOT_ID},2187`, label: 'Passenger Marketing Letters',         domain: 'coaching', verified: false },
  { id: `${TC_ROOT_ID},2274`, label: 'TC Master Circular - Halt Stations',  domain: null,       verified: false },
  { id: `${TC_ROOT_ID},3062`, label: 'Important Policy Measures',           domain: 'goods',    verified: false },
];

/**
 * Live Traffic Commercial children we deliberately DO NOT crawl. They exist on the site but are
 * outside RailCite's rates-and-circulars corpus, so the monthly structural walk must treat them as
 * expected, not as drift. Each is here for a reason, not by omission:
 */
export const EXCLUDED_SECTION_IDS = new Set<string>([
  `${TC_ROOT_ID},1615`, // "TestPage" — a test page, not content
  `${TC_ROOT_ID},2545`, // "bkup" — a backup folder
  `${TC_ROOT_ID},3173`, // "Archive" — would only re-surface old documents
  `${TC_ROOT_ID},3045`, // "Public Grievances" — grievances, not circulars
  `${TC_ROOT_ID},1608`, // "RCT" (Railway Claims Tribunal) — tribunal orders, not rate circulars
  `${TC_ROOT_ID},2548`, // "MOU and Gazette Notifications" — outside the circular corpus
]);

export function sectionUrl(id: string): string {
  return `${SECTION_BASE}?lang=0&id=${id}`;
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ');
const clean = (s: string) => stripTags(s).replace(/\s+/g, ' ').trim();

/** Accepts href="x" | href='x' | href=x — see module note 2. */
const HREF = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

export function extractPdfLinks(html: string, baseUrl: string): { url: string; title: string }[] {
  const out = new Map<string, string>();
  for (const m of html.matchAll(ANCHOR)) {
    const attrs = m[1];
    const h = [...attrs.matchAll(HREF)][0];
    if (!h) continue;
    const raw = (h[1] ?? h[2] ?? h[3] ?? '').trim();
    if (!/\.pdf(\?|#|$)/i.test(raw)) continue;
    let url: string;
    try { url = new URL(raw, baseUrl).toString(); } catch { continue; }
    if (!out.has(url)) out.set(url, clean(m[2]));
  }
  return [...out].map(([url, title]) => ({ url, title }));
}

export function extractChildSections(
  html: string, parentId: string,
): { id: string; label: string; year: number | null }[] {
  const seen = new Map<string, string>();
  for (const m of html.matchAll(ANCHOR)) {
    const h = [...m[1].matchAll(HREF)][0];
    if (!h) continue;
    const raw = h[1] ?? h[2] ?? h[3] ?? '';
    if (!/view_section\.jsp/i.test(raw)) continue;
    const idm = raw.match(/id=([0-9,]+)/);
    if (!idm) continue;
    const id = idm[1];
    if (!id.startsWith(parentId + ',')) continue;      // nav chrome filtered here
    if (id.slice(parentId.length + 1).includes(',')) continue;  // direct children only
    if (!seen.has(id)) seen.set(id, clean(m[2]));
  }
  return [...seen].map(([id, label]) => {
    const y = label.match(/(19|20)\d{2}/);
    return { id, label, year: y ? Number(y[0]) : null };
  });
}

/**
 * Which child year-pages the DAILY sweep visits.
 *
 * Only current and previous year. New circulars land in the current-year page;
 * previous year covers a January filing and late filing. Sweeping every year
 * page of every section would be ~300 fetches a night for no benefit — the
 * monthly structural walk is what covers the rest (spec §5).
 */
export function selectSweepChildren(
  children: { id: string; label: string; year: number | null }[],
  now: Date,
): string[] {
  const y = now.getUTCFullYear();
  // A year-labelled child is worth visiting only for the current or previous year — older
  // years are already fully in the corpus. A child with NO year is a subject page (e.g. Rates
  // Master's "Demurrage, Wharfage..." topics); its circulars are not partitioned by year, so a
  // new one can land there at any time and it must always be swept. The URL diff + date floor
  // still filter, so an extra sweep costs a page fetch, not a wrong ingest.
  return children
    .filter(c => c.year === null || c.year === y || c.year === y - 1)
    .map(c => c.id);
}

// --- Delta computation and safety guards (Task 3) ---

import { canonicalUrl } from '../../scripts/ingest-crawl';

export interface Discovered { source_url: string; title: string; domain: SectionDomain }

/** Structural surprise: the site changed shape, or the delta is implausible. */
export class DriftError extends Error {
  constructor(message: string) { super(message); this.name = 'DriftError'; }
}

/** Decode a URL safely (some source URLs contain malformed % sequences that throw). */
function safeDecode(u: string): string { try { return decodeURIComponent(u); } catch { return u; } }

/** The corpus identity key for a PDF: its decoded, lowercased basename. Two links to the same
 *  file under different folder paths / encodings share this key even when their canonical URLs
 *  differ (the corpus was seeded from a different crawl than the daily job reads). */
export function basenameKey(url: string): string {
  return safeDecode(url).split('/').pop()!.toLowerCase();
}

/** RailCite's corpus is the Traffic Commercial directorate only. Section pages cross-link PDFs
 *  from other directorates (civil_engg, vigilance, ...) in their nav; those are out of scope. */
export function isTrafficCommercial(url: string): boolean {
  return /\/directorate\/traffic_comm\//i.test(url);
}

/**
 * New documents only. A doc is already held if its canonical URL matches, OR its filename matches
 * an existing document — the corpus and the CMS disagree on URL form, so URL-only comparison
 * treats hundreds of already-held files as new. Canonicalises before comparing and stores the
 * canonical url (what documents.source_url holds).
 */
export function computeDelta(found: Discovered[], knownUrls: Set<string>, knownFilenames: Set<string>): Discovered[] {
  const out = new Map<string, Discovered>();
  for (const f of found) {
    const url = canonicalUrl(f.source_url);
    if (knownUrls.has(url) || knownFilenames.has(basenameKey(url)) || out.has(url)) continue;
    out.set(url, { ...f, source_url: url });
  }
  return [...out.values()];
}

/** A section that lists nothing has moved or changed shape. Fail, never shrug. */
export function assertSectionProductive(label: string, pdfCount: number): void {
  if (pdfCount === 0) {
    throw new DriftError(
      `section "${label}" yielded 0 PDF links — the page has moved or changed shape. ` +
      `Re-derive the section table (spec §5) rather than treating this as "no new circulars".`);
  }
}

/** Refuse to mass-ingest on an unexplained flood. */
export function assertDeltaSane(deltaCount: number, max: number): void {
  if (deltaCount > max) {
    throw new DriftError(
      `discovery found ${deltaCount} new documents (ceiling ${max}). Something upstream ` +
      `changed; refusing to bulk-ingest unreviewed documents into a citable corpus.`);
  }
}

/**
 * Compare the live child sections of Traffic Commercial against the configured
 * table. Run monthly. Lists only — downloads no PDFs — so it costs a handful of
 * page fetches and nothing else.
 */
export function diffSectionTable(
  liveChildIds: string[],
  configured: Section[],
  excluded: Set<string> = new Set(),
): { added: string[]; removed: string[] } {
  const live = new Set(liveChildIds);
  const known = new Set(configured.map(s => s.id));
  return {
    added: [...live].filter(id => !known.has(id) && !excluded.has(id)),
    removed: [...known].filter(id => !live.has(id)),
  };
}

/** A structure change must interrupt a human — see the 2011 rot in spec §5. */
export function assertSectionTableCurrent(diff: { added: string[]; removed: string[] }): void {
  if (diff.added.length || diff.removed.length) {
    throw new DriftError(
      `Traffic Commercial section structure changed — added: [${diff.added.join(', ')}], ` +
      `removed: [${diff.removed.join(', ')}]. Update SECTIONS in lib/ingest/discover.ts ` +
      `deliberately, including the domain mapping for anything new.`);
  }
}
