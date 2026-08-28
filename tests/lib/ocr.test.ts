import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ocrPdf } from '@/lib/ingest/ocr';

const hasBins = (() => { try { execSync('command -v tesseract && command -v pdftoppm', {stdio:'ignore'}); return true; } catch { return false; } })();
const dataDir = path.resolve(process.env.DATA_DIR ?? '../Data');
const slip = existsSync(dataDir)
  ? readdirSync(dataDir).find(f => /correction/i.test(f) && f.endsWith('.pdf'))
  : undefined;

// Slow (~100s: renders + OCRs 41 real pages). Opt-in so the default TDD loop stays fast:
//   RUN_OCR_IT=1 npm test   (also run at the Phase-2 QA gate + final whole-branch review).
describe.skipIf(!hasBins || !slip || !process.env.RUN_OCR_IT)('ocrPdf (integration — scanned correction slip)', () => {
  it('extracts non-trivial text from the scanned correction slip', async () => {
    const pages = await ocrPdf(path.join(dataDir, slip!));
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.join('').replace(/\s/g, '').length).toBeGreaterThan(100);
  }, 300_000);
});
