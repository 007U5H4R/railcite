// Streaming, resumable full-archive ingest. For each PDF in ingest/crawl-manifest.json (recent
// first): download to a temp file → extract (pdftotext) → OCR if scanned (tesseract) → chunk →
// Voyage embed → insert → DELETE the temp file. Disk-safe (never holds more than one PDF locally);
// resumable (skips any source_url already in `documents`); polite (throttled); and guarded (stops
// before the DB outgrows a size limit). One bad/slow PDF can't sink the run — each doc is time-boxed
// and errors are isolated + logged.
//
// Run:  npx tsx --env-file=.env.local scripts/ingest-crawl.ts
// Tune: INGEST_THROTTLE_MS (default 1200), INGEST_DB_LIMIT_MB (default 480 — raise on a paid DB tier),
//       INGEST_DOC_TIMEOUT_MS (default 300000).
import { createHash } from 'node:crypto';
import { writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import manifest from '@/ingest/crawl-manifest.json';
import { adminClient } from '@/lib/db';
import { invalidateAnswerCache } from '@/lib/answerCache';
import { extractPdfText, needsOcr } from '@/lib/ingest/extract';
import { ocrPdf } from '@/lib/ingest/ocr';
import { chunkPages } from '@/lib/ingest/chunk';
import { embedTexts } from '@/lib/embeddings';
import { requireEnv, optionalEnv } from '@/lib/env';
import { classifyDomain } from './backfill-domain';
import { deriveCircularNo } from '@/lib/circularNo';
import { documentQuality } from '@/lib/textQuality';

const run = promisify(execFile);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface Entry { source_url: string; title: string; doc_type: string; domain: string | null; circular_no: string | null; issue_date: string | null }

const THROTTLE_MS = Number(optionalEnv('INGEST_THROTTLE_MS', '1200'));
const DB_LIMIT_MB = Number(optionalEnv('INGEST_DB_LIMIT_MB', '480'));
const MAX_DOCS = Number(optionalEnv('INGEST_MAX_DOCS', '0')) || Infinity;   // cap new docs per run (0 = all)
const DOC_TIMEOUT_MS = Number(optionalEnv('INGEST_DOC_TIMEOUT_MS', '300000'));
const MAX_PDF_BYTES = 40 * 1048576;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) RailCite-ingest';

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  // Clear the timer on settle: an uncleared 5-minute timer per document keeps the Node event loop
  // alive long after "run done" prints.
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms (${label})`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

// One canonical form per PDF, used for BOTH the resume set and the stored source_url. The manifest
// carries ~92 groups of variants of the same file (http/https twins, '%26' vs '&', ',' vs '%2C'),
// and exact-string dedup let every variant through — 68 duplicate document groups (126 duplicate
// chunks) reached the live DB, where identical passages compete in retrieval and duplicate
// compendium rows make the lineage anchor ambiguous.
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw.trim().replace(/^http:\/\//i, 'https://'));
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    u.pathname = decodeURIComponent(u.pathname).replace(/\s+/g, ' ');
    return u.toString();
  } catch { return raw.trim(); }
}

async function dbSizeMB(): Promise<number> {
  try {
    const { stdout } = await run('psql', [requireEnv('SUPABASE_DB_URL'), '-tAc',
      'select pg_database_size(current_database())'], { timeout: 20000 });
    return Math.round(Number(stdout.trim()) / 1048576);
  } catch { return -1; }
}

async function fetchToFile(url: string, dest: string): Promise<void> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > MAX_PDF_BYTES) throw new Error(`too big (${Math.round(len / 1048576)}MB)`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_PDF_BYTES) throw new Error(`too big (${Math.round(buf.length / 1048576)}MB)`);
    if (buf.length < 800) throw new Error('empty/too small');
    await writeFile(dest, buf);
  } finally { clearTimeout(to); }
}

async function download(url: string, dest: string): Promise<void> {
  // The gov server is HTTPS-only (refuses :80), but ~540 manifest hrefs are http:// — normalize
  // them or they all fail. One retry absorbs transient network blips over a multi-thousand-doc run.
  const u = url.replace(/^http:\/\//i, 'https://');
  try { await fetchToFile(u, dest); }
  catch { await sleep(1500); await fetchToFile(u, dest); }
}

export async function ingestOne(e: Entry, tmp: string, sb: ReturnType<typeof adminClient>): Promise<{ status: 'ok' | 'ocr' | 'skip'; chunks: number }> {
  await download(e.source_url, tmp);
  let { pages } = await extractPdfText(tmp);
  const is_ocr = needsOcr(pages);
  if (is_ocr) pages = await ocrPdf(tmp);
  const chunks = chunkPages(pages);
  if (!chunks.length) return { status: 'skip', chunks: 0 };
  const hash = createHash('sha256').update(await readFile(tmp)).digest('hex');
  // Domain and label come from the Board's own filing, not from the crawl manifest, so a
  // newly crawled circular is classified by exactly the same rule as the backfilled corpus
  // (the manifest is what wrote 'goods' onto 5,685 of 5,687 rows). Both fall back to the
  // manifest value, then to null, rather than guessing.
  const source_url = canonicalUrl(e.source_url);
  const domain = classifyDomain(source_url, null) ?? e.domain ?? null;
  const circular_no = deriveCircularNo(source_url) ?? e.circular_no ?? null;
  // is_ocr says how the text arrived; text_quality says whether it is legible.
  const text_quality = documentQuality(chunks.map(c => c.chunk_text));
  const { data: doc, error: e1 } = await sb.from('documents').insert({
    title: e.title || '(untitled)', doc_type: e.doc_type, domain, commodity: null,
    source_url, circular_no, issue_date: e.issue_date, file_hash: hash, is_ocr, text_quality,
  }).select().single();
  if (e1) throw e1;
  // Postgres has no transaction across these calls, so if embedding or a chunk batch fails the
  // document row would survive WITHOUT chunks — and because resume keys on source_url, every
  // future run skips it, leaving a permanently unsearchable document that retrieval can never
  // cite (one such row was found live). Roll the row back so the next run retries it cleanly.
  try {
    const embeddings = await embedTexts(chunks.map(c => c.chunk_text), 'document');
    const rows = chunks.map((c, i) => ({ document_id: doc.id, chunk_text: c.chunk_text,
      embedding: embeddings[i], page_ref: c.page_ref, token_count: c.token_count }));
    for (let j = 0; j < rows.length; j += 200) {
      const { error } = await sb.from('chunks').insert(rows.slice(j, j + 200));
      if (error) throw error;
    }
    return { status: is_ocr ? 'ocr' : 'ok', chunks: rows.length };
  } catch (err) {
    await sb.from('documents').delete().eq('id', doc.id);   // chunks cascade
    throw err;
  }
}

async function main() {
  const sb = adminClient();
  // Staleness contract (migrations/004): any ingest run invalidates the answer cache — cached
  // answers must never outlive the corpus snapshot they were generated from.
  await invalidateAnswerCache('corpus changing');
  const entries = manifest as Entry[];

  // Resumable: pull every already-ingested source_url so re-runs continue where they left off.
  const done = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('documents').select('source_url').not('source_url', 'is', null).order('source_url', { ascending: true }).range(from, from + 999);
    if (error) throw error;
    (data ?? []).forEach(d => d.source_url && done.add(canonicalUrl(d.source_url)));
    if (!data || data.length < 1000) break;
  }
  console.log(`crawl start: ${entries.length} in manifest · ${done.size} already ingested · throttle ${THROTTLE_MS}ms · DB limit ${DB_LIMIT_MB}MB`);

  let ok = 0, ocrN = 0, skip = 0, err = 0, chunksAdded = 0, processed = 0;
  const errors: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const canon = canonicalUrl(e.source_url);
    if (done.has(canon)) continue;   // already ingested (any URL variant of the same PDF)
    if (processed >= MAX_DOCS) { console.log(`reached INGEST_MAX_DOCS=${MAX_DOCS}`); break; }
    processed++;

    if (processed % 50 === 1) {
      const mb = await dbSizeMB();
      const eff = mb >= 0 ? mb : Math.round(20 + chunksAdded / 64);   // fallback estimate if psql unavailable
      if (eff >= DB_LIMIT_MB) {
        console.log(`\n⛔ DB ~${eff}MB ≥ limit ${DB_LIMIT_MB}MB — stopping cleanly (resumable). Raise INGEST_DB_LIMIT_MB on a bigger tier.`);
        break;
      }
      console.log(`  … pos ${i + 1}/${entries.length} · db=${mb < 0 ? '~' + eff : mb}MB · ok=${ok} ocr=${ocrN} skip=${skip} err=${err} chunks+=${chunksAdded}`);
    }

    const tmp = path.join(tmpdir(), `railcite-crawl-${i}.pdf`);
    try {
      const r = await withTimeout(ingestOne(e, tmp, sb), DOC_TIMEOUT_MS, e.title.slice(0, 40));
      if (r.status === 'skip') { skip++; done.add(canon); }
      else { ok++; if (r.status === 'ocr') ocrN++; chunksAdded += r.chunks; done.add(canon); }
      if (processed % 10 === 0) console.log(`[${i + 1}] ${r.status.toUpperCase().padEnd(4)} ${e.issue_date ?? '        '} +${r.chunks}ch ${e.title.slice(0, 48)}`);
    } catch (ex) {
      err++; const msg = ex instanceof Error ? ex.message : String(ex);
      errors.push(`${e.source_url} :: ${msg}`);
      if (err % 25 === 1) console.log(`  ERR(${err}) ${e.title.slice(0, 40)} :: ${msg}`);
    } finally {
      await rm(tmp, { force: true });
    }
    await sleep(THROTTLE_MS);
  }

  const { count: d } = await sb.from('documents').select('*', { count: 'exact', head: true });
  const { count: c } = await sb.from('chunks').select('*', { count: 'exact', head: true });
  console.log(`\nrun done: ok=${ok} (ocr=${ocrN}) skip=${skip} err=${err} · chunks+=${chunksAdded}`);
  console.log(`corpus now: ${d} documents, ${c} chunks · db=${await dbSizeMB()}MB`);
  if (errors.length) { await writeFile('ingest-crawl-errors.log', errors.join('\n')); console.log(`${errors.length} errors → ingest-crawl-errors.log`); }
}

// Only run when invoked directly; importing this module for reuse (the daily crawl) or for
// tests must not open a DB connection, wipe the cache, or start a crawl.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch(e => { console.error(e); process.exit(1); });
