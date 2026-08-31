// Deploy gate for the Ask screen's starter questions.
//
// EmptyState promises that a first-time tap "returns a real cited answer, never a refuse" — but
// that promise was only a comment, coupled to whatever the corpus happens to hold. It broke: the
// flagship starter live-returned the refuse card, so the first tap of the first-run funnel
// dead-ended. This turns the promise into a check that can FAIL, and is cheap enough to run on
// every deploy: retrieval + threshold only, no synthesis, no Anthropic spend.
//
// Exit 0 = every starter clears the bar. Exit 1 = at least one would refuse (fix or replace it).
// Run: npx tsx --env-file=.env.local scripts/smoke-starters.ts
import { EXAMPLE_CASES } from '@/lib/starters';
import { embedTexts } from '@/lib/embeddings';
import { matchChunks } from '@/lib/retrieval';
import { optionalEnv } from '@/lib/env';

const THRESHOLD = Number(optionalEnv('RELEVANCE_THRESHOLD', '0.32'));
const MIN_HITS = 3;   // one lucky passage is not an answer — require a real evidence base

async function main() {
  console.log(`smoke: ${EXAMPLE_CASES.length} starters · threshold ${THRESHOLD} · need ≥${MIN_HITS} hits\n`);
  let failed = 0;
  for (const [i, q] of EXAMPLE_CASES.entries()) {
    const [emb] = await embedTexts([q], 'query');
    const hits = await matchChunks(emb, { k: 8, verifiedOnly: false, domain: null });
    const above = hits.filter(h => h.similarity >= THRESHOLD);
    const top = above[0]?.similarity ?? 0;
    const ok = above.length >= MIN_HITS;
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} [${i}] ${above.length} hits ≥ threshold (top ${top.toFixed(3)})  ${q.slice(0, 68)}…`);
    if (!ok) console.log(`     ↳ would REFUSE — replace this starter or ingest the covering circulars`);
  }
  console.log(failed ? `\n✗ ${failed} starter(s) would refuse` : `\n✓ all starters return cited answers`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
