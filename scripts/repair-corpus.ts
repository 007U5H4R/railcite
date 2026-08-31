// One-off corpus repair for damage the code-review gate found in the LIVE database. Reports by
// default; pass --apply to write. Safe to re-run (every step is idempotent).
//
//  1. CHUNKLESS DOCUMENTS — a document row whose chunk insert failed mid-ingest. Resume keys on
//     source_url, so these are skipped forever: present in the corpus, unsearchable, uncitable.
//     Deleted here so the next ingest run re-fetches them properly.
//  2. DUPLICATE DOCUMENTS — the same PDF ingested under URL variants (http/https twins,
//     percent-encoding), detected by identical file_hash. Identical passages otherwise compete in
//     retrieval, and duplicate compendium rows make the lineage anchor ambiguous. The oldest row
//     of each group is kept (it owns the existing lineage edges); the rest are deleted, chunks
//     cascade, and any lineage edge pointing at a deleted duplicate is re-pointed at the keeper.
//  3. STALE LINEAGE EDGES — edges written by the retired file-prefix seeder that contradict the
//     documents' own titles (a fabricated relationship is a P0). Any 'amends' edge whose target
//     disagrees with the title-derived subject is deleted; scripts/load-lineage-auto.ts is then
//     the single authority and can be re-run to restore the correct edges.
//
// Run: npx tsx --env-file=.env.local scripts/repair-corpus.ts [--apply]
import { adminClient } from '@/lib/db';

const APPLY = process.argv.includes('--apply');
const sb = adminClient();

interface Doc { id: string; title: string; file_hash: string | null; source_url: string | null; ingested_at: string }

async function allDocs(): Promise<Doc[]> {
  const out: Doc[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('documents').select('id,title,file_hash,source_url,ingested_at')
      .order('id', { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...(data as Doc[] ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function chunklessIds(docs: Doc[]): Promise<string[]> {
  const withChunks = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('chunks').select('document_id')
      .order('document_id', { ascending: true }).range(from, from + 999);
    if (error) throw error;
    (data ?? []).forEach(c => withChunks.add(c.document_id as string));
    if (!data || data.length < 1000) break;
  }
  return docs.filter(d => !withChunks.has(d.id)).map(d => d.id);
}

async function main() {
  console.log(APPLY ? '=== REPAIR (writing) ===' : '=== AUDIT (dry run — pass --apply to write) ===');
  const docs = await allDocs();
  console.log(`documents: ${docs.length}`);

  // 1. chunkless
  const chunkless = await chunklessIds(docs);
  console.log(`\n1. chunkless documents: ${chunkless.length}`);
  for (const id of chunkless.slice(0, 10)) console.log(`   · ${docs.find(d => d.id === id)?.title.slice(0, 70)}`);
  if (APPLY && chunkless.length) {
    const { error } = await sb.from('documents').delete().in('id', chunkless);
    if (error) throw error;
    console.log(`   → deleted ${chunkless.length}`);
  }

  // 2. duplicates by file_hash (excluding any just-deleted chunkless rows)
  const alive = docs.filter(d => !chunkless.includes(d.id));
  const byHash = new Map<string, Doc[]>();
  for (const d of alive) if (d.file_hash) {
    const g = byHash.get(d.file_hash) ?? []; g.push(d); byHash.set(d.file_hash, g);
  }
  const dupGroups = [...byHash.values()].filter(g => g.length > 1);
  const losers: string[] = [];
  const remap = new Map<string, string>();   // deleted id -> keeper id
  for (const g of dupGroups) {
    g.sort((a, b) => a.ingested_at.localeCompare(b.ingested_at) || a.id.localeCompare(b.id));
    const [keeper, ...rest] = g;
    for (const r of rest) { losers.push(r.id); remap.set(r.id, keeper.id); }
  }
  console.log(`\n2. duplicate document groups: ${dupGroups.length} (rows to delete: ${losers.length})`);
  for (const g of dupGroups.slice(0, 5)) console.log(`   · ${g.length}× ${g[0].title.slice(0, 66)}`);
  if (APPLY && losers.length) {
    // Re-point lineage at the keeper before deleting, so no curated edge is lost.
    for (const [dead, keep] of remap) {
      await sb.from('lineage').update({ document_id: keep }).eq('document_id', dead);
      await sb.from('lineage').update({ related_document_id: keep }).eq('related_document_id', dead);
    }
    for (let i = 0; i < losers.length; i += 100) {
      const { error } = await sb.from('documents').delete().in('id', losers.slice(i, i + 100));
      if (error) throw error;
    }
    console.log(`   → deleted ${losers.length} duplicate rows (chunks cascaded; lineage re-pointed)`);
  }

  // 3. lineage edges that contradict the corrigendum's own title
  const survivors = new Map(alive.filter(d => !losers.includes(d.id)).map(d => [d.id, d]));
  const { data: edges, error: le } = await sb.from('lineage').select('document_id, relation, related_document_id');
  if (le) throw le;
  const SUBJECT = /Rates Master Circular\s*\/\s*([A-Za-z][\w\-& ]*)/i;
  const bad: { document_id: string; related_document_id: string; why: string }[] = [];
  for (const e of edges ?? []) {
    const src = survivors.get(e.document_id as string);
    const tgt = survivors.get(e.related_document_id as string);
    if (!src || !tgt) continue;                       // dangling edges are cleaned by the FK cascade
    const m = SUBJECT.exec(src.title);
    if (!m) continue;                                 // no structural subject in the title — leave alone
    const subject = m[1].toLowerCase();
    // Compare on TOKENS, not a single substring: subject punctuation varies from the compendium's
    // ("CRT-CCR-Hub&Spoke" vs "CRT-Haulage Charge-Hub & Spoke"), and a naive substring test flagged
    // perfectly correct edges. An edge is suspect only when the target title shares NO significant
    // word with the subject the document itself names — deliberately conservative, since deleting
    // a real curated relationship would be as bad as keeping a fabricated one.
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
    const tgtNorm = norm(tgt.title);
    const tokens = norm(subject).split(' ').filter(w => w.length >= 3);
    if (tokens.length && !tokens.some(w => tgtNorm.includes(w))) {
      bad.push({ document_id: src.id, related_document_id: tgt.id,
        why: `"${src.title.slice(0, 44)}…" (subject: ${subject.trim()}) → "${tgt.title.slice(0, 44)}…"` });
    }
  }
  console.log(`\n3. lineage edges contradicting the document's own title: ${bad.length}`);
  for (const b of bad.slice(0, 10)) console.log(`   · ${b.why}`);
  if (APPLY && bad.length) {
    for (const b of bad) {
      await sb.from('lineage').delete()
        .eq('document_id', b.document_id).eq('related_document_id', b.related_document_id);
    }
    console.log(`   → deleted ${bad.length} fabricated edges (re-run load-lineage-auto.ts to restore correct ones)`);
  }

  const { count: d } = await sb.from('documents').select('*', { count: 'exact', head: true });
  const { count: c } = await sb.from('chunks').select('*', { count: 'exact', head: true });
  const { count: l } = await sb.from('lineage').select('*', { count: 'exact', head: true });
  console.log(`\ncorpus now: ${d} documents · ${c} chunks · ${l} lineage rows`);
}

main().catch(e => { console.error(e); process.exit(1); });
