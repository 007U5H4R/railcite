// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '@/components/StatusBadge';
import { SourceCard } from '@/components/SourceCard';
import type { SourceView } from '@/lib/types';

const S = (over: Partial<SourceView['document']> = {}): SourceView => ({ n: 2, chunk_id: 'c2',
  snippet: 'Wharfage shall be levied…', page_ref: 'p. 7', section_ref: null, similarity: 0.71,
  document: { id: 'd2', title: 'IRCM Vol II', doc_type: 'manual', circular_no: null,
    issue_date: null, is_ocr: false, source_url: null, domain: 'goods', commodity: null, ...over } });

it('badges always pair icon+text (never color alone)', () => {
  render(<><StatusBadge kind="verified" /><StatusBadge kind="ocr" /></>);
  expect(screen.getByText(/✓ Verified text/)).toBeInTheDocument();
  expect(screen.getByText(/⚠ OCR — verify against original/)).toBeInTheDocument();
});
it('source card: mono metadata, snippet, supporting label for manuals', () => {
  render(<SourceCard source={S()} active={false} onOpen={() => {}} />);
  expect(screen.getByText('Supporting')).toBeInTheDocument();
  expect(screen.getByText(/Wharfage shall be levied/)).toBeInTheDocument();
  expect(screen.getByText(/p\. 7/)).toBeInTheDocument();
});
it('primary circular label + OCR badge on OCR circulars', () => {
  render(<SourceCard source={S({ doc_type: 'circular', circular_no: 'TC-I/2020/108', is_ocr: true })}
    active={false} onOpen={() => {}} />);
  expect(screen.getByText('Primary circular')).toBeInTheDocument();
  expect(screen.getByText(/⚠ OCR/)).toBeInTheDocument();
});
