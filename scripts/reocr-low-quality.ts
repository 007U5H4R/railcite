/**
 * reocr-low-quality.ts — recover text for the documents flagged text_quality='low'.
 *
 * The source-integrity backfill LABELLED unreadable extractions ('low') so the UI stops
 * badging `6 ]O t'oN a6Dd s^D,ultDd` as "Verified text". That was the honesty fix; this is the
 * recovery. Two failure shapes wear the same flag:
 *   · MOJIBAKE — a broken font cmap yields scrambled letters through the PDF's EMBEDDED layer,
 *     so the document arrived is_ocr=false and OCR was never tried. Rendering the page to an
 *     image and running tesseract reads the actual glyphs and recovers real text.
 *   · NUMERIC TABLES — a fare/rate table flattened into digit soup. It is faithful to the PDF;
 *     OCR reproduces the same digits. Nothing to recover, and re-OCR must NOT churn it.
 *
 * So this re-OCRs every low document, re-chunks and re-scores the result, and replaces the
 * stored text ONLY when OCR genuinely improved legibility (the re-score reads 'ok', or the
 * marker-word count rose materially). A document OCR cannot improve keeps its honest 'low' flag
 * and its existing chunks untouched. Every replacement re-embeds the new chunks so retrieval
 * searches the recovered text.
 *
 * tesseract here has only the English pack; bilingual circulars recover their English body (the
 * citable content) but not their Devanagari — noted per-document in the output.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/reocr-low-quality.ts          # dry run (still OCRs, to decide)
 *   npx tsx --env-file=.env.local scripts/reocr-low-quality.ts --apply  # write
 */
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { writeFile, rm, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { adminClient } from '@/lib/db';
import { invalidateAnswerCache } from '@/lib/answerCache';
import { ocrPdf } from '@/lib/ingest/ocr';
import { chunkPages } from '@/lib/ingest/chunk';
import { embedTexts } from '@/lib/embeddings';
import { documentQuality, markerHitCount, type TextQuality } from '@/lib/textQuality';

// Keep every temp file off the Mac internal disk (machine constraint): renders + downloads on E.
const TMP = process.env.RAILCITE_TMP ?? '/Volumes/E Drive/railcite-tmp';
process.env.TMPDIR = TMP;   // ocrPdf renders PNGs under os.tmpdir(), which reads TMPDIR per call

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) RailCite-reocr';
const MIN_MARKERS = 3;   // OCR must recover at least this many real words to count as an improvement

interface Doc { id: string; title: string | null; source_url: string | null; is_ocr: boolean; text_quality: string | null }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchToFile(url: string, dest: string): Promise<void> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 90000);   // the gov server is slow on big scans
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 800) throw new Error('empty/too small');
    await writeFile(dest, buf);
  } finally { clearTimeout(to); }
}

