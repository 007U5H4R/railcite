import { buildLineageView, type LineageRow, type LineageDoc } from '@/lib/lineage';

const docs = new Map<string, LineageDoc>([
  ['slip', { title: 'IRCM Vol. II — Correction Slip', circular_no: null, issue_date: null }],
  ['volII', { title: 'IRCM Vol. II (Goods)', circular_no: null, issue_date: null }],
  ['new', { title: 'New Circular', circular_no: 'NEW/9', issue_date: '2020-01-01' }],
  ['mid', { title: 'Mid Circular', circular_no: 'MID/5', issue_date: '2015-01-01' }],
  ['old', { title: 'Old Circular', circular_no: 'OLD/1', issue_date: '2010-01-01' }],
  ['B', { title: 'Doc B', circular_no: 'B', issue_date: null }],
  ['C', { title: 'Doc C', circular_no: 'C', issue_date: null }],
  ['X', { title: 'Doc X', circular_no: 'X', issue_date: null }],
  ['Y', { title: 'Doc Y', circular_no: 'Y', issue_date: null }],
]);

const view = (rows: LineageRow[]) => buildLineageView(rows, docs);
const at = (v: ReturnType<typeof view>, id: string) => {
  const n = v?.nodes.find(x => x.document_id === id);
  return n ? { status: n.status, rel: n.relations.map(r => [r.kind, r.target_document_id]) } : null;
};

it('amends: slip (newer) leads and names Vol II as its target; both stay in force', () => {
  const v = view([{ document_id: 'slip', relation: 'amends', related_document_id: 'volII', note: 'Revises Para 2720.' }]);
  expect(v?.nodes.map(n => n.document_id)).toEqual(['slip', 'volII']);
  expect(at(v, 'slip')).toEqual({ status: 'in_force', rel: [['amends', 'volII']] });
  expect(at(v, 'volII')).toEqual({ status: 'in_force', rel: [] });
  expect(v?.nodes[0].relations[0].note).toBe('Revises Para 2720.');
});

it('amended_by is normalized to the same forward relation', () => {
  const v = view([{ document_id: 'volII', relation: 'amended_by', related_document_id: 'slip', note: null }]);
  expect(at(v, 'slip')).toEqual({ status: 'in_force', rel: [['amends', 'volII']] });
});

it('supersedes marks only the older document superseded', () => {
  const v = view([{ document_id: 'new', relation: 'supersedes', related_document_id: 'old', note: null }]);
  expect(at(v, 'new')).toEqual({ status: 'in_force', rel: [['supersedes', 'old']] });
  expect(at(v, 'old')).toEqual({ status: 'superseded', rel: [] });
});

it('superseded_by flips direction so the superseding doc is in force', () => {
  const v = view([{ document_id: 'old', relation: 'superseded_by', related_document_id: 'new', note: null }]);
  expect(at(v, 'new')?.status).toBe('in_force');
  expect(at(v, 'old')?.status).toBe('superseded');
});

it('P0: a document in the MIDDLE of a chain is correctly superseded (given the full component)', () => {
  const v = view([
    { document_id: 'new', relation: 'supersedes', related_document_id: 'mid', note: null },
    { document_id: 'mid', relation: 'supersedes', related_document_id: 'old', note: null },
  ]);
  expect(v?.nodes.map(n => n.document_id)).toEqual(['new', 'mid', 'old']);          // newest-first
  expect(at(v, 'new')).toEqual({ status: 'in_force', rel: [['supersedes', 'mid']] });
  expect(at(v, 'mid')).toEqual({ status: 'superseded', rel: [['supersedes', 'old']] }); // superseded AND supersedes
  expect(at(v, 'old')).toEqual({ status: 'superseded', rel: [] });
});

it('P1: branching — a doc that supersedes one and amends another keeps BOTH relations', () => {
  const v = view([
    { document_id: 'new', relation: 'supersedes', related_document_id: 'B', note: null },
    { document_id: 'new', relation: 'amends', related_document_id: 'C', note: 'tweaks C' },
  ]);
  expect(at(v, 'new')).toEqual({ status: 'in_force', rel: [['amends', 'C'], ['supersedes', 'B']] });
  expect(at(v, 'B')?.status).toBe('superseded');
  expect(at(v, 'C')?.status).toBe('in_force');    // amended, not superseded
});

it('P1: two disjoint chains both appear, neither dropped', () => {
  const v = view([
    { document_id: 'new', relation: 'supersedes', related_document_id: 'B', note: null },
    { document_id: 'X', relation: 'supersedes', related_document_id: 'Y', note: null },
  ]);
  expect(v?.nodes.map(n => n.document_id).sort()).toEqual(['B', 'X', 'Y', 'new']);
  expect(at(v, 'B')?.status).toBe('superseded');
  expect(at(v, 'Y')?.status).toBe('superseded');
});

it('dedups a relationship stored as both a forward row and its inverse', () => {
  const v = view([
    { document_id: 'slip', relation: 'amends', related_document_id: 'volII', note: 'n' },
    { document_id: 'volII', relation: 'amended_by', related_document_id: 'slip', note: 'n' },
  ]);
  expect(at(v, 'slip')?.rel).toEqual([['amends', 'volII']]);   // one edge, not two
});

it('carries document metadata onto each node', () => {
  const v = view([{ document_id: 'new', relation: 'supersedes', related_document_id: 'old', note: null }]);
  expect(v?.nodes[0]).toMatchObject({ document_id: 'new', circular_no: 'NEW/9', issue_date: '2020-01-01', title: 'New Circular', status: 'in_force' });
});

it('returns null when there are no relationships', () => {
  expect(buildLineageView([], docs)).toBeNull();
});

it('falls back to a placeholder title for a document not in the metadata map', () => {
  const v = view([{ document_id: 'ghost', relation: 'amends', related_document_id: 'volII', note: null }]);
  expect(v?.nodes.find(n => n.document_id === 'ghost')).toMatchObject({ title: 'Unknown document', status: 'in_force' });
});
