import { buildLineageView, type LineageRow, type LineageDoc } from '@/lib/lineage';

const docs = new Map<string, LineageDoc>([
  ['slip', { title: 'IRCM Vol. II — Correction Slip', circular_no: null, issue_date: null }],
  ['volII', { title: 'IRCM Vol. II (Goods)', circular_no: null, issue_date: null }],
  ['old', { title: 'Old Circular', circular_no: 'OLD/1', issue_date: '2010-01-01' }],
  ['mid', { title: 'Mid Circular', circular_no: 'MID/5', issue_date: '2015-01-01' }],
  ['new', { title: 'New Circular', circular_no: 'NEW/9', issue_date: '2020-01-01' }],
]);

const shape = (rows: LineageRow[]) =>
  buildLineageView(rows, docs)?.nodes.map(n => [n.document_id, n.status, n.relation_to_prev]);

it('amends: the correction slip sits on top and BOTH documents stay in force', () => {
  expect(shape([{ document_id: 'slip', relation: 'amends', related_document_id: 'volII', note: null }])).toEqual([
    ['slip', 'in_force', 'amends'],
    ['volII', 'in_force', null],
  ]);
});

it('amended_by is normalized to the same forward chain (slip still newer/on top)', () => {
  expect(shape([{ document_id: 'volII', relation: 'amended_by', related_document_id: 'slip', note: null }])).toEqual([
    ['slip', 'in_force', 'amends'],
    ['volII', 'in_force', null],
  ]);
});

it('supersedes marks ONLY the older document superseded', () => {
  expect(shape([{ document_id: 'new', relation: 'supersedes', related_document_id: 'old', note: null }])).toEqual([
    ['new', 'in_force', 'supersedes'],
    ['old', 'superseded', null],
  ]);
});

it('superseded_by flips direction so the superseding doc leads', () => {
  expect(shape([{ document_id: 'old', relation: 'superseded_by', related_document_id: 'new', note: null }])).toEqual([
    ['new', 'in_force', 'supersedes'],
    ['old', 'superseded', null],
  ]);
});

it('walks a multi-step supersession chain newest-first', () => {
  expect(shape([
    { document_id: 'new', relation: 'supersedes', related_document_id: 'mid', note: null },
    { document_id: 'mid', relation: 'supersedes', related_document_id: 'old', note: null },
  ])).toEqual([
    ['new', 'in_force', 'supersedes'],
    ['mid', 'superseded', 'supersedes'],
    ['old', 'superseded', null],
  ]);
});

it('carries the document metadata and the relationship note onto the upper node', () => {
  const v = buildLineageView([{ document_id: 'new', relation: 'supersedes', related_document_id: 'old', note: 'Revises Para 42.' }], docs);
  expect(v?.nodes[0]).toEqual({ document_id: 'new', circular_no: 'NEW/9', issue_date: '2020-01-01',
    title: 'New Circular', status: 'in_force', relation_to_prev: 'supersedes', note: 'Revises Para 42.' });
  expect(v?.nodes[1].note).toBeNull();   // the older node has no relationship below it
});

it('returns null when there are no relationships', () => {
  expect(buildLineageView([], docs)).toBeNull();
});

it('falls back to a placeholder title for a document not in the metadata map', () => {
  const v = buildLineageView([{ document_id: 'ghost', relation: 'amends', related_document_id: 'volII', note: null }], docs);
  expect(v?.nodes[0]).toMatchObject({ document_id: 'ghost', title: 'Unknown document', status: 'in_force' });
});
