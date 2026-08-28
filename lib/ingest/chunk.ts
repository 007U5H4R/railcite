import type { ChunkInput } from '@/lib/types';

const est = (s: string) => Math.ceil(s.length / 4);
interface Para { text: string; page: number }

export function chunkPages(pages: string[], opts?: { targetTokens?: number; overlapTokens?: number }): ChunkInput[] {
  const target = opts?.targetTokens ?? 1000;
  const overlap = opts?.overlapTokens ?? 150;

  const paras: Para[] = [];
  pages.forEach((page, i) => {
    for (const t of page.split(/\n{2,}/)) {
      const text = t.trim();
      if (text) paras.push({ text, page: i + 1 });
    }
  });

  const out: ChunkInput[] = [];
  let buf: Para[] = [];
  let bufTok = 0;

  const flush = () => {
    if (!buf.length) return;
    const first = buf[0].page, last = buf[buf.length - 1].page;
    out.push({
      chunk_text: buf.map((para) => para.text).join('\n\n'),
      page_ref: first === last ? `p. ${first}` : `p. ${first}–${last}`,
      token_count: bufTok,
    });
    // Carry trailing paragraphs (~overlap tokens) into the next chunk. Walk backward
    // from the tail and stop BEFORE adding a paragraph that would push the carried
    // total over `overlap` — this keeps the carry a contiguous suffix of `buf` that
    // never exceeds budget, so the next chunk starts with (not swallows) the tail.
    const carry: Para[] = [];
    let carryTok = 0;
    for (let i = buf.length - 1; i >= 0; i--) {
      const t = est(buf[i].text);
      if (carryTok + t > overlap) break;
      carry.unshift(buf[i]);
      carryTok += t;
    }
    buf = carry;
    bufTok = carryTok;
  };

  for (const p of paras) {
    const t = est(p.text);
    if (bufTok + t > target && bufTok > 0) flush();
    buf.push(p);
    bufTok += t;
  }
  // Final flush has no overlap-carry step. Guard against re-emitting a duplicate
  // tail chunk in case `buf` is only the unconsumed carry from the last flush
  // (identical text to the chunk already pushed).
  if (buf.length) {
    const first = buf[0].page, last = buf[buf.length - 1].page;
    const text = buf.map((para) => para.text).join('\n\n');
    const prev = out.at(-1);
    if (!prev || prev.chunk_text !== text) {
      out.push({
        chunk_text: text,
        page_ref: first === last ? `p. ${first}` : `p. ${first}–${last}`,
        token_count: bufTok,
      });
    }
  }
  return out;
}
