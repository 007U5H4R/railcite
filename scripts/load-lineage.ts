// Seeds the one curated lineage relationship the current corpus supports: the OCR'd
// "IRCM Vol. II — Correction Slip" AMENDS the "IRCM Vol. II (Goods)" manual. The slip revises
// specific paras — e.g. Para 2720 (Ch. XXVI, w.e.f. 1-4-1995) and Para 2506 (Correction Slip
// No. 19) — but does NOT repeal the manual, so both remain in force (relation = 'amends', not
// 'supersedes'). Everything here is grounded in the slip's own text, never invented.
//
// Idempotent: resolves documents by type/title (their UUIDs are regenerated on every re-ingest,
// so hardcoding them would rot) and relies on the lineage unique constraint. Most real
// supersession chains arrive with the Phase-5 crawl; this is the seed until then.
//
// Run: `npx tsx --env-file=.env.local scripts/load-lineage.ts`
import { adminClient } from '@/lib/db';

async function main() {
  const sb = adminClient();
  const { data: docs, error } = await sb.from('documents').select('id,title,doc_type');
  if (error) throw error;

  const slip = docs?.find(d => d.doc_type === 'correction_slip');
  const volII = docs?.find(d => d.doc_type === 'manual' && /Vol\. II \(Goods\)/i.test(d.title));
  if (!slip || !volII) {
    console.error('✗ Could not find both documents — is the corpus ingested?',
      { slip: slip?.title ?? null, volII: volII?.title ?? null });
    process.exit(1);
  }

  const row = {
    document_id: slip.id,
    relation: 'amends' as const,
    related_document_id: volII.id,
    note: 'Revises paras of IRCM Vol. II — incl. Para 2720 (Ch. XXVI, w.e.f. 1-4-1995) and Para 2506 (Correction Slip No. 19).',
  };
  const { error: e2 } = await sb.from('lineage')
    .upsert(row, { onConflict: 'document_id,relation,related_document_id', ignoreDuplicates: true });
  if (e2) throw e2;

  const { count } = await sb.from('lineage').select('*', { count: 'exact', head: true });
  console.log(`✓ lineage seeded: "${slip.title}" amends "${volII.title}" (table now has ${count} row(s))`);
}

main().catch(e => { console.error(e); process.exit(1); });
