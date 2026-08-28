import { embedTexts } from '@/lib/embeddings';
import { matchChunks } from '@/lib/retrieval';

const RELEVANT = [
  'Consignee requests waiver of demurrage for wagons detained beyond free time due to crane breakdown',
  'Free time allowed for unloading a rake of covered wagons and when demurrage begins',
  'Wharfage charges applicable when goods remain in railway premises after free time',
  'Whether demurrage is chargeable when detention is attributable to railway operational reasons',
  'Charges for two-point loading and free time computation',
];
const IRRELEVANT = [
  'Best biryani recipe for a family dinner',
  'Income tax slab rates for salaried individuals in 2025',
  'Cricket world cup semi final schedule',
];

async function top(q: string) {
  const [e] = await embedTexts([q], 'query');
  const hits = await matchChunks(e, { k: 3, verifiedOnly: false, domain: null });
  return hits.map(h => h.similarity.toFixed(3)).join('  ');
}
async function main() {
  console.log('RELEVANT (top-3 sims — should sit ABOVE threshold):');
  for (const q of RELEVANT) console.log(`  ${await top(q)}   ← ${q.slice(0, 60)}`);
  console.log('IRRELEVANT (should sit BELOW threshold):');
  for (const q of IRRELEVANT) console.log(`  ${await top(q)}   ← ${q.slice(0, 60)}`);
  console.log('\nPick RELEVANCE_THRESHOLD in the gap; update .env.local + example + Vercel later.');
}
main().catch(e => { console.error(e); process.exit(1); });
