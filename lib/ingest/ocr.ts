import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const run = promisify(execFile);

/** Render → OCR each page. Slow by nature; callers log progress per page. */
export async function ocrPdf(pdfPath: string): Promise<string[]> {
  const dir = await mkdtemp(path.join(tmpdir(), 'railcite-ocr-'));
  try {
    await run('pdftoppm', ['-r', '200', '-png', pdfPath, path.join(dir, 'pg')],
      { maxBuffer: 16 * 1024 * 1024 });
    const imgs = (await readdir(dir)).filter(f => f.endsWith('.png')).sort();
    const pages: string[] = [];
    for (const img of imgs) {
      const { stdout } = await run('tesseract', [path.join(dir, img), 'stdout', '-l', 'eng'],
        { maxBuffer: 16 * 1024 * 1024 });
      pages.push(stdout.trim());
      console.log(`  ocr ${img}: ${stdout.trim().length} chars`);
    }
    return pages;
  } finally { await rm(dir, { recursive: true, force: true }); }
}
