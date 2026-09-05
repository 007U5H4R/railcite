/**
 * crawl-daily.ts — the once-a-day incremental crawl.
 *
 *   list -> diff -> ingest only what is new -> record the run
 *
 * Nothing already in `documents` is re-downloaded, re-OCR'd or re-embedded:
 * the delta is computed against source_url before any network cost is paid.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/crawl-daily.ts            # dry run
 *   npx tsx --env-file=.env.local scripts/crawl-daily.ts --apply    # ingest
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import { adminClient } from '@/lib/db';
import { invalidateAnswerCache } from '@/lib/answerCache';
import { optionalEnv } from '@/lib/env';
import { ingestOne, type Entry } from './ingest-crawl';
import {
  SECTIONS, sectionUrl, extractPdfLinks, extractChildSections, selectSweepChildren,
  computeDelta, assertSectionProductive, assertDeltaSane, DriftError, type Discovered,
  isTrafficCommercial, basenameKey, TC_ROOT_ID, diffSectionTable, assertSectionTableCurrent,
  EXCLUDED_SECTION_IDS, deadFilenames, type DeadUrlRow,
} from '@/lib/ingest/discover';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) RailCite-ingest';
const THROTTLE_MS = Number(optionalEnv('CRAWL_THROTTLE_MS', '1000'));
const MAX_NEW = Number(optionalEnv('CRAWL_MAX_NEW', '50'));
const SINCE = optionalEnv('CRAWL_SINCE', '2026-08-31');

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Clear the cache only when the corpus actually changed — see the test. */
export function shouldInvalidateCache(ingested: number): boolean {
  return ingested > 0;
}

/**
 * Secondary guard only. Fails open: skip solely on clear evidence of age.
 * The URL diff is the real filter.
 */
export function passesDateFloor(issueDate: string | null, floor: string): boolean {
  if (!issueDate) return true;
  const d = Date.parse(issueDate);
  const f = Date.parse(floor);
  if (Number.isNaN(d) || Number.isNaN(f)) return true;
  return d >= f;
}

/**
 * Remember a download that failed, so the next run's delta can exclude a link the site lists but
 * no longer serves (see migration 008 + deadFilenames). Bookkeeping, not the crawl: a write error
 * here must never fail the run — it just means one dead link is retried once more, which is safe.
 */
async function recordFailure(sb: ReturnType<typeof adminClient>, url: string, message: string): Promise<void> {
  try {
    const { data } = await sb.from('dead_urls').select('fail_count').eq('url', url).maybeSingle();
    const prev = (data as { fail_count: number } | null)?.fail_count ?? 0;
    await sb.from('dead_urls').upsert({
      url, filename: basenameKey(url), fail_count: prev + 1,
      last_error: message.slice(0, 300), last_failed_at: new Date().toISOString(),
    }, { onConflict: 'url' });   // first_failed_at is omitted, so ON CONFLICT preserves it
  } catch (e) {
    console.error(`  (dead_urls record failed for ${url}: ${(e as Error).message})`);
  }
}

/**
 * A URL that downloaded fine is not dead — drop any stale skip-set row so a transient blip can
 * never blacklist a real document for good. Fail-soft for the same reason as recordFailure.
 */
async function clearFailure(sb: ReturnType<typeof adminClient>, url: string): Promise<void> {
  try { await sb.from('dead_urls').delete().eq('url', url); }
  catch (e) { console.error(`  (dead_urls clear failed for ${url}: ${(e as Error).message})`); }
}

async function fetchPage(url: string): Promise<string> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) throw new Error(`http ${res.status} for ${url}`);
    return await res.text();
  } finally { clearTimeout(to); }
}

