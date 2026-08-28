import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { needsOcr, extractPdfText } from '@/lib/ingest/extract';

describe('needsOcr', () => {
  it('true for near-empty scans', () => {
    expect(needsOcr(['', ' \n ', ''])).toBe(true);
    expect(needsOcr(['ab'.repeat(30)])).toBe(true);          // 60 chars avg < 120
  });
  it('false for real text pages', () => {
    expect(needsOcr([ 'x'.repeat(500), 'y'.repeat(800) ])).toBe(false);
  });
});

// Integration: robust to a mixed Data/ dir where one PDF is a scan (near-zero text).
// Iterate every .pdf under DATA_DIR (fallback ../Data) and assert against the first
// one that yields real text (totalChars > 500), rather than assuming file [0] is text.
const dataDir = path.resolve(process.env.DATA_DIR ?? '../Data');
const pdfFiles = existsSync(dataDir)
  ? readdirSync(dataDir).filter((f) => f.toLowerCase().endsWith('.pdf'))
  : [];

describe.skipIf(pdfFiles.length === 0)('extractPdfText (integration, real Data/)', () => {
  it('extracts readable text with word boundaries preserved from a real manual', async () => {
    let real: { pages: string[]; totalChars: number } | null = null;
    for (const f of pdfFiles) {
      const r = await extractPdfText(path.join(dataDir, f));
      if (r.totalChars > 500) { real = r; break; }
    }
    expect(real, 'expected at least one PDF in DATA_DIR with totalChars > 500 (a real text manual, not a scan)').not.toBeNull();
    expect(real!.pages.length).toBeGreaterThan(0);
    expect(real!.totalChars).toBeGreaterThan(0);
    // word-space-word: proves inter-word spaces survived extraction (the corrected regex).
    expect(real!.pages.join(' ')).toMatch(/\w \w/);
  }, 60_000);
});
