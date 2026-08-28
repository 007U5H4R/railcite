import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

/** pdftotext -layout to stdout; pages arrive separated by form-feed. */
export async function extractPdfText(path: string): Promise<{ pages: string[]; totalChars: number }> {
  const { stdout } = await run('pdftotext', ['-layout', '-enc', 'UTF-8', path, '-'],
    { maxBuffer: 64 * 1024 * 1024 });
  // Collapse -layout's multi-space padding to a single space; do NOT strip all spaces
  // (that would delete word boundaries, e.g. "demurrage charge" -> "demurragecharge").
  const pages = stdout.split('\f').map(p => p.replace(/ {2,}/g, ' ').trimEnd());
  while (pages.length && pages[pages.length - 1] === '') pages.pop();
  const totalChars = pages.reduce((n, p) => n + p.trim().length, 0);
  return { pages, totalChars };
}

/** Scanned-PDF heuristic: OCR when text yield is near zero (Design.md OCR rule). */
export function needsOcr(pages: string[]): boolean {
  const total = pages.reduce((n, p) => n + p.trim().length, 0);
  if (total < 200) return true;
  return total / Math.max(pages.length, 1) < 120;
}
