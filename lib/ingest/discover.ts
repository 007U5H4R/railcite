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
  { id: `${TC_ROOT_ID},1796`, label: 'Claims Circulars',                    domain: null,       verified: false },
  { id: `${TC_ROOT_ID},2187`, label: 'Passenger Marketing Letters',         domain: 'coaching', verified: false },
  { id: `${TC_ROOT_ID},2274`, label: 'TC Master Circular - Halt Stations',  domain: null,       verified: false },
  { id: `${TC_ROOT_ID},3062`, label: 'Important Policy Measures',           domain: 'goods',    verified: false },
];

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
  return children.filter(c => c.year === y || c.year === y - 1).map(c => c.id);
}
