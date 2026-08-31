// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { LineagePanel } from '@/components/LineagePanel';
import type { LineageView } from '@/lib/types';

const AMEND: LineageView = { nodes: [
  { document_id: 'slip', circular_no: null, issue_date: null, title: 'IRCM Vol. II — Correction Slip',
    status: 'in_force', relations: [{ kind: 'amends', target_document_id: 'volII', note: 'Revises Para 2720 (Ch. XXVI).' }] },
  { document_id: 'volII', circular_no: null, issue_date: null, title: 'IRCM Vol. II (Goods)',
    status: 'in_force', relations: [] },
] };

it('renders both docs, the amends relation naming its specific target, and the note', () => {
  render(<LineagePanel lineage={AMEND} />);
  const panel = screen.getByLabelText('Document lineage');
  expect(panel.textContent).toContain('IRCM Vol. II — Correction Slip');
  expect(panel.textContent).toContain('amends');
  expect(panel.textContent).toContain('IRCM Vol. II (Goods)');            // the named target
  expect(panel.textContent).toContain('Revises Para 2720 (Ch. XXVI).');
  expect(screen.getAllByText('In force')).toHaveLength(2);                // an amendment leaves both in force
});

it('marks a superseded doc, names the target, and prefers circular_no in the heading', () => {
  const SUPERSEDE: LineageView = { nodes: [
    { document_id: 'new', circular_no: 'NEW/9', issue_date: '2020-01-01', title: 'New Circular',
      status: 'in_force', relations: [{ kind: 'supersedes', target_document_id: 'old', note: null }] },
    { document_id: 'old', circular_no: 'OLD/1', issue_date: '2010-01-01', title: 'Old Circular',
      status: 'superseded', relations: [] },
  ] };
  render(<LineagePanel lineage={SUPERSEDE} />);
  const panel = screen.getByLabelText('Document lineage');
  expect(screen.getByText('Superseded')).toBeInTheDocument();
  expect(screen.getByText('In force')).toBeInTheDocument();
  expect(panel.textContent).toContain('supersedes');
  expect(panel.textContent).toContain('NEW/9');    // circular_no wins over title
  expect(panel.textContent).toContain('OLD/1');    // named as the supersedes target
});

it('branching: a node with two relations renders both', () => {
  const BRANCH: LineageView = { nodes: [
    { document_id: 'a', circular_no: 'A/1', issue_date: null, title: 'A', status: 'in_force', relations: [
      { kind: 'amends', target_document_id: 'c', note: null },
      { kind: 'supersedes', target_document_id: 'b', note: null },
    ] },
    { document_id: 'b', circular_no: 'B/1', issue_date: null, title: 'B', status: 'superseded', relations: [] },
    { document_id: 'c', circular_no: 'C/1', issue_date: null, title: 'C', status: 'in_force', relations: [] },
  ] };
  render(<LineagePanel lineage={BRANCH} />);
  const panel = screen.getByLabelText('Document lineage');
  expect(panel.textContent).toContain('amends');
  expect(panel.textContent).toContain('supersedes');
  expect(panel.textContent).toContain('B/1');
  expect(panel.textContent).toContain('C/1');
});

it('renders nothing for an empty chain', () => {
  const { container } = render(<LineagePanel lineage={{ nodes: [] }} />);
  expect(container).toBeEmptyDOMElement();
});

it('leads with the cited chain and collapses the rest behind a disclosure', () => {
  // Regression: a flat list of every related document rendered 20+ identically-weighted rows, so
  // the supersession that justified the answer was indistinguishable from uncited siblings — and
  // it pushed the drafted note far down the page.
  const many: LineageView = { nodes: [
    ...AMEND.nodes,
    { document_id: 'x1', circular_no: 'RC-1', issue_date: null, title: 'Unrelated corrigendum 1', status: 'in_force', relations: [] },
    { document_id: 'x2', circular_no: 'RC-2', issue_date: null, title: 'Unrelated corrigendum 2', status: 'in_force', relations: [] },
  ] };
  render(<LineagePanel lineage={many} citedDocumentIds={['slip']} />);
  // The cited doc and what it amends are shown and marked…
  expect(screen.getAllByText(/Correction Slip/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/IRCM Vol\. II \(Goods\)/).length).toBeGreaterThan(0);
  expect(screen.getByText(/Cited in this answer/)).toBeInTheDocument();
  // …the uncited siblings are not, until asked for.
  expect(screen.queryByText('RC-1')).not.toBeInTheDocument();
  const more = screen.getByRole('button', { name: /show 2 more related documents/i });
  fireEvent.click(more);
  expect(screen.getByText('RC-1')).toBeInTheDocument();
});

it('shows every node when the answer cites none of them (no false emphasis)', () => {
  render(<LineagePanel lineage={AMEND} />);
  expect(screen.getAllByText(/Correction Slip/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/IRCM Vol\. II \(Goods\)/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/Cited in this answer/)).not.toBeInTheDocument();
});
