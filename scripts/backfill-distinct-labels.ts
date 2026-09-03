/**
 * backfill-distinct-labels.ts — finish the source-integrity job: give every source card a
 * label no other document shares.
 *
 * The earlier backfill (backfill-source-integrity.ts) derived circular_no from each URL's
 * series + year. That removed the "FM-01 = fourteen circulars" ambiguity but left two families
 * still colliding:
 *   · CORRIGENDA — the 27 corrigenda to RC-62/2009 all derived the one label "RC-62 / 2009";
 *     the corrigendum number that separated them lived only in the title, which circular_no
 *     now overrides.
 *   · FILE-NUMBER LETTERS — 37 rate letters filed under "TC-I/2005/108/3" share that number;
 *     what separates them is the date, and the stored issue_date is unreliable for exactly
 *     these (a crawl artefact stamped 37 of them 2023-04-03).
 * 1,492 documents display a label shared by ≥1 other.
 *
 * Fix: for documents whose current display label (circular_no ?? title) is shared, append a
 * distinguisher read from the document's OWN filename (lib/distinctLabel) — corrigendum number,
 * else filename date, else stored issue_date. If a preferred tag still leaves a collision inside
 * the group, fall back to the humanised filename stem, which is unique per document. Nothing is
 * invented; a document with no available signal keeps its label unchanged.
 *
 * Idempotent: the base is recomputed from source_url / a suffix-stripped circular_no, so a
 * re-run over already-labelled rows is a no-op.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-distinct-labels.ts          # dry run
 *   npx tsx --env-file=.env.local scripts/backfill-distinct-labels.ts --apply  # write
 */
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { adminClient } from '@/lib/db';
import { invalidateAnswerCache } from '@/lib/answerCache';
import { deriveCircularNo } from '@/lib/circularNo';
import { distinctSuffix, humanStem, reducedStem, stripSuffix } from '@/lib/distinctLabel';

interface Doc {
  id: string;
  title: string | null;
  circular_no: string | null;
  source_url: string | null;
  issue_date: string | null;
}

const PAGE = 1000;
const CONCURRENCY = 25;

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  }));
  return out;
}

const display = (d: { circular_no: string | null; title: string | null }) =>
  d.circular_no ?? d.title ?? '';

/** The stable identifier a distinguisher hangs off: the URL-derived circular number if any,
 *  else the existing circular_no with any earlier suffix stripped, else the title. */
function baseLabel(d: Doc): string {
  return deriveCircularNo(d.source_url) ?? stripSuffix(d.circular_no) ?? d.title ?? '';
}

/** Count of documents whose display label is shared by at least one other. */
function sharedCount(labels: string[]): number {
  const n = new Map<string, number>();
  for (const l of labels) n.set(l, (n.get(l) ?? 0) + 1);
  return labels.filter(l => (n.get(l) ?? 0) > 1).length;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const sb = adminClient();

  const docs: Doc[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('documents')
      .select('id,title,circular_no,source_url,issue_date').range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    docs.push(...(data as unknown as Doc[]));
    if ((data as unknown[]).length < PAGE) break;
  }
  console.log(`scanned ${docs.length} documents`);

  // Group by CURRENT display label; only shared groups need work.
  const groups = new Map<string, Doc[]>();
  for (const d of docs) {
    const key = display(d);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(d);
  }
  const sharedGroups = [...groups.values()].filter(g => g.length > 1);
  const sharedDocs = sharedGroups.flat();
  console.log(`documents sharing a label (before): ${sharedCount(docs.map(display))} in ${sharedGroups.length} groups\n`);

  // Assign a new label per shared group, guaranteeing in-group uniqueness.
  const newLabel = new Map<string, string>();   // doc.id -> label
  let cleanTag = 0, stemFallback = 0, noSignal = 0;
  const tally = (labels: string[]) => {
    const m = new Map<string, number>();
    for (const l of labels) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  };
  for (const group of sharedGroups) {
    type P = { d: Doc; base: string; label: string; kind: 'clean' | 'stem' | 'none' };
    const proposed: P[] = group.map(d => {
      const base = baseLabel(d);
      const suffix = distinctSuffix(d);
      return suffix
        ? { d, base, label: `${base} · ${suffix}`, kind: 'clean' as const }
        : { d, base, label: base, kind: 'none' as const };
    });

    // Break any label still shared inside the group with a filename-stem tie-break: base tokens
    // stripped first (readable), then the full stem if that still collides (unique per document).
    for (const mk of [(p: P) => reducedStem(p.base, p.d.source_url), (p: P) => humanStem(p.d.source_url)]) {
      const counts = tally(proposed.map(p => p.label));
      for (const p of proposed) {
        if ((counts.get(p.label) ?? 0) > 1) {
          const stem = mk(p);
          p.label = stem ? `${p.base} · ${stem}` : p.base;
          p.kind = 'stem';
        }
      }
    }

    for (const p of proposed) {
      newLabel.set(p.d.id, p.label);
      if (p.kind === 'clean') cleanTag++;
      else if (p.kind === 'stem') stemFallback++;
      else noSignal++;
    }
  }

  // What we would actually write: rows whose circular_no changes.
  const writes = sharedDocs
    .map(d => ({ id: d.id, from: d.circular_no, to: newLabel.get(d.id)! }))
    .filter(w => w.to && w.to !== w.from);

  // Projected global sharing after the change.
  const afterLabels = docs.map(d => {
    const nl = newLabel.get(d.id);
    return nl ?? display(d);
  });

  console.log('DISTINGUISHER SOURCE (within shared groups)');
  console.log(`  clean tag (corrigendum / date)      : ${cleanTag}`);
  console.log(`  filename-stem tie-break             : ${stemFallback}`);
  console.log(`  no signal, left unchanged           : ${noSignal}`);
  console.log(`\nrows to write (circular_no changes)   : ${writes.length}`);
  console.log(`documents sharing a label (after)     : ${sharedCount(afterLabels)}`);

  console.log('\nsample before -> after:');
  for (const w of writes.slice(0, 20)) console.log(`  "${w.from ?? '(title)'}"  ->  "${w.to}"`);

  // Rollback map: exact old→new circular_no per id, so the write is reversible.
  const snap = 'distinct-labels-rollback.json';
  await writeFile(snap, JSON.stringify(writes, null, 2));
  console.log(`\nrollback map (old→new per id): ${snap} (${writes.length} rows)`);

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to persist.');
    return;
  }

  console.log('\napplying…');
  await mapLimit(writes, CONCURRENCY, async w => {
    const { error } = await sb.from('documents').update({ circular_no: w.to }).eq('id', w.id);
    if (error) throw new Error(`${w.id}: ${error.message}`);
  });
  console.log(`  circular_no: ${writes.length} written`);
  // A cached answer embeds a snapshot of its source documents' circular_no, so rewriting labels
  // without this replays the old ones on every cache hit.
  await invalidateAnswerCache('distinct-labels backfill');
  console.log('done.');
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch(e => { console.error(e); process.exit(1); });
