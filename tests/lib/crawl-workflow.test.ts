import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const wf = readFileSync(
  join(__dirname, '..', '..', '.github', 'workflows', 'daily-crawl.yml'), 'utf8');

describe('daily-crawl workflow', () => {
  // 18:00 UTC == 23:30 IST — end of day, as specified.
  it('runs at end of day IST', () => {
    expect(wf).toMatch(/cron:\s*['"]0 18 \* \* \*['"]/);
  });

  it('can also be triggered by hand for debugging', () => {
    expect(wf).toContain('workflow_dispatch');
  });

  it('installs the OCR toolchain the ingest path shells out to', () => {
    expect(wf).toContain('poppler-utils');
    expect(wf).toContain('tesseract-ocr');
  });

  it('passes the three secrets ingest needs', () => {
    for (const s of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VOYAGE_API_KEY']) {
      expect(wf).toContain(s);
    }
  });

  // Ingest embeds but never synthesises; shipping an unused model key to CI
  // would widen the blast radius of a leaked secret for no benefit.
  it('does not ship an Anthropic key to the runner', () => {
    expect(wf).not.toContain('ANTHROPIC');
  });

  it('actually applies, rather than dry-running forever', () => {
    expect(wf).toContain('--apply');
  });
});
