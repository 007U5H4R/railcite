import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import manifest from '@/ingest/local-manifest.json';
import { adminClient } from '@/lib/db';
import { extractPdfText, needsOcr } from '@/lib/ingest/extract';
import { ocrPdf } from '@/lib/ingest/ocr';
import { chunkPages } from '@/lib/ingest/chunk';
import { embedTexts } from '@/lib/embeddings';

async function main() {
  const sb = adminClient();
  const dataDir = path.resolve(process.env.DATA_DIR ?? '../Data');
  for (const m of manifest) {
    const fp = path.join(dataDir, m.file);
    if (!existsSync(fp)) { console.warn(`SKIP (missing file): ${m.file}`); continue; }
    const hash = createHash('sha256').update(readFileSync(fp)).digest('hex');
    const { data: existing } = await sb.from('documents')
      .select('id, file_hash').eq('file_path', m.file).maybeSingle();
    if (existing?.file_hash === hash) { console.log(`SKIP (unchanged): ${m.file}`); continue; }
    if (existing) await sb.from('documents').delete().eq('id', existing.id);

    let { pages, totalChars } = await extractPdfText(fp);
    const is_ocr = needsOcr(pages);
    if (is_ocr) { console.log(`OCR: ${m.file} (text yield ${totalChars})`); pages = await ocrPdf(fp); }
    const chunks = chunkPages(pages);
    if (!chunks.length) { console.warn(`SKIP (no text after ${is_ocr ? 'OCR' : 'extract'}): ${m.file}`); continue; }

    const { data: doc, error: e1 } = await sb.from('documents').insert({
      title: m.title, doc_type: m.doc_type, domain: m.domain, commodity: m.commodity,
      file_path: m.file, file_hash: hash, is_ocr,
    }).select().single();
    if (e1) throw e1;

    const embeddings = await embedTexts(chunks.map(c => c.chunk_text), 'document');
    const rows = chunks.map((c, i) => ({ document_id: doc.id, chunk_text: c.chunk_text,
      embedding: embeddings[i], page_ref: c.page_ref, token_count: c.token_count }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from('chunks').insert(rows.slice(i, i + 200));
      if (error) throw error;
    }
    console.log(`OK: ${m.file} → ${rows.length} chunks${is_ocr ? ' (OCR)' : ''}`);
  }
  const { count: d } = await sb.from('documents').select('*', { count: 'exact', head: true });
  const { count: c } = await sb.from('chunks').select('*', { count: 'exact', head: true });
  console.log(`TOTAL: ${d} documents, ${c} chunks`);
}
main().catch(e => { console.error(e); process.exit(1); });
