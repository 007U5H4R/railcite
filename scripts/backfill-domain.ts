/**
 * backfill-domain.ts — derive `documents.domain` from the Railway Board's own folder taxonomy.
 *
 * WHY: the bulk crawl wrote domain='goods' for every document (5,685 of 5,687), so the
 * `match_chunks(filter_domain)` hard filter could never discriminate — a Coaching query
 * still retrieved Freight-Marketing circulars. Domain has to come from something real.
 *
 * The Board publishes under stable directorate folders, so the URL path *is* the metadata:
 *   Commercial Circulars  (comm-cir / Comm_Cir / commercial-circulars / CC-2019 …) -> coaching
 *   Freight Marketing / Freight Rate / Rates Master / Rates-Letters / tariff        -> goods
 *   anything we cannot place from the path                                          -> null
 *
 * NULL is deliberate, not laziness: an unclassified document still appears under
 * "Commercial Domain" (filter_domain is null) but never under Goods or Coaching. We would
 * rather under-claim a domain than assert a wrong one — same principle as cite-or-refuse.
 *
 * Content/title heuristics are intentionally NOT used: the path is deterministic and
 * auditable, a keyword guess is neither.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-domain.ts          # dry run (default)
 *   npx tsx --env-file=.env.local scripts/backfill-domain.ts --apply  # write
 */
import { pathToFileURL } from 'node:url';
import { adminClient } from '@/lib/db';

// adminClient() is called lazily inside main(): `classifyDomain` is a pure function and must
// stay importable (by the unit test, or by the ingest path) without env vars present.

export type Domain = 'goods' | 'coaching' | null;

// Commercial Circulars — the coaching/passenger commercial series, in every casing the
// Board has used since 1999 (comm-cir-2k7, Comm_Cir_2018, commercial-circulars2k6, CC-2019…).
const COACHING = /(comm[-_ ]?cir|commercial[-_ ]?circulars?|comml[-_ ]?cir|\bCC[-_]\d{4}|passenger[-_ ]?information)/i;

// Freight: marketing circulars, rate circulars, the Rates Master Circular family and its
// letters, plus goods tariffs. Matches nested paths too (downloads/Freight_Rate_2019/…).
// `FM_2021` is included because some years are filed under the bare series folder with no
// spelt-out "Freight Marketing" anywhere in the path.
const GOODS = /(freight[-_ ]?rate|freight[-_ ]?marke?t+ing|fr[e]?ght[-_ ]?mktg|freight[-_ ]?mktg|\bFM[-_ ]?\d{4}\b|rates?[-_ ]?master|rates?[-_ ]?letters?|\bRMC\b|compendium[-_ ]?goods|tariff)/i;

/** Derive domain from the document's own URL/path. Exported for the unit test. */
export function classifyDomain(sourceUrl: string | null, filePath: string | null): Domain {
  const raw = sourceUrl || filePath || '';
  if (!raw) return null;
  let path = raw;
  try { path = decodeURIComponent(raw); } catch { /* keep raw if it is not valid %-encoding */ }

  // Coaching is checked first: a Commercial Circular folder never also names a freight series,
  // but a few CC filenames mention "freight" in their subject line.
  if (COACHING.test(path)) return 'coaching';
  if (GOODS.test(path)) return 'goods';
  return null;
}

async function main() {
  const apply = process.argv.includes('--apply');

  const PAGE = 1000;
  let from = 0;
  const docs: { id: string; source_url: string | null; file_path: string | null; domain: string | null }[] = [];
  for (;;) {
    const { data, error } = await adminClient().from('documents')
      .select('id,source_url,file_path,domain').range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    docs.push(...(data as typeof docs));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const next = new Map<string, Domain>();
  const tally: Record<string, number> = { goods: 0, coaching: 0, null: 0 };
  let changed = 0;
  for (const d of docs) {
    const dom = classifyDomain(d.source_url, d.file_path);
    next.set(d.id, dom);
    tally[dom ?? 'null']++;
    if ((d.domain ?? null) !== dom) changed++;
  }

  console.log(`scanned ${docs.length} documents`);
  console.log(`→ goods ${tally.goods} · coaching ${tally.coaching} · null ${tally.null}`);
  console.log(`→ ${changed} rows would change`);

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to persist.');
    return;
  }

  // Group by target value so this is 3 updates, not 5,687.
  for (const target of ['goods', 'coaching', null] as Domain[]) {
    const ids = docs.filter(d => next.get(d.id) === target && (d.domain ?? null) !== target).map(d => d.id);
    for (let i = 0; i < ids.length; i += 500) {
      const slice = ids.slice(i, i + 500);
      const { error } = await adminClient().from('documents').update({ domain: target }).in('id', slice);
      if (error) throw new Error(`update ${target}: ${error.message}`);
      process.stdout.write(`  ${target ?? 'null'}: ${Math.min(i + 500, ids.length)}/${ids.length}\r`);
    }
    if (ids.length) console.log(`  ${target ?? 'null'}: ${ids.length} updated`);
  }
  console.log('done.');
}

// Only run when invoked directly (`tsx scripts/backfill-domain.ts`). Importing this module
// for `classifyDomain` must not open a DB connection or mutate anything.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch(e => { console.error(e); process.exit(1); });