async function download(url: string, dest: string): Promise<void> {
  const u = url.replace(/^http:\/\//i, 'https://');
  try { await fetchToFile(u, dest); }
  catch { await sleep(2000); await fetchToFile(u, dest); }   // one retry absorbs a transient blip
}

async function currentChunks(sb: ReturnType<typeof adminClient>, id: string): Promise<string[]> {
  const { data } = await sb.from('chunks').select('chunk_text').eq('document_id', id).limit(8);
  return ((data ?? []) as { chunk_text: string }[]).map(c => c.chunk_text);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const sb = adminClient();
  await mkdir(TMP, { recursive: true });

  // By default, target only documents whose text came from the EMBEDDED layer (is_ocr=false):
  // those are the mojibake cases OCR was never tried on. A doc already is_ocr=true was OCR'd at
  // ingest and still scored low — a genuine numeric table — so re-OCR at the same resolution
  // reproduces it. --include-ocr forces the full set anyway.
  const includeOcr = process.argv.includes('--include-ocr');
  const { data, error } = await sb.from('documents')
    .select('id,title,source_url,is_ocr,text_quality').eq('text_quality', 'low');
  if (error) throw new Error(error.message);
  let docs = (data as unknown as Doc[]).filter(d => d.source_url);
  const alreadyOcr = docs.filter(d => d.is_ocr).length;
  if (!includeOcr) docs = docs.filter(d => !d.is_ocr);
  console.log(`re-OCR candidates: ${docs.length} documents` +
    (includeOcr ? '' : ` (skipping ${alreadyOcr} already-OCR'd tables — pass --include-ocr to force)`) + '\n');

  const replacements: { id: string; chunks: ReturnType<typeof chunkPages>; quality: TextQuality; hash: string }[] = [];
  let recovered = 0, kept = 0, failed = 0;

  for (const d of docs) {
    const label = (d.title ?? d.id).slice(0, 42).padEnd(42);
    const tmp = path.join(TMP, `reocr-${d.id}.pdf`);
    try {
      await download(d.source_url!, tmp);
      const pages = await ocrPdf(tmp);
      const ocrChunks = chunkPages(pages);
      const ocrText = ocrChunks.map(c => c.chunk_text).join('\n');
      const curText = (await currentChunks(sb, d.id)).join('\n');
      const newQuality = ocrChunks.length ? documentQuality(ocrChunks.map(c => c.chunk_text)) : 'low';
      const mOld = markerHitCount(curText), mNew = markerHitCount(ocrText);

      // Replace only when OCR actually recovered legible English words — at least MIN_MARKERS,
      // and no fewer than the embedded layer already had. This guards two failure modes: a
      // genuine numeric table (few markers, unchanged) and a near-empty OCR result that scores
      // 'ok' merely for being too short to judge (which would erase content, not recover it).
      // A bilingual page whose body is Devanagari yields no English markers under the eng-only
      // pack, so it honestly stays 'low' rather than claiming an unverifiable recovery.
      const improved = mNew >= MIN_MARKERS && mNew >= mOld && (newQuality === 'ok' || mNew > mOld);
      if (improved) {
        const hash = createHash('sha256').update(await readFile(tmp)).digest('hex');
        replacements.push({ id: d.id, chunks: ocrChunks, quality: newQuality, hash });
        recovered++;
        console.log(`  RECOVER  ${label} q:${d.text_quality}→${newQuality}  markers ${mOld}→${mNew}  chunks→${ocrChunks.length}`);
      } else {
        kept++;
        console.log(`  keep     ${label} q:low (table/no-gain)  markers ${mOld}→${mNew}  ocrChunks ${ocrChunks.length}`);
      }
    } catch (e) {
      failed++;
      console.log(`  FAIL     ${label} :: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await rm(tmp, { force: true });
    }
  }

  console.log(`\nsummary: recover ${recovered} · keep ${kept} · fail ${failed}`);

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to persist recoveries.');
    return;
  }
  if (!replacements.length) { console.log('nothing to write.'); return; }

  console.log('\napplying…');
  for (const r of replacements) {
    const embeddings = await embedTexts(r.chunks.map(c => c.chunk_text), 'document');
    // Replace the document's chunks atomically-enough: delete then insert. If the insert half
    // failed the doc would go chunkless; scripts/repair-corpus.ts detects and re-fetches those.
    const { error: del } = await sb.from('chunks').delete().eq('document_id', r.id);
    if (del) throw new Error(`delete chunks ${r.id}: ${del.message}`);
    const rows = r.chunks.map((c, i) => ({ document_id: r.id, chunk_text: c.chunk_text,
      embedding: embeddings[i], page_ref: c.page_ref, token_count: c.token_count }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from('chunks').insert(rows.slice(i, i + 200));
      if (error) throw new Error(`insert chunks ${r.id}: ${error.message}`);
    }
    const { error: upd } = await sb.from('documents')
      .update({ is_ocr: true, text_quality: r.quality, file_hash: r.hash }).eq('id', r.id);
    if (upd) throw new Error(`update doc ${r.id}: ${upd.message}`);
    console.log(`  wrote ${rows.length} chunks · ${r.id} → ${r.quality}`);
  }
  await invalidateAnswerCache('re-ocr low-quality recovery');
  console.log('done.');
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch(e => { console.error(e); process.exit(1); });
