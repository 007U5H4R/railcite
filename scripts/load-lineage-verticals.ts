// Seeds supersession lineage for every ingested Rates-Master-Circular vertical: each corrigendum
// AMENDS its subject's consolidated compendium. Grounded in each corrigendum's own title
// ("Corrigendum No.X to Rates Master Circular/<subject>") — never invented. 'amends' (not
// 'supersedes'): a corrigendum revises provisions, both remain in force; the compendium is that
// subject's current consolidated form and is the anchor node.
//
// Generalizes the per-subject seed — add a vertical by adding one row to VERTICALS. Idempotent:
// resolves docs by file_path (stable across re-ingest, unlike regenerated UUIDs) + the lineage
// unique constraint. Corrigendum files are named `<PREFIX>_Corrig_<n>_…` by the vertical builder.
//
// Run: `npx tsx --env-file=.env.local scripts/load-lineage-verticals.ts`
import { adminClient } from '@/lib/db';

const VERTICALS: { label: string; compendium: string; corrigPrefix: string }[] = [
  { label: 'Demurrage-Wharfage-Waiver', corrigPrefix: 'DWW_Corrig_',
    compendium: 'RMC_Compendium_Demurrage_Wharfage_Waiver_updated_till_2025.pdf' },
  { label: 'Weighment / Punitive Charge', corrigPrefix: 'WGH_Corrig_',
    compendium: 'RMC_Compendium_Weighment_Punitive_Charge_February_2026_with_links.pdf' },
  { label: 'CRT–Haulage–Hub & Spoke', corrigPrefix: 'CRT_Corrig_',
    compendium: 'RMC_Compendium_CRT_Haulage_Charge_HubSpoke_March_2026_with_links_1.pdf' },
  { label: 'Provision of Weighbridge', corrigPrefix: 'WBR_Corrig_',
    compendium: 'RMC_Compendium_Provision_of_Weighbridge_2025_2.pdf' },
  { label: 'System of charging freight — sidings', corrigPrefix: 'SDG_Corrig_',
    compendium: 'RMC_Compendium_System_of_charging_freight_in_case_of_siding_2025.pdf' },
  { label: 'E-payment', corrigPrefix: 'EPY_Corrig_',
    compendium: 'RMC_Compendium_E_payment_2025.pdf' },
  { label: 'Demand Registration (eRD)', corrigPrefix: 'ERD_Corrig_',
    compendium: 'RMC_Compendium_eRD_2025.pdf' },
  { label: 'Electronic RR (eTRR)', corrigPrefix: 'ETR_Corrig_',
    compendium: 'RMC_Comoendium_eTRR_2025_1.pdf' },
];

interface Doc { id: string; title: string; file_path: string | null; circular_no: string | null; issue_date: string | null }

async function main() {
  const sb = adminClient();
  const { data: docs, error } = await sb.from('documents').select('id,title,file_path,circular_no,issue_date');
  if (error) throw error;
  const byPath = new Map((docs as Doc[] ?? []).map(d => [d.file_path ?? '', d]));

  const rows: { document_id: string; relation: 'amends'; related_document_id: string; note: string }[] = [];
  for (const v of VERTICALS) {
    const comp = byPath.get(v.compendium);
    const corrigs = (docs as Doc[] ?? []).filter(d => d.file_path?.startsWith(v.corrigPrefix));
    if (!comp) { console.warn(`⚠ ${v.label}: compendium not ingested — skipping`); continue; }
    if (!corrigs.length) { console.warn(`⚠ ${v.label}: no corrigendums found (${v.corrigPrefix}*)`); continue; }
    for (const c of corrigs) rows.push({
      document_id: c.id, relation: 'amends', related_document_id: comp.id,
      note: `${c.circular_no ?? 'Corrigendum'}${c.issue_date ? ` (${c.issue_date})` : ''}: ${c.title}`.slice(0, 300),
    });
    console.log(`  ${v.label}: ${corrigs.length} corrigendums → amends the compendium`);
  }
  if (!rows.length) { console.error('✗ nothing to seed — is the corpus ingested?'); process.exit(1); }

  const { error: e2 } = await sb.from('lineage')
    .upsert(rows, { onConflict: 'document_id,relation,related_document_id', ignoreDuplicates: true });
  if (e2) throw e2;
  const { count } = await sb.from('lineage').select('*', { count: 'exact', head: true });
  console.log(`✓ seeded ${rows.length} amendment relations across ${VERTICALS.length} verticals (lineage table now ${count} rows)`);
}

main().catch(e => { console.error(e); process.exit(1); });
