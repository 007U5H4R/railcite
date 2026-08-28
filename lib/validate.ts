import type { ConclusionBlock, SynthesisResult } from './types';

const STRUCTURAL = /^(sub:|ref:|submitted)/i;

function clean(citations: number[], sourceCount: number): number[] {
  const seen = new Set<number>(); const out: number[] = [];
  for (const n of citations)
    if (Number.isInteger(n) && n >= 1 && n <= sourceCount && !seen.has(n)) { seen.add(n); out.push(n); }
  return out;
}

export function validateSynthesis(r: SynthesisResult, sourceCount: number):
  | { status: 'answered'; blocks: ConclusionBlock[]; note: ConclusionBlock[]; dropped: number }
  | { status: 'refused' } {
  if (r.status === 'refused' || sourceCount <= 0) return { status: 'refused' };
  let dropped = 0;
  const blocks: ConclusionBlock[] = [];
  for (const b of r.blocks) {
    const cites = clean(b.citations, sourceCount);
    if (cites.length) blocks.push({ text: b.text, citations: cites });
    else dropped++;                                   // P0: uncitable claims never render
  }
  if (!blocks.length) return { status: 'refused' };
  const note: ConclusionBlock[] = [];
  for (const b of r.note) {
    const cites = clean(b.citations, sourceCount);
    if (cites.length || STRUCTURAL.test(b.text.trim())) note.push({ text: b.text, citations: cites });
  }
  return { status: 'answered', blocks, note, dropped };
}
