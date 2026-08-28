import { chunkPages } from '@/lib/ingest/chunk';
import { threePages } from '../fixtures/pages';

it('packs paragraphs to target and never returns empty chunks', () => {
  const chunks = chunkPages(threePages, { targetTokens: 400, overlapTokens: 50 });
  expect(chunks.length).toBeGreaterThan(1);
  for (const c of chunks) {
    expect(c.chunk_text.trim().length).toBeGreaterThan(0);
    expect(c.token_count).toBeGreaterThan(0);
    expect(c.token_count).toBeLessThanOrEqual(700);          // target + one paragraph slack
    expect(c.page_ref).toMatch(/^p\. \d+(–\d+)?$/);
  }
});
it('overlaps: next chunk starts with tail paragraph of previous', () => {
  const chunks = chunkPages(threePages, { targetTokens: 400, overlapTokens: 200 });
  const tail = chunks[0].chunk_text.split('\n\n').at(-1)!;
  expect(chunks[1].chunk_text.startsWith(tail)).toBe(true);
});
it('covers all content (last paragraph present) and keeps page numbering 1-based', () => {
  const chunks = chunkPages(threePages, { targetTokens: 400 });
  expect(chunks.at(-1)!.chunk_text).toContain('Para-8');
  expect(chunks[0].page_ref.startsWith('p. 1')).toBe(true);
});
it('skips whitespace-only pages', () => {
  expect(chunkPages(['   \n  ', ''])).toEqual([]);
});
