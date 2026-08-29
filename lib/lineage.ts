import { adminClient } from './db';
import type { LineageView, LineageNode } from './types';

// A row of the service-role-only `lineage` table (hand-curated supersession/amendment metadata).
export interface LineageRow {
  document_id: string;
  relation: 'supersedes' | 'superseded_by' | 'amends' | 'amended_by';
  related_document_id: string;
  note: string | null;
}

export interface LineageDoc { title: string; circular_no: string | null; issue_date: string | null }

// PURE logic (no I/O — unit-tested): normalize curated relations into an ordered chain, newest
// / still-in-force at the top. Trust-critical: a flipped direction or a wrong status would
// misrepresent a document's legal standing, so this is deterministic and covered by tests.
export function buildLineageView(rows: LineageRow[], docById: Map<string, LineageDoc>): LineageView | null {
  if (!rows.length) return null;

  // Normalize each relation to a directed edge (newer -> older) with a forward label. The
  // stored `relation` reads from document_id's perspective; the *_by variants point backward.
  type Edge = { newer: string; older: string; kind: 'supersedes' | 'amends'; note: string | null };
  const edges: Edge[] = rows.map(r => {
    const forward = r.relation === 'supersedes' || r.relation === 'amends';
    const kind = (r.relation === 'supersedes' || r.relation === 'superseded_by') ? 'supersedes' : 'amends';
    return { newer: forward ? r.document_id : r.related_document_id,
      older: forward ? r.related_document_id : r.document_id, kind, note: r.note };
  });

  // Order newest-first by walking from the head — a doc that is some edge's `newer` but never
  // an `older`. Only the older end of a `supersedes` edge is marked superseded; an `amends`
  // edge leaves both documents in force (a correction slip revises, it doesn't repeal).
  const olders = new Set(edges.map(e => e.older));
  const head = edges.map(e => e.newer).find(id => !olders.has(id)) ?? edges[0].newer;
  const nextOlder = new Map(edges.map(e => [e.newer, e]));
  const supersededIds = new Set(edges.filter(e => e.kind === 'supersedes').map(e => e.older));

  const nodes: LineageNode[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = head;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const d = docById.get(cur);
    const edge = nextOlder.get(cur);
    nodes.push({
      document_id: cur,
      circular_no: d?.circular_no ?? null,
      issue_date: d?.issue_date ?? null,
      title: d?.title ?? 'Unknown document',
      status: supersededIds.has(cur) ? 'superseded' : 'in_force',
      relation_to_prev: edge ? edge.kind : null,   // how this node relates to the (older) node below it
      note: edge?.note ?? null,                     // the relationship's detail (e.g. which paras it revises)
    });
    cur = edge?.older;
  }
  return nodes.length ? { nodes } : null;
}

// Curated supersession / amendment lineage for the documents an answer cites. Reads the
// `lineage` table (service-role; RLS-deny-all like the rest of the corpus) and returns an
// ordered chain, or null when no cited document has a recorded relationship. DETERMINISTIC and
// hand-curated, never model-generated: it can only surface relationships the corpus actually
// records, so it can never invent a supersession (which, in a trust tool, would be as serious
// as a fabricated citation).
export async function getLineage(documentIds: string[]): Promise<LineageView | null> {
  if (!documentIds.length) return null;
  const sb = adminClient();
  const ids = documentIds.join(',');
  // A relationship is relevant when EITHER side is a cited document — an answer usually cites
  // the amended manual, not the correction slip that amends it, and we still want to show it.
  const { data, error } = await sb.from('lineage')
    .select('document_id, relation, related_document_id, note')
    .or(`document_id.in.(${ids}),related_document_id.in.(${ids})`);
  if (error) throw error;
  const rows = (data ?? []) as LineageRow[];
  if (!rows.length) return null;

  const chainIds = [...new Set(rows.flatMap(r => [r.document_id, r.related_document_id]))];
  const { data: docs, error: e2 } = await sb.from('documents')
    .select('id,title,circular_no,issue_date').in('id', chainIds);
  if (e2) throw e2;
  const docById = new Map((docs ?? []).map(d =>
    [d.id as string, { title: d.title, circular_no: d.circular_no, issue_date: d.issue_date } as LineageDoc]));
  return buildLineageView(rows, docById);
}
