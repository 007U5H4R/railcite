/**
 * reocr-one-local.ts — recover ONE document from an already-downloaded local PDF.
 *
 * For the odd file whose download node's fetch keeps aborting (a large scan the gov server
 * throttles over that path) while curl fetches it fine. Same OCR → re-chunk → re-score →
 * re-embed → replace pipeline and the same ≥3-marker decision rule as reocr-low-quality.ts.
 *
 * Usage: npx tsx --env-file=.env.local scripts/reocr-one-local.ts <document_id> <local.pdf> [--apply]
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { adminClient } from '@/lib/db';
import { invalidateAnswerCache } from '@/lib/answerCache';
import { ocrPdf } from '@/lib/ingest/ocr';
import { chunkPages } from '@/lib/ingest/chunk';
import { embedTexts } from '@/lib/embeddings';
import { documentQuality, markerHitCount } from '@/lib/textQuality';

process.env.TMPDIR = process.env.RAILCITE_TMP ?? '/Volumes/E Drive/railcite-tmp';
const MIN_MARKERS = 3;

async function main() {
  const [id, pdf] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const apply = process.argv.includes('--apply');
  if (!id || !pdf) throw new Error('usage: reocr-one-local.ts <document_id> <local.pdf> [--apply]');
  const sb = adminClient();

  const { data: cur } = await sb.from('chunks').select('chunk_text').eq('document_id', id).limit(8);
  const curText = ((cur ?? []) as { chunk_text: string }[]).map(c => c.chunk_text).join('\n');

  const pages = await ocrPdf(pdf);
  const chunks = chunkPages(pages);
  const ocrText = chunks.map(c => c.chunk_text).join('\n');
  const quality = chunks.length ? documentQuality(chunks.map(c => c.chunk_text)) : 'low';
  const mOld = markerHitCount(curText), mNew = markerHitCount(ocrText);
  const improved = mNew >= MIN_MARKERS && mNew >= mOld && (quality === 'ok' || mNew > mOld);
  console.log(`markers ${mOld}→${mNew} · quality→${quality} · chunks→${chunks.length} · ${improved ? 'RECOVER' : 'keep'}`);

  if (!improved) { console.log('no improvement — leaving unchanged.'); return; }
  if (!apply) { console.log('DRY RUN — pass --apply to write.'); return; }

  const embeddings = await embedTexts(chunks.map(c => c.chunk_text), 'document');
  const { error: del } = await sb.from('chunks').delete().eq('document_id', id);
  if (del) throw new Error(del.message);
  const rows = chunks.map((c, i) => ({ document_id: id, chunk_text: c.chunk_text,
    embedding: embeddings[i], page_ref: c.page_ref, token_count: c.token_count }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from('chunks').insert(rows.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  const hash = createHash('sha256').update(await readFile(pdf)).digest('hex');
  const { error: upd } = await sb.from('documents')
    .update({ is_ocr: true, text_quality: quality, file_hash: hash }).eq('id', id);
  if (upd) throw new Error(upd.message);
  await invalidateAnswerCache('re-ocr one local');
  console.log(`wrote ${rows.length} chunks · ${id} → ${quality}`);
}

main().catch(e => { console.error(e); process.exit(1); });
