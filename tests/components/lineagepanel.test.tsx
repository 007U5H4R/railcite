// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { LineagePanel } from '@/components/LineagePanel';
import type { LineageView } from '@/lib/types';

const AMEND: LineageView = { nodes: [
  { document_id: 'slip', circular_no: null, issue_date: null, title: 'IRCM Vol. II — Correction Slip',
    status: 'in_force', relation_to_prev: 'amends', note: 'Revises Para 2720 (Ch. XXVI).' },
  { document_id: 'volII', circular_no: null, issue_date: null, title: 'IRCM Vol. II (Goods)',
    status: 'in_force', relation_to_prev: null, note: null },
] };

it('renders the chain newest-first with both docs, the amends relation, and its note', () => {
  render(<LineagePanel lineage={AMEND} />);
  expect(screen.getByText('IRCM Vol. II — Correction Slip')).toBeInTheDocument();
  expect(screen.getByText('IRCM Vol. II (Goods)')).toBeInTheDocument();
  expect(screen.getByText(/amends the document below/)).toBeInTheDocument();
  expect(screen.getByText('Revises Para 2720 (Ch. XXVI).')).toBeInTheDocument();
  expect(screen.getAllByText('In force')).toHaveLength(2);   // an amendment leaves both in force
});

it('marks a superseded doc with the Superseded badge and prefers circular_no in the heading', () => {
  const SUPERSEDE: LineageView = { nodes: [
    { document_id: 'new', circular_no: 'NEW/9', issue_date: '2020-01-01', title: 'New Circular',
      status: 'in_force', relation_to_prev: 'supersedes', note: null },
    { document_id: 'old', circular_no: 'OLD/1', issue_date: '2010-01-01', title: 'Old Circular',
      status: 'superseded', relation_to_prev: null, note: null },
  ] };
  render(<LineagePanel lineage={SUPERSEDE} />);
  expect(screen.getByText('Superseded')).toBeInTheDocument();
  expect(screen.getByText('In force')).toBeInTheDocument();
  expect(screen.getByText(/supersedes the document below/)).toBeInTheDocument();
  expect(screen.getByText('NEW/9')).toBeInTheDocument();     // circular_no wins over title
});

it('renders nothing for an empty chain', () => {
  const { container } = render(<LineagePanel lineage={{ nodes: [] }} />);
  expect(container).toBeEmptyDOMElement();
});
