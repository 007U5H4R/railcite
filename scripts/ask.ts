import { embedTexts } from '@/lib/embeddings';
import { matchChunks } from '@/lib/retrieval';
import { synthesize } from '@/lib/synthesize';
import { validateSynthesis } from '@/lib/validate';
import { optionalEnv } from '@/lib/env';

async function main() {
  const caseText = process.argv.slice(2).join(' ');
  if (caseText.length < 10) { console.error('usage: npm run ask -- "<case text>"'); process.exit(1); }
  const threshold = Number(optionalEnv('RELEVANCE_THRESHOLD', '0.45'));
  const [emb] = await embedTexts([caseText], 'query');
  const hits = await matchChunks(emb, { k: 8, verifiedOnly: false, domain: null });
  console.log('\n— retrieval —');
  hits.forEach((h, i) => console.log(
    `[${i + 1}] sim=${h.similarity.toFixed(3)} ${h.document.circular_no ?? h.document.title} (${h.page_ref})${h.document.is_ocr ? ' [OCR]' : ''}`));
  const above = hits.filter(h => h.similarity >= threshold);
  if (!above.length) { console.log(`\nREFUSED (all below threshold ${threshold})`); return; }
  const sources = above.map((h, i) => ({ n: i + 1,
    header: `${h.document.circular_no ?? h.document.title} · ${h.document.issue_date ?? 'date n/a'} · ${h.document.doc_type}`,
    text: h.chunk_text }));
  const v = validateSynthesis(await synthesize(caseText, sources), sources.length);
  if (v.status === 'refused') { console.log('\nREFUSED (model/validator)'); return; }
  console.log(`\n— conclusion (dropped ${v.dropped} uncited block(s)) —`);
  for (const b of v.blocks) console.log(`• ${b.text}  ←[${b.citations.join(',')}]`);
  console.log('\n— note —'); for (const b of v.note) console.log(b.text);
}
main().catch(e => { console.error(e); process.exit(1); });
