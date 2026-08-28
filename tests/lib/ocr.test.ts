import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ocrPdf } from '@/lib/ingest/ocr';

const hasBins = (() => { try { execSync('command -v tesseract && command -v pdftoppm', {stdio:'ignore'}); return true; } catch { return false; } })();
const dataDir = path.resolve(process.env.DATA_DIR ?? '../Data');
const slip = existsSync(dataDir)
  ? readdirSync(dataDir).find(f => /correction/i.test(f) && f.endsWith('.pdf'))
  : undefined;

describe.skipIf(!hasBins || !slip)('ocrPdf (integration — scanned correction slip)', () => {
  it('extracts non-trivial text from the scanned correction slip', async () => {
    const pages = await ocrPdf(path.join(dataDir, slip!));
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.join('').replace(/\s/g, '').length).toBeGreaterThan(100);
  }, 300_000);
});
