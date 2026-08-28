// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { ConclusionCard } from '@/components/ConclusionCard';
import type { SourceView } from '@/lib/types';

const S: SourceView = { n: 1, chunk_id: 'c1', snippet: 'Free time for unloading shall be…',
  page_ref: 'p. 4', section_ref: null, similarity: 0.8,
  document: { id: 'd1', title: 'T', doc_type: 'circular', circular_no: 'TCR/1078/2019',
    issue_date: '2019-03-12', is_ocr: false, source_url: null, domain: 'goods', commodity: null } };

it('renders each block with its numbered chips and a11y labels', () => {
  const onCite = vi.fn();
  render(<ConclusionCard blocks={[{ text: 'Free time is 9 hours.', citations: [1] }]} sources={[S]} onCite={onCite} />);
  expect(screen.getByText(/Free time is 9 hours/)).toBeInTheDocument();
  const chip = screen.getByRole('button', { name: /Source 1: TCR\/1078\/2019, verified text/ });
  fireEvent.click(chip);
  expect(onCite).toHaveBeenCalledWith(S);
});
it('never renders a block whose citations are empty (defense in depth)', () => {
  render(<ConclusionCard blocks={[{ text: 'UNCITED', citations: [] }]} sources={[S]} onCite={() => {}} />);
  expect(screen.queryByText('UNCITED')).not.toBeInTheDocument();
});
it('OCR source chip label carries the verify warning', () => {
  const ocr = { ...S, document: { ...S.document, is_ocr: true } };
  render(<ConclusionCard blocks={[{ text: 'x.', citations: [1] }]} sources={[ocr]} onCite={() => {}} />);
  expect(screen.getByRole('button', { name: /OCR — verify against original/ })).toBeInTheDocument();
});
