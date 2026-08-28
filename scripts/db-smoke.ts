import { adminClient } from '@/lib/db';

async function main() {
  const sb = adminClient();
  const { data: doc, error: e1 } = await sb.from('documents')
    .insert({ title: 'SMOKE', doc_type: 'circular', file_path: '__smoke__' }).select().single();
  if (e1) throw e1;
  const emb = Array.from({ length: 1024 }, () => 0.001);
  const { error: e2 } = await sb.from('chunks').insert({
    document_id: doc.id, chunk_text: 'smoke chunk', embedding: emb, page_ref: 'p. 1', token_count: 2 });
  if (e2) throw e2;
  const { data: hits, error: e3 } = await sb.rpc('match_chunks',
    { query_embedding: emb, match_count: 1, filter_verified: false, filter_domain: null });
  if (e3) throw e3;
  if (!hits?.length || hits[0].similarity < 0.99) throw new Error('match_chunks returned no/low hit');
  await sb.from('documents').delete().eq('id', doc.id);   // cascades the chunk
  console.log('db smoke OK — match_chunks similarity', hits[0].similarity);
}
main().catch((e) => { console.error(e); process.exit(1); });
