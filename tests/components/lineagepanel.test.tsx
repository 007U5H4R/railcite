// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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
