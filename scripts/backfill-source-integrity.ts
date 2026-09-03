/**
 * backfill-source-integrity.ts — make every source card traceable to its own PDF.
 *
 * Two defects, both corpus-wide, both reported against FM-01:
 *
 *  1. AMBIGUOUS LABELS. circular_no is NULL across the crawled corpus, so the UI falls back
 *     to `title` — and titles came from filenames. 556 titles are shared by 2,822 documents:
 *     "FM-01" is fourteen different circulars, "CC-10" is eighteen. Clicking one card and
 *     opening a different year's PDF is the exact failure that was reported. Fixed by
 *     deriving a year-qualified label ("FM-01 / 2013") from the document's own URL.
 *
 *  2. GARBLED TEXT BADGED "VERIFIED". is_ocr=false only means the text came from the PDF's
 *     embedded layer — it says nothing about legibility. Documents with a broken font
 *     encoding, and fare tables flattened into digit soup, were being shown under the green
 *     "Verified text" badge. Fixed by scoring the document's chunks and setting
 *     text_quality='low', which the UI surfaces as its own third state.
 *
 * Neither step invents data: a document whose URL does not yield both a number and a year
 * keeps circular_no NULL and its title fallback.
 *
 * Requires migration 005_text_quality.sql.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-source-integrity.ts          # dry run
 *   npx tsx --env-file=.env.local scripts/backfill-source-integrity.ts --apply  # write
 */
import { pathToFileURL } from 'node:url';
import { adminClient } from '@/lib/db';
import { invalidateAnswerCache } from '@/lib/answerCache';
import { deriveCircularNo } from '@/lib/circularNo';
import { documentQuality } from '@/lib/textQuality';

type Doc = {
  id: string;
  title: string | null;
  circular_no: string | null;
  source_url: string | null;
  is_ocr: boolean;
  text_quality: string | null;
};

const PAGE = 1000;
const CHUNK_SAMPLE = 4;   // chunks per document used to judge legibility
const CONCURRENCY = 25;

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  }));
  return out;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const sb = adminClient();

  const docs: Doc[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('documents')
      .select('id,title,circular_no,source_url,is_ocr,text_quality').range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    docs.push(...(data as unknown as Doc[]));
    if ((data as unknown[]).length < PAGE) break;
  }
  console.log(`scanned ${docs.length} documents\n`);

  // ---- 1. circular_no ----------------------------------------------------
  const labels = new Map<string, string>();
  for (const d of docs) {
    const label = deriveCircularNo(d.source_url);
    if (label && label !== d.circular_no) labels.set(d.id, label);
  }
  const derivable = docs.filter(d => deriveCircularNo(d.source_url)).length;
  console.log(`CIRCULAR NUMBERS`);
  console.log(`  derivable from URL : ${derivable} / ${docs.length}`);
  console.log(`  to write           : ${labels.size}`);

  // How much ambiguity does this actually remove?
  const displayBefore = new Map<string, number>();
  const displayAfter = new Map<string, number>();
  for (const d of docs) {
    const before = d.circular_no ?? d.title ?? '';
    const after = labels.get(d.id) ?? d.circular_no ?? d.title ?? '';
    displayBefore.set(before, (displayBefore.get(before) ?? 0) + 1);
    displayAfter.set(after, (displayAfter.get(after) ?? 0) + 1);
  }
  const dup = (m: Map<string, number>) =>
    [...m.values()].filter(n => n > 1).reduce((a, b) => a + b, 0);
  console.log(`  documents sharing a label: ${dup(displayBefore)} -> ${dup(displayAfter)}`);

  // ---- 2. text_quality ---------------------------------------------------
  console.log(`\nTEXT QUALITY (sampling up to ${CHUNK_SAMPLE} chunks per document)`);
  const verdicts = await mapLimit(docs, CONCURRENCY, async d => {
    const { data } = await sb.from('chunks').select('chunk_text').eq('document_id', d.id).limit(CHUNK_SAMPLE);
    const texts = ((data ?? []) as { chunk_text: string }[]).map(c => c.chunk_text);
    return { id: d.id, current: d.text_quality ?? 'ok', quality: texts.length ? documentQuality(texts) : 'ok' };
  });
  const low = verdicts.filter(v => v.quality === 'low');
  const toFlag = low.filter(v => v.current !== 'low').map(v => v.id);
  const toClear = verdicts.filter(v => v.quality === 'ok' && v.current === 'low').map(v => v.id);
  console.log(`  low-quality documents : ${low.length}`);
  console.log(`  to flag               : ${toFlag.length}`);
  console.log(`  to clear (now ok)     : ${toClear.length}`);
  const lowVerified = low.filter(v => {
    const d = docs.find(x => x.id === v.id);
    return d && !d.is_ocr;
  }).length;
  console.log(`  ...of which were badged "Verified text": ${lowVerified}`);

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to persist.');
    return;
  }

  console.log('\napplying…');
  // circular_no is per-row, so batch by value is not possible; chunk the individual updates.
  const entries = [...labels.entries()];
  await mapLimit(entries, CONCURRENCY, async ([id, circular_no]) => {
    const { error } = await sb.from('documents').update({ circular_no }).eq('id', id);
    if (error) throw new Error(`circular_no ${id}: ${error.message}`);
  });
  console.log(`  circular_no: ${entries.length} written`);

  for (const [value, ids] of [['low', toFlag], ['ok', toClear]] as const) {
    for (let i = 0; i < ids.length; i += 500) {
      const { error } = await sb.from('documents')
        .update({ text_quality: value }).in('id', ids.slice(i, i + 500));
      if (error) throw new Error(`text_quality ${value}: ${error.message}`);
    }
    if (ids.length) console.log(`  text_quality=${value}: ${ids.length} written`);
  }
  // A cached answer embeds a snapshot of its source documents, so rewriting document
  // metadata without this leaves the old values being replayed on every cache hit.
  await invalidateAnswerCache('source-integrity backfill');
  console.log('done.');
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch(e => { console.error(e); process.exit(1); });
