// Broad auto-lineage across the FULL crawled corpus: each corrigendum AMENDS its subject's
// consolidated compendium. The subject is read from the corrigendum's OWN title (e.g. "Corrigendum
// No.62 of Rates Master Circular/Demurrage-Wharfage-Waiver/2016/0") — grounded in the document text,
// never inferred. TRUST-CRITICAL (a fabricated relationship is a P0): a corrigendum is wired ONLY
// when its title matches exactly one subject; 0-match and >1-match corrigendums are LOGGED, not
// guessed. 'amends' (not 'supersedes'): a corrigendum revises provisions, both stay in force.
//
// Idempotent (lineage unique constraint). Re-runnable as the corpus grows.
// Run: `npx tsx --env-file=.env.local scripts/load-lineage-auto.ts`
import { adminClient } from '@/lib/db';

interface Doc { id: string; title: string; doc_type: string | null; circular_no: string | null }

// anchor = matches the subject's compendium title (unique); corrig = matches a corrigendum's title;
// not = excludes a look-alike subject. Order doesn't matter — a corrigendum must match exactly one.
const SUBJECTS: { label: string; anchor: RegExp; corrig: RegExp; not?: RegExp }[] = [
  { label: 'Demurrage-Wharfage-Waiver', anchor: /Demurrage/i, corrig: /demurrage|wharfage/i },
  { label: 'Weighment / Punitive Charge', anchor: /Weighment/i, corrig: /weighment|punitive charge/i, not: /weighbridge/i },
  { label: 'CRT-Haulage-Hub&Spoke', anchor: /CRT/i, corrig: /\bCRT\b|hub[\s-]*[&and]*[\s-]*spoke|haulage charge|\bCCR\b|container.*class rate/i },
  { label: 'Provision of Weighbridge', anchor: /Weighbridge/i, corrig: /weighbridge/i },
  { label: 'System of charging freight — sidings', anchor: /siding/i, corrig: /\bsidings?\b/i },
  { label: 'E-payment', anchor: /E[\s_-]?payment/i, corrig: /e[\s-]?payment|electronic payment|online payment system/i },
  { label: 'Demand Registration (eRD)', anchor: /eRD/i, corrig: /demand registration|\be-?RD\b|premium indent/i },
  { label: 'Electronic RR (eTRR)', anchor: /eTRR/i, corrig: /e-?TRR|electronic transmission of railway receipt/i },
];

async function main() {
  const sb = adminClient();
  const docs: Doc[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('documents').select('id,title,doc_type,circular_no').range(from, from + 999);
    if (error) throw error;
    docs.push(...(data as Doc[] ?? []));
    if (!data || data.length < 1000) break;
  }

  // Anchor compendium per subject (the doc whose title says "…ompendium…"/"Consolidated" + subject).
  const isCompendium = (t: string) => /omp[eo]ndium|consolidated instructions/i.test(t);
  const anchors = new Map<string, Doc>();
  for (const s of SUBJECTS) {
    const a = docs.find(d => isCompendium(d.title) && s.anchor.test(d.title));
    if (a) anchors.set(s.label, a);
    else console.warn(`⚠ no compendium anchor found for "${s.label}"`);
  }

  const rows: { document_id: string; relation: 'amends'; related_document_id: string; note: string }[] = [];
  const perSubject = new Map<string, number>();
  let ambiguous = 0, unmatched = 0, selfSkip = 0;
  const unmatchedSamples: string[] = [];

  for (const d of docs) {
    const t = d.title || '';
    const isCorrig = /corrig|addendum/i.test(t) || d.doc_type === 'correction_slip';
    if (!isCorrig || isCompendium(t)) continue;                 // skip non-corrigs + the compendiums themselves
    const hits = SUBJECTS.filter(s => s.corrig.test(t) && !(s.not && s.not.test(t)));
    if (hits.length === 0) { unmatched++; if (unmatchedSamples.length < 12) unmatchedSamples.push(t.slice(0, 70)); continue; }
    if (hits.length > 1) { ambiguous++; continue; }             // conservative: never guess
    const anchor = anchors.get(hits[0].label);
    if (!anchor) { unmatched++; continue; }
    if (anchor.id === d.id) { selfSkip++; continue; }
    rows.push({ document_id: d.id, relation: 'amends', related_document_id: anchor.id,
      note: `${d.circular_no ?? 'Corrigendum'}: ${t}`.slice(0, 300) });
    perSubject.set(hits[0].label, (perSubject.get(hits[0].label) ?? 0) + 1);
  }

  // Upsert in batches (idempotent).
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from('lineage')
      .upsert(rows.slice(i, i + 500), { onConflict: 'document_id,relation,related_document_id', ignoreDuplicates: true });
    if (error) throw error;
  }

  console.log(`\n=== broad auto-lineage ===`);
  for (const s of SUBJECTS)
    console.log(`  ${(perSubject.get(s.label) ?? 0).toString().padStart(4)}  ${s.label}${anchors.has(s.label) ? '' : '  (NO ANCHOR — skipped)'}`);
  console.log(`\n  wired: ${rows.length} amend-relations  |  ambiguous(>1 subject, skipped): ${ambiguous}  |  unmatched(no subject): ${unmatched}  |  self: ${selfSkip}`);
  if (unmatchedSamples.length) {
    console.log(`\n  sample UNMATCHED corrigendums (no compendium subject — e.g. PCC / FIS / Dynamic-Pricing, which have no compendium):`);
    unmatchedSamples.forEach(s => console.log(`    · ${s}`));
  }
  const { count } = await sb.from('lineage').select('*', { count: 'exact', head: true });
  console.log(`\n  lineage table now: ${count} rows`);
}

main().catch(e => { console.error(e); process.exit(1); });