async function discover(now: Date): Promise<{ found: Discovered[]; pages: number }> {
  const found: Discovered[] = [];
  let pages = 0;
  for (const section of SECTIONS) {
    const rootUrl = sectionUrl(section.id);
    const rootHtml = await fetchPage(rootUrl); pages++;
    await sleep(THROTTLE_MS);

    let pdfCount = 0;
    for (const l of extractPdfLinks(rootHtml, rootUrl)) {
      if (isTrafficCommercial(l.url)) { found.push({ source_url: l.url, title: l.title, domain: section.domain }); pdfCount++; }
    }

    for (const childId of selectSweepChildren(extractChildSections(rootHtml, section.id), now)) {
      const childUrl = sectionUrl(childId);
      const childHtml = await fetchPage(childUrl); pages++;
      await sleep(THROTTLE_MS);
      for (const l of extractPdfLinks(childHtml, childUrl)) {
        if (isTrafficCommercial(l.url)) { found.push({ source_url: l.url, title: l.title, domain: section.domain }); pdfCount++; }
      }
    }

    // Zero here means the page moved — never a quiet day. See spec §5.
    assertSectionProductive(section.label, pdfCount);
  }
  return { found, pages };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const sb = adminClient();
  const now = new Date();

  const { data: runRow, error: runErr } = await sb.from('crawl_runs')
    .insert({ status: 'running' }).select('id').single();
  if (runErr) console.error(`crawl_runs insert failed (run will proceed unrecorded): ${runErr.message}`);
  const runId = (runRow as { id: string } | null)?.id;

  const finish = async (patch: Record<string, unknown>) => {
    if (runId) await sb.from('crawl_runs').update({ finished_at: new Date().toISOString(), ...patch }).eq('id', runId);
  };

  try {
    // Monthly: re-derive the section table from the site so a rename cannot rot
    // silently. Costs a single page fetch and downloads nothing.
    if (now.getUTCDate() === 1 || process.argv.includes('--check-structure')) {
      const tcHtml = await fetchPage(sectionUrl(TC_ROOT_ID));
      const liveIds = extractChildSections(tcHtml, TC_ROOT_ID).map(c => c.id);
      assertSectionTableCurrent(diffSectionTable(liveIds, SECTIONS, EXCLUDED_SECTION_IDS));
      console.log('section structure unchanged');
    }

    const { found, pages } = await discover(now);

    const knownUrls = new Set<string>();
    const knownFilenames = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data } = await sb.from('documents').select('source_url').range(from, from + 999);
      const rows = (data ?? []) as { source_url: string | null }[];
      for (const r of rows) if (r.source_url) { knownUrls.add(r.source_url); knownFilenames.add(basenameKey(r.source_url)); }
      if (rows.length < 1000) break;
    }

    // Links the site lists but no longer serves (404s + repeatedly-failing files). Excluding them
    // is what stops the delta from carrying a permanent phantom backlog past the flood guard.
    const { data: deadRows } = await sb.from('dead_urls').select('filename,fail_count,last_error');
    const dead = deadFilenames((deadRows ?? []) as DeadUrlRow[]);

    const delta = computeDelta(found, knownUrls, knownFilenames, dead);
    assertDeltaSane(delta.length, MAX_NEW);

    console.log(`pages=${pages} pdfs_seen=${found.length} new=${delta.length} dead_excluded=${dead.size}`);
    if (!apply) {
      console.log('DRY RUN — nothing ingested. Re-run with --apply.');
      await finish({ status: 'ok', sections_checked: SECTIONS.length, pdfs_seen: found.length, new_found: delta.length });
      return;
    }

    let ingested = 0, failed = 0, skippedOld = 0;
    for (const item of delta) {
      const tmp = path.join(tmpdir(), `railcite-${Date.now()}.pdf`);
      const entry: Entry = {
        source_url: item.source_url, title: item.title, doc_type: 'circular',
        domain: item.domain, circular_no: null, issue_date: null,
      };
      try {
        const res = await ingestOne(entry, tmp, sb);
        if (res.status === 'skip') { failed++; await recordFailure(sb, item.source_url, 'no extractable text'); continue; }
        await clearFailure(sb, item.source_url);   // downloaded & extracted: not dead (recovered if it was)
        // Date floor (fail-open secondary net). NOTE: the daily path currently stores issue_date=null
        // (ingestOne does not parse a date from the PDF), so passesDateFloor(null) is always true and
        // this prunes nothing today — the URL + filename dedup above is the operative "only new" filter,
        // and the flood guard backstops any burst of old-but-missing docs. TODO: populate issue_date on
        // the daily path (PDF-header date extraction) to make the floor actually prune old circulars.
        const { data: doc } = await sb.from('documents')
          .select('id,issue_date').eq('source_url', item.source_url).maybeSingle();
        const row = doc as { id: string; issue_date: string | null } | null;
        if (row && !passesDateFloor(row.issue_date, SINCE)) {
          await sb.from('documents').delete().eq('id', row.id);   // chunks cascade
          skippedOld++; continue;
        }
        ingested++;
      } catch (err) {
        failed++;
        const message = (err as Error).message;
        console.error(`  FAILED ${item.source_url}: ${message}`);
        await recordFailure(sb, item.source_url, message);
      } finally {
        await rm(tmp, { force: true });
        await sleep(THROTTLE_MS);
      }
    }

    if (shouldInvalidateCache(ingested)) {
      await invalidateAnswerCache(`daily crawl: ${ingested} new`);
    }
    console.log(`ingested=${ingested} failed=${failed} skipped_pre_${SINCE}=${skippedOld}`);
    await finish({ status: 'ok', sections_checked: SECTIONS.length, pdfs_seen: found.length, new_found: delta.length, ingested, failed });
  } catch (err) {
    const msg = err instanceof DriftError ? `DRIFT: ${err.message}` : (err as Error).message;
    console.error(msg);
    await finish({ status: 'failed', error: msg });
    process.exit(1);
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch(e => { console.error(e); process.exit(1); });
