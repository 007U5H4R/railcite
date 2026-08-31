import { describe, it, expect } from 'vitest';
import { stripInlineCitations, stripLeadingNumber, buildNoteText } from '@/lib/note';


describe('prose sanitizers (the officer copies these artifacts verbatim)', () => {
  it('strips the duplicated inline citation echo, keeping terminal punctuation', () => {
    // Regression: the model echoes "[5]" in its prose and we ALSO render the authoritative
    // chips, so the answer and the note read "…charge (Rs.300/-) [5]. [5]".
    expect(stripInlineCitations('Demurrage accrues at Rs.300/- [5].')).toBe('Demurrage accrues at Rs.300/-.');
    expect(stripInlineCitations('Waiver needs concurrence [1][5].')).toBe('Waiver needs concurrence.');
    expect(stripInlineCitations('व्हार्फेज देय है [5]।')).toBe('व्हार्फेज देय है।');
    expect(stripInlineCitations('No citations here.')).toBe('No citations here.');
  });
  it('strips a leading list number the <ol> renders again', () => {
    // Regression: note points rendered "1. 1. Free time is…".
    expect(stripLeadingNumber('1. Free time is six hours.')).toBe('Free time is six hours.');
    expect(stripLeadingNumber('12) Wharfage applies.')).toBe('Wharfage applies.');
    expect(stripLeadingNumber('2026 was the revision year.')).toBe('2026 was the revision year.');  // not a marker
  });
  it('buildNoteText emits each point once, numbered once, with canonical citation marks', () => {
    const note = [{ text: '1. Free time is six hours [2].', citations: [2] }];
    const sources = [{ n: 2, chunk_id: 'c', snippet: '', page_ref: 'p. 4', section_ref: null,
      similarity: 0.9, document: { id: 'd', title: 'T', doc_type: 'circular', circular_no: 'TC-1/2021',
        issue_date: null, is_ocr: false, source_url: null, domain: null, commodity: null } }] as never;
    const out = buildNoteText(note, sources);
    expect(out).toContain('1. Free time is six hours. [2]');
    expect(out).not.toContain('1. 1.');
    expect(out).not.toContain('[2]. [2]');
  });
});
