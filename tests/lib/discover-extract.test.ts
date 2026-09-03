import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractPdfLinks, extractChildSections, SECTIONS } from '../../lib/ingest/discover';

const fixture = (n: string) =>
  readFileSync(join(__dirname, '..', 'fixtures', 'crawl', n), 'utf8');
const BASE = 'https://indianrailways.gov.in/railwayboard/uploads/directorate/traffic_comm/rate-letter.jsp';

describe('extractPdfLinks', () => {
  // A naive /href="([^"]+)"/ regex finds ZERO pdfs on this page, which actually
  // carries 80 — it uses single-quoted/unquoted hrefs. That miss would have
  // silently dropped the entire 942-document Rates-Letters series.
  it('finds single-quoted and unquoted hrefs, not just double-quoted', () => {
    const links = extractPdfLinks(fixture('rate-letter-legacy.html'), BASE);
    expect(links.length).toBeGreaterThanOrEqual(70);
    expect(links.every(l => l.url.startsWith('https://'))).toBe(true);
  });

  it('resolves relative hrefs against the page URL', () => {
    const links = extractPdfLinks(`<a href='downloads/x.pdf'>X</a>`, BASE);
    expect(links[0].url).toBe(
      'https://indianrailways.gov.in/railwayboard/uploads/directorate/traffic_comm/downloads/x.pdf');
  });

  it('resolves root-relative hrefs against the host', () => {
    const links = extractPdfLinks(`<a href="/railwayboard/uploads/a.pdf">A</a>`, BASE);
    expect(links[0].url).toBe('https://indianrailways.gov.in/railwayboard/uploads/a.pdf');
  });

  it('ignores non-pdf links', () => {
    expect(extractPdfLinks(`<a href="index.jsp">x</a>`, BASE)).toHaveLength(0);
  });

  it('captures the anchor text as the title', () => {
    const links = extractPdfLinks(`<a href="a.pdf"> CC 73 of 2016 </a>`, BASE);
    expect(links[0].title).toBe('CC 73 of 2016');
  });

  it('deduplicates a url linked more than once on one page', () => {
    const links = extractPdfLinks(`<a href="a.pdf">A</a><a href="a.pdf">A again</a>`, BASE);
    expect(links).toHaveLength(1);
  });
});

describe('extractChildSections', () => {
  // Every page embeds the whole site nav (~200 id links). Only ids that extend
  // the parent's id are real children; without this filter the crawler would
  // walk the entire site.
  it('returns only true children, not the site navigation', () => {
    const kids = extractChildSections(fixture('s_862.html'), '0,1,304,366,555,862');
    expect(kids.length).toBeGreaterThanOrEqual(25);
    expect(kids.length).toBeLessThan(60);
    expect(kids.every(k => k.id.startsWith('0,1,304,366,555,862,'))).toBe(true);
  });

  it('parses the year out of the child label', () => {
    const kids = extractChildSections(fixture('s_862.html'), '0,1,304,366,555,862');
    const years = kids.map(k => k.year).filter((y): y is number => y !== null);
    expect(years).toContain(2026);
    expect(years).toContain(2025);
  });

  it('leaves year null for children that are not year pages', () => {
    const kids = extractChildSections(fixture('s_862.html'), '0,1,304,366,555,862');
    expect(kids.some(k => k.year === null && /master circulars/i.test(k.label))).toBe(true);
  });
});

describe('SECTIONS', () => {
  it('every section id extends the Traffic Commercial root', () => {
    expect(SECTIONS.every(s => s.id.startsWith('0,1,304,366,555,'))).toBe(true);
  });

  it('marks which domain mappings are corroborated against real documents', () => {
    // Only four were checked against the corpus; the rest are name-inferred and
    // must be spot-checked before the first live run (spec §3).
    const verified = SECTIONS.filter(s => s.verified).map(s => s.label);
    expect(verified).toContain('Commercial Circular');
    expect(verified).toContain('Freight Marketing Circulars');
    expect(SECTIONS.some(s => !s.verified)).toBe(true);
  });
});
