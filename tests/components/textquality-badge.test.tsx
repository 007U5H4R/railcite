// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { StatusBadge, statusForText } from '@/components/StatusBadge';
import { SourceCard } from '@/components/SourceCard';
import type { SourceView } from '@/lib/types';

// Regression scar: FM-01 (2013-01-15) stored mojibake, but because is_ocr=false it was shown
// under the green "✓ Verified text" badge — RailCite vouching for text it cannot read. The
// badge must never claim verification for a low-quality extraction.
describe('low-quality extraction is never badged as verified', () => {
  describe('statusForText precedence', () => {
    it('illegible text outranks a clean embedded extraction', () => {
      expect(statusForText({ is_ocr: false, text_quality: 'low' })).toBe('low_quality');
    });

    it('illegible text outranks OCR', () => {
      expect(statusForText({ is_ocr: true, text_quality: 'low' })).toBe('low_quality');
    });

    it('legible embedded text is still verified', () => {
      expect(statusForText({ is_ocr: false, text_quality: 'ok' })).toBe('verified');
    });

    it('legible OCR text is still the OCR warning', () => {
      expect(statusForText({ is_ocr: true, text_quality: 'ok' })).toBe('ocr');
    });

    it('treats a missing text_quality as ok rather than assuming the worst', () => {
      expect(statusForText({ is_ocr: false })).toBe('verified');
      expect(statusForText({ is_ocr: false, text_quality: null })).toBe('verified');
    });
  });

  it('renders wording that tells the officer to check the PDF', () => {
    render(<StatusBadge kind="low_quality" />);
    expect(screen.getByText(/low-quality extraction — verify against original/i)).toBeInTheDocument();
    expect(screen.queryByText(/verified text/i)).not.toBeInTheDocument();
  });

  it('a source card for the reported FM-01 document does not claim verification', () => {
    const source = {
      n: 1,
      chunk_id: 'c1',
      snippet: `6 ]O t'oN a6Dd s^D,ultDd/Jauolssluulo`,
      page_ref: 'p. 3',
      section_ref: null,
      similarity: 0.42,
      document: {
        id: 'd1',
        title: 'FM-01',
        doc_type: 'circular',
        circular_no: 'FM-01 / 2012',
        issue_date: '2013-01-15',
        is_ocr: false,             // embedded text layer — the trap that produced the bug
        text_quality: 'low',
        source_url: 'https://indianrailways.gov.in/x/FM_01_2012.pdf',
        domain: 'goods',
        commodity: null,
      },
    } as unknown as SourceView;

    render(<SourceCard source={source} active={false} onOpen={() => {}} />);
    expect(screen.getByText(/low-quality extraction/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Verified text$/i)).not.toBeInTheDocument();
    // and the label is now year-qualified, so it cannot be confused with another FM-01
    expect(screen.getByText('FM-01 / 2012')).toBeInTheDocument();
  });
});
