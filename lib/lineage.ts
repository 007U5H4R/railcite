import { adminClient } from './db';
import type { LineageView, LineageNode, LineageRelation } from './types';

// A row of the service-role-only `lineage` table (hand-curated supersession/amendment metadata).
export interface LineageRow {
  document_id: string;
  relation: 'supersedes' | 'superseded_by' | 'amends' | 'amended_by';
  related_document_id: string;
  note: string | null;
}

export interface LineageDoc { title: string; circular_no: string | null; issue_date: string | null }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PURE logic (no I/O — unit-tested): turn curated relation rows into a graph of documents. Each
// node carries its status (superseded iff some doc supersedes it) and its EXPLICIT relations to
// older docs — so BRANCHING (a doc that relates to several) is never silently dropped, MULTIPLE
// disjoint chains all appear, and the UI never implies a chain that isn't in the data.
// Deterministic: the same rows always produce the same output. Trust-critical.
export function buildLineageView(rows: LineageRow[], docById: Map<string, LineageDoc>): LineageView | null {
  if (!rows.length) return null;

  // Normalize every relation to a directed edge newer -> older, with a forward label + note.
  interface Edge { newer: string; older: string; kind: 'supersedes' | 'amends'; note: string | null }
  const edges: Edge[] = rows.map(r => {
    const forward = r.relation === 'supersedes' || r.relation === 'amends';
    const kind = (r.relation === 'supersedes' || r.relation === 'superseded_by') ? 'supersedes' : 'amends';
    return { newer: forward ? r.document_id : r.related_document_id,
      older: forward ? r.related_document_id : r.document_id, kind, note: r.note };
  });
  // Dedup (a relationship may be stored as both e.g. `amends` and its `amended_by` inverse).
  const uniq = [...new Map(edges.map(e => [`${e.newer}>${e.older}:${e.kind}`, e])).values()];

  const allIds = [...new Set(uniq.flatMap(e => [e.newer, e.older]))];
  // A document is superseded iff it is the OLDER end of a `supersedes` edge (an `amends` edge
  // leaves both in force — a correction slip revises, it doesn't repeal).
  const superseded = new Set(uniq.filter(e => e.kind === 'supersedes').map(e => e.older));

  // Outgoing relations per node, deterministically ordered.
  const relById = new Map<string, LineageRelation[]>();
  for (const e of uniq) {
    const arr = relById.get(e.newer) ?? [];
    arr.push({ kind: e.kind, target_document_id: e.older, note: e.note });
    relById.set(e.newer, arr);
  }
  for (const arr of relById.values())
    arr.sort((a, b) => a.kind.localeCompare(b.kind) || a.target_document_id.localeCompare(b.target_document_id));

  // Order newest-first: fewer incoming edges (times superseded/amended by others) = newer.
  // Tiebreak by issue_date (newer first) then id, so it's fully deterministic. Because relations
  // name their targets explicitly, this order is only reading flow — it never changes which
  // relationships are shown.
  const inDeg = new Map(allIds.map(id => [id, 0]));
  uniq.forEach(e => inDeg.set(e.older, (inDeg.get(e.older) ?? 0) + 1));
  const ordered = [...allIds].sort((a, b) =>
    (inDeg.get(a)! - inDeg.get(b)!) ||
    (docById.get(b)?.issue_date ?? '').localeCompare(docById.get(a)?.issue_date ?? '') ||
    a.localeCompare(b));

  const nodes: LineageNode[] = ordered.map(id => {
    const d = docById.get(id);
    return {
      document_id: id,
      circular_no: d?.circular_no ?? null,
      issue_date: d?.issue_date ?? null,
      title: d?.title ?? 'Unknown document',
      status: superseded.has(id) ? 'superseded' : 'in_force',
      relations: relById.get(id) ?? [],
    };
  });
  return nodes.length ? { nodes } : null;
}

// Curated supersession / amendment lineage for the documents an answer cites. Walks the FULL
// connected component out from the cited docs (transitive closure), so a document sitting in the
// middle of a longer chain still gets its correct up-chain status. DETERMINISTIC + hand-curated,
// never model-generated. Failure-tolerant: any error resolves to null, so a lineage hiccup can
// never sink an already-synthesized answer.
export async function getLineage(documentIds: string[]): Promise<LineageView | null> {
  // Only real UUIDs may reach the PostgREST filter string (defense-in-depth: today these are
  // DB-generated doc ids that can't contain filter metacharacters, but this guards a future
  // refactor that might route a text identifier — a slug or circular_no — through here).
  const seedIds = [...new Set(documentIds.filter(id => UUID_RE.test(id)))];
  if (!seedIds.length) return null;

  try {
    const sb = adminClient();
    const known = new Set(seedIds);
    let frontier = seedIds;
    const rows: LineageRow[] = [];
    const seenRow = new Set<string>();

    // BFS across the lineage graph — a relationship is relevant when EITHER side is reached.
    // Real chains are short; the hop cap is a runaway backstop, not an expected limit.
    for (let hop = 0; frontier.length && hop < 25; hop++) {
      const list = frontier.join(',');
      const { data, error } = await sb.from('lineage')
        .select('document_id, relation, related_document_id, note')
        .or(`document_id.in.(${list}),related_document_id.in.(${list})`);
      if (error) throw error;
      const next: string[] = [];
      for (const r of (data ?? []) as LineageRow[]) {
        const key = `${r.document_id}|${r.relation}|${r.related_document_id}`;
        if (!seenRow.has(key)) { seenRow.add(key); rows.push(r); }
        for (const id of [r.document_id, r.related_document_id])
          if (!known.has(id)) { known.add(id); next.push(id); }
      }
      frontier = next;
    }
    if (!rows.length) return null;

    const { data: docs, error: e2 } = await sb.from('documents')
      .select('id,title,circular_no,issue_date').in('id', [...known]);
    if (e2) throw e2;
    const docById = new Map((docs ?? []).map(d =>
      [d.id as string, { title: d.title, circular_no: d.circular_no, issue_date: d.issue_date } as LineageDoc]));
    return buildLineageView(rows, docById);
  } catch (e) {
    console.warn('getLineage failed (non-blocking — the answer still shows, just without lineage):', e);
    return null;
  }
}
