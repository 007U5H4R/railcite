# Daily Incremental Crawl Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a day at end of day IST, discover circulars published after 2026-08-31 on the Railway Board site and ingest only those, without re-scanning anything already held.

**Architecture:** A pure discovery module lists a small, fixed set of Traffic Commercial section pages (roots plus current/previous-year children only), extracts PDF links, and diffs them against `documents.source_url`. A thin orchestrator ingests the delta through the existing `ingestOne()` — unchanged — records the run in a new `crawl_runs` table, and clears the answer cache only when something was actually ingested. A GitHub Actions cron runs it.

**Tech Stack:** TypeScript, `tsx`, Vitest, Supabase (`adminClient()`), `pdftotext`/`tesseract` via the existing ingest path, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-03-daily-crawl-cron-design.md`

## Global Constraints

- Incremental only. Never re-download, re-OCR or re-embed a document already in `documents`; the diff is on `canonicalUrl(source_url)`.
- Scripts are dry-run by default; `--apply` performs writes. Match `scripts/backfill-domain.ts`.
- Scripts run as `npx tsx --env-file=.env.local scripts/<name>.ts`. Migrations apply with `psql "$SUPABASE_DB_URL" -f migrations/<file>.sql`.
- A script invoked directly must guard its `main()` with the `pathToFileURL(process.argv[1])` check used in `scripts/backfill-domain.ts`, so importing it for tests neither opens a DB connection nor mutates anything.
- Comments explain WHY. Tests are named for the failure they prevent.
- `npx vitest run` and `npm run build` must be green before every commit.
- Do NOT push and do NOT deploy. Production deploys from `build/phase5`; that is the user's decision.
- Politeness: throttle page fetches to ~1/sec, send `User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) RailCite-ingest`.

---

### Task 1: Section table and link extraction

**Files:**
- Create: `lib/ingest/discover.ts`
- Test: `tests/lib/discover-extract.test.ts`
- Fixtures (already committed): `tests/fixtures/crawl/rate-letter-legacy.html`, `tests/fixtures/crawl/s_862.html`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type SectionDomain = 'goods' | 'coaching' | null`
  - `interface Section { id: string; label: string; domain: SectionDomain; verified: boolean }`
  - `const SECTIONS: Section[]`
  - `function extractPdfLinks(html: string, baseUrl: string): { url: string; title: string }[]`
  - `function extractChildSections(html: string, parentId: string): { id: string; label: string; year: number | null }[]`
  - `const TC_ROOT_ID = '0,1,304,366,555'`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractPdfLinks, extractChildSections, SECTIONS } from '../../lib/ingest/discover';

const fixture = (n: string) =>
  readFileSync(join(__dirname, '..', 'fixtures', 'crawl', n), 'utf8');
const BASE = 'https://indianrailways.gov.in/railwayboard/uploads/directorate/traffic_comm/rate-letter.jsp';

describe('extractPdfLinks', () => {
  // A naive /href="([^"]+)"/ regex finds ZERO pdfs on this page, which actually
  // carries 80 — it uses single-quoted/unquoted hrefs. That miss would have
  // silently dropped the entire 942-document Rates-Letters series.
  it('finds single-quoted and unquoted hrefs, not just double-quoted', () => {
    const links = extractPdfLinks(fixture('rate-letter-legacy.html'), BASE);
    expect(links.length).toBeGreaterThanOrEqual(70);
    expect(links.every(l => l.url.startsWith('https://'))).toBe(true);
  });

  it('resolves relative hrefs against the page URL', () => {
    const links = extractPdfLinks(`<a href='downloads/x.pdf'>X</a>`, BASE);
    expect(links[0].url).toBe(
      'https://indianrailways.gov.in/railwayboard/uploads/directorate/traffic_comm/downloads/x.pdf');
  });

  it('resolves root-relative hrefs against the host', () => {
    const links = extractPdfLinks(`<a href="/railwayboard/uploads/a.pdf">A</a>`, BASE);
    expect(links[0].url).toBe('https://indianrailways.gov.in/railwayboard/uploads/a.pdf');
  });

  it('ignores non-pdf links', () => {
    expect(extractPdfLinks(`<a href="index.jsp">x</a>`, BASE)).toHaveLength(0);
  });

  it('captures the anchor text as the title', () => {
    const links = extractPdfLinks(`<a href="a.pdf"> CC 73 of 2016 </a>`, BASE);
    expect(links[0].title).toBe('CC 73 of 2016');
  });

  it('deduplicates a url linked more than once on one page', () => {
    const links = extractPdfLinks(`<a href="a.pdf">A</a><a href="a.pdf">A again</a>`, BASE);
    expect(links).toHaveLength(1);
  });
});

describe('extractChildSections', () => {
  // Every page embeds the whole site nav (~200 id links). Only ids that extend
  // the parent's id are real children; without this filter the crawler would
  // walk the entire site.
  it('returns only true children, not the site navigation', () => {
    const kids = extractChildSections(fixture('s_862.html'), '0,1,304,366,555,862');
    expect(kids.length).toBeGreaterThanOrEqual(25);
    expect(kids.length).toBeLessThan(60);
    expect(kids.every(k => k.id.startsWith('0,1,304,366,555,862,'))).toBe(true);
  });

  it('parses the year out of the child label', () => {
    const kids = extractChildSections(fixture('s_862.html'), '0,1,304,366,555,862');
    const years = kids.map(k => k.year).filter((y): y is number => y !== null);
    expect(years).toContain(2026);
    expect(years).toContain(2025);
  });

  it('leaves year null for children that are not year pages', () => {
    const kids = extractChildSections(fixture('s_862.html'), '0,1,304,366,555,862');
    expect(kids.some(k => k.year === null && /master circulars/i.test(k.label))).toBe(true);
  });
});

describe('SECTIONS', () => {
  it('every section id extends the Traffic Commercial root', () => {
    expect(SECTIONS.every(s => s.id.startsWith('0,1,304,366,555,'))).toBe(true);
  });

  it('marks which domain mappings are corroborated against real documents', () => {
    // Only four were checked against the corpus; the rest are name-inferred and
    // must be spot-checked before the first live run (spec §3).
    const verified = SECTIONS.filter(s => s.verified).map(s => s.label);
    expect(verified).toContain('Commercial Circular');
    expect(verified).toContain('Freight Marketing Circulars');
    expect(SECTIONS.some(s => !s.verified)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/discover-extract.test.ts`
Expected: FAIL — cannot resolve `../../lib/ingest/discover`.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Discovery for the daily incremental crawl.
 *
 * Pure: no network, no DB. Everything here is a function of HTML text, so the
 * whole crawl surface is unit-testable against saved fixtures of the real pages.
 *
 * Two site facts drive this module (spec §3):
 *   1. Every page embeds the whole site navigation (~200 `view_section.jsp?id=`
 *      links). Real children are identified by ID PREFIX — a child's id starts
 *      with the parent's id plus a comma. Measured on Freight Marketing: 201 id
 *      links on the page, 31 true children.
 *   2. Href quoting is inconsistent. `rate-letter.jsp` uses single quotes, so a
 *      /href="([^"]+)"/ matcher finds 0 of its 80 PDFs. The matcher below accepts
 *      double, single and unquoted forms.
 */

export type SectionDomain = 'goods' | 'coaching' | null;

export interface Section {
  id: string;
  label: string;
  domain: SectionDomain;
  /** true = mapping corroborated against documents already in the corpus. */
  verified: boolean;
}

export const TC_ROOT_ID = '0,1,304,366,555';
export const SECTION_BASE = 'https://indianrailways.gov.in/railwayboard/view_section.jsp';

/**
 * Traffic Commercial content sections. `verified` records how much we actually
 * know: a wrong domain here silently mis-scopes an entire series, which is the
 * defect the domain backfill was written to fix. Unverified rows must be
 * spot-checked against a real document before the first live run; anything
 * still doubtful becomes null rather than a guess.
 */
export const SECTIONS: Section[] = [
  { id: `${TC_ROOT_ID},737`,  label: 'Commercial Circular',                 domain: 'coaching', verified: true  },
  { id: `${TC_ROOT_ID},862`,  label: 'Freight Marketing Circulars',         domain: 'goods',    verified: true  },
  { id: `${TC_ROOT_ID},765`,  label: 'Freight Rate Circulars',              domain: 'goods',    verified: true  },
  { id: `${TC_ROOT_ID},787`,  label: 'Rates Letters',                       domain: 'goods',    verified: true  },
  { id: `${TC_ROOT_ID},1430`, label: 'Rates Master Circulars',              domain: 'goods',    verified: false },
  { id: `${TC_ROOT_ID},788`,  label: 'Freight Rates',                       domain: 'goods',    verified: false },
  { id: `${TC_ROOT_ID},860`,  label: 'Classification of Commodities',       domain: 'goods',    verified: false },
  { id: `${TC_ROOT_ID},1796`, label: 'Claims Circulars',                    domain: null,       verified: false },
  { id: `${TC_ROOT_ID},2187`, label: 'Passenger Marketing Letters',         domain: 'coaching', verified: false },
  { id: `${TC_ROOT_ID},2274`, label: 'TC Master Circular - Halt Stations',  domain: null,       verified: false },
  { id: `${TC_ROOT_ID},3062`, label: 'Important Policy Measures',           domain: 'goods',    verified: false },
];

export function sectionUrl(id: string): string {
  return `${SECTION_BASE}?lang=0&id=${id}`;
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ');
const clean = (s: string) => stripTags(s).replace(/\s+/g, ' ').trim();

/** Accepts href="x" | href='x' | href=x — see module note 2. */
const HREF = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

export function extractPdfLinks(html: string, baseUrl: string): { url: string; title: string }[] {
  const out = new Map<string, string>();
  for (const m of html.matchAll(ANCHOR)) {
    const attrs = m[1];
    const h = [...attrs.matchAll(HREF)][0];
    if (!h) continue;
    const raw = (h[1] ?? h[2] ?? h[3] ?? '').trim();
    if (!/\.pdf(\?|#|$)/i.test(raw)) continue;
    let url: string;
    try { url = new URL(raw, baseUrl).toString(); } catch { continue; }
    if (!out.has(url)) out.set(url, clean(m[2]));
  }
  return [...out].map(([url, title]) => ({ url, title }));
}

export function extractChildSections(
  html: string, parentId: string,
): { id: string; label: string; year: number | null }[] {
  const seen = new Map<string, string>();
  for (const m of html.matchAll(ANCHOR)) {
    const h = [...m[1].matchAll(HREF)][0];
    if (!h) continue;
    const raw = h[1] ?? h[2] ?? h[3] ?? '';
    if (!/view_section\.jsp/i.test(raw)) continue;
    const idm = raw.match(/id=([0-9,]+)/);
    if (!idm) continue;
    const id = idm[1];
    if (!id.startsWith(parentId + ',')) continue;      // nav chrome filtered here
    if (id.slice(parentId.length + 1).includes(',')) continue;  // direct children only
    if (!seen.has(id)) seen.set(id, clean(m[2]));
  }
  return [...seen].map(([id, label]) => {
    const y = label.match(/\b(19|20)\d{2}\b/);
    return { id, label, year: y ? Number(y[0]) : null };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/discover-extract.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/discover.ts tests/lib/discover-extract.test.ts tests/fixtures/crawl
git commit -m "feat(crawl): section table + tolerant link extraction for discovery"
```

---

### Task 2: Which pages the daily sweep visits

**Files:**
- Modify: `lib/ingest/discover.ts`
- Test: `tests/lib/discover-sweep.test.ts`

**Interfaces:**
- Consumes: `Section`, `SECTIONS`, `extractChildSections` (Task 1).
- Produces: `function selectSweepChildren(children: {id:string;label:string;year:number|null}[], now: Date): string[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { selectSweepChildren } from '../../lib/ingest/discover';

const NOW = new Date('2026-09-03T00:00:00Z');
const kids = [
  { id: 'p,1', label: '2026', year: 2026 },
  { id: 'p,2', label: '2025', year: 2025 },
  { id: 'p,3', label: '2024', year: 2024 },
  { id: 'p,4', label: 'Master Circulars', year: null },
];

describe('selectSweepChildren', () => {
  // The daily job must stay small: new circulars land in the current-year page.
  // Sweeping all ~30 year pages per section would be ~300 fetches a night.
  it('takes the current year', () => {
    expect(selectSweepChildren(kids, NOW)).toContain('p,1');
  });

  // A circular filed in early January, or filed late, still lands in last
  // year's page — so previous year is swept too.
  it('takes the previous year', () => {
    expect(selectSweepChildren(kids, NOW)).toContain('p,2');
  });

  it('ignores older years', () => {
    expect(selectSweepChildren(kids, NOW)).not.toContain('p,3');
  });

  it('ignores children with no year, which are not year pages', () => {
    expect(selectSweepChildren(kids, NOW)).not.toContain('p,4');
  });

  it('returns nothing when a section has no year children at all', () => {
    expect(selectSweepChildren([{ id: 'p,9', label: 'Misc', year: null }], NOW)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/discover-sweep.test.ts`
Expected: FAIL — `selectSweepChildren` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/ingest/discover.ts`:

```ts
/**
 * Which child year-pages the DAILY sweep visits.
 *
 * Only current and previous year. New circulars land in the current-year page;
 * previous year covers a January filing and late filing. Sweeping every year
 * page of every section would be ~300 fetches a night for no benefit — the
 * monthly structural walk is what covers the rest (spec §5).
 */
export function selectSweepChildren(
  children: { id: string; label: string; year: number | null }[],
  now: Date,
): string[] {
  const y = now.getUTCFullYear();
  return children.filter(c => c.year === y || c.year === y - 1).map(c => c.id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/discover-sweep.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/discover.ts tests/lib/discover-sweep.test.ts
git commit -m "feat(crawl): restrict the daily sweep to current and previous year pages"
```

---

### Task 3: Delta computation and the safety guards

**Files:**
- Modify: `lib/ingest/discover.ts`
- Test: `tests/lib/discover-delta.test.ts`

**Interfaces:**
- Consumes: `SectionDomain` (Task 1); `canonicalUrl` from `scripts/ingest-crawl.ts` (already exported).
- Produces:
  - `interface Discovered { source_url: string; title: string; domain: SectionDomain }`
  - `function computeDelta(found: Discovered[], known: Set<string>): Discovered[]`
  - `class DriftError extends Error {}`
  - `function assertSectionProductive(label: string, pdfCount: number): void`
  - `function assertDeltaSane(deltaCount: number, max: number): void`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  computeDelta, assertSectionProductive, assertDeltaSane, DriftError,
} from '../../lib/ingest/discover';
import { canonicalUrl } from '../../scripts/ingest-crawl';

const d = (u: string) => ({ source_url: u, title: 't', domain: 'goods' as const });

describe('computeDelta', () => {
  it('drops urls already in the corpus', () => {
    const known = new Set([canonicalUrl('https://x.gov.in/a.pdf')]);
    expect(computeDelta([d('https://x.gov.in/a.pdf'), d('https://x.gov.in/b.pdf')], known))
      .toEqual([expect.objectContaining({ source_url: expect.stringContaining('b.pdf') })]);
  });

  // The manifest carried ~92 groups of http/https and percent-encoding twins of
  // the same file; exact-string dedup let them through and 68 duplicate document
  // groups reached the live DB. The delta must canonicalise before comparing.
  it('treats an http twin of a known https url as already held', () => {
    const known = new Set([canonicalUrl('https://x.gov.in/a.pdf')]);
    expect(computeDelta([d('http://x.gov.in/a.pdf')], known)).toEqual([]);
  });

  it('deduplicates within the discovered set itself', () => {
    expect(computeDelta([d('https://x.gov.in/a.pdf'), d('https://x.gov.in/a.pdf')], new Set()))
      .toHaveLength(1);
  });

  it('stores the canonical form, which is what documents.source_url holds', () => {
    const [only] = computeDelta([d('http://X.gov.in/a.pdf')], new Set());
    expect(only.source_url).toBe(canonicalUrl('http://X.gov.in/a.pdf'));
  });
});

describe('assertSectionProductive', () => {
  // The legacy traffic_comm/*.jsp index pages froze at 2011 when the site
  // reorganised and nobody noticed for a decade. A crawler that finds nothing
  // looks exactly like a quiet day, so zero is an error, never a silent success.
  it('raises when a section yields no pdfs at all', () => {
    expect(() => assertSectionProductive('Freight Marketing', 0)).toThrow(DriftError);
  });

  it('passes when the section yielded pdfs', () => {
    expect(() => assertSectionProductive('Freight Marketing', 3)).not.toThrow();
  });
});

describe('assertDeltaSane', () => {
  // A sudden flood means something upstream changed. Mass-ingesting unreviewed
  // documents into a citable corpus is the wrong response to surprise.
  it('raises when the delta exceeds the ceiling', () => {
    expect(() => assertDeltaSane(51, 50)).toThrow(DriftError);
  });

  it('allows a delta at the ceiling', () => {
    expect(() => assertDeltaSane(50, 50)).not.toThrow();
  });

  it('allows the ordinary case of nothing new', () => {
    expect(() => assertDeltaSane(0, 50)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/discover-delta.test.ts`
Expected: FAIL — `computeDelta` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/ingest/discover.ts`:

```ts
import { canonicalUrl } from '../../scripts/ingest-crawl';

export interface Discovered { source_url: string; title: string; domain: SectionDomain }

/** Structural surprise: the site changed shape, or the delta is implausible. */
export class DriftError extends Error {
  constructor(message: string) { super(message); this.name = 'DriftError'; }
}

/**
 * New documents only. Canonicalises first: the corpus stores canonical urls, and
 * http/https twins and percent-encoding variants of one PDF are common on this
 * site — comparing raw strings would re-ingest documents already held.
 */
export function computeDelta(found: Discovered[], known: Set<string>): Discovered[] {
  const out = new Map<string, Discovered>();
  for (const f of found) {
    const url = canonicalUrl(f.source_url);
    if (known.has(url) || out.has(url)) continue;
    out.set(url, { ...f, source_url: url });
  }
  return [...out.values()];
}

/** A section that lists nothing has moved or changed shape. Fail, never shrug. */
export function assertSectionProductive(label: string, pdfCount: number): void {
  if (pdfCount === 0) {
    throw new DriftError(
      `section "${label}" yielded 0 PDF links — the page has moved or changed shape. ` +
      `Re-derive the section table (spec §5) rather than treating this as "no new circulars".`);
  }
}

/** Refuse to mass-ingest on an unexplained flood. */
export function assertDeltaSane(deltaCount: number, max: number): void {
  if (deltaCount > max) {
    throw new DriftError(
      `discovery found ${deltaCount} new documents (ceiling ${max}). Something upstream ` +
      `changed; refusing to bulk-ingest unreviewed documents into a citable corpus.`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/discover-delta.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/discover.ts tests/lib/discover-delta.test.ts
git commit -m "feat(crawl): delta computation with drift and flood guards"
```

---

### Task 4: `crawl_runs` table

**Files:**
- Create: `migrations/007_crawl_runs.sql`

> Numbered 007, not 006: `migrations/006_answer_cache_scope.sql` is being added concurrently by
> the scope-aware-answer-cache fix. Two migrations sharing a number would collide on merge.
- Test: `tests/lib/crawl-runs-migration.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: table `crawl_runs` as specified below.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'migrations', '007_crawl_runs.sql'), 'utf8');

describe('007_crawl_runs', () => {
  it('creates the table idempotently so re-applying is safe', () => {
    expect(sql).toMatch(/create table if not exists crawl_runs/i);
  });

  it('records the counts a failed run needs for forensics', () => {
    for (const col of ['sections_checked', 'pdfs_seen', 'new_found', 'ingested', 'failed']) {
      expect(sql).toContain(col);
    }
  });

  it('constrains status to the three real states', () => {
    expect(sql).toMatch(/status.*check.*'running'.*'ok'.*'failed'/is);
  });

  it('keeps the error text so a failure can be diagnosed after the fact', () => {
    expect(sql).toMatch(/\berror\s+text\b/i);
  });

  it('enables RLS — crawl_runs is operational data, not user data', () => {
    expect(sql).toMatch(/alter table crawl_runs enable row level security/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/crawl-runs-migration.test.ts`
Expected: FAIL — ENOENT, `007_crawl_runs.sql` does not exist.

- [ ] **Step 3: Write minimal implementation**

```sql
-- 007_crawl_runs.sql — one row per daily crawl.
--
-- Two jobs. First, forensics: when a run fails, the counts say whether discovery
-- broke (sections_checked/pdfs_seen at zero) or ingest did (new_found high,
-- ingested low). Second, freshness: the app can answer "corpus last checked:
-- <date>" from the newest ok row — a procurement-grade claim that is only cheap
-- to make because the run is recorded.
--
-- Silence is the failure mode this guards. A crawler that quietly stops looks
-- exactly like a quiet week; the legacy traffic_comm index pages rotted for a
-- decade that way.

create table if not exists crawl_runs (
  id               uuid primary key default gen_random_uuid(),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  sections_checked int not null default 0,
  pdfs_seen        int not null default 0,
  new_found        int not null default 0,
  ingested         int not null default 0,
  failed           int not null default 0,
  status           text not null default 'running' check (status in ('running','ok','failed')),
  error            text
);

create index if not exists crawl_runs_recent_idx on crawl_runs (started_at desc);

-- Operational data, not user data: service role only, like documents/chunks.
alter table crawl_runs enable row level security;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/crawl-runs-migration.test.ts`
Expected: PASS.

Then apply it:

```bash
set -a; source .env.local; set +a
psql "$SUPABASE_DB_URL" -f migrations/007_crawl_runs.sql
```
Expected: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`.

- [ ] **Step 5: Commit**

```bash
git add migrations/007_crawl_runs.sql tests/lib/crawl-runs-migration.test.ts
git commit -m "feat(crawl): crawl_runs table for failure forensics and corpus freshness"
```

---

### Task 5: Export `ingestOne` for reuse

**Files:**
- Modify: `scripts/ingest-crawl.ts:97`
- Test: `tests/lib/ingest-one-export.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export async function ingestOne(e: Entry, tmp: string, sb: ReturnType<typeof adminClient>): Promise<{ status: 'ok' | 'ocr' | 'skip'; chunks: number }>` and `export interface Entry { source_url: string; title: string; doc_type: string; domain: string | null; circular_no: string | null; issue_date: string | null }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import * as crawl from '../../scripts/ingest-crawl';

describe('ingest-crawl exports', () => {
  // The daily job must reuse the ingest path verbatim — download, OCR-if-scanned,
  // chunk, embed, insert, plus the chunkless-document rollback. Re-implementing
  // any of that would let the two paths drift apart.
  it('exports ingestOne so the daily crawl reuses it rather than reimplementing', () => {
    expect(typeof crawl.ingestOne).toBe('function');
  });

  it('still exports canonicalUrl, which the delta depends on', () => {
    expect(typeof crawl.canonicalUrl).toBe('function');
  });

  it('does not run its own main() on import', () => {
    // Guarded by the pathToFileURL check; importing must not crawl or mutate.
    expect(process.exitCode ?? 0).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/ingest-one-export.test.ts`
Expected: FAIL — `crawl.ingestOne` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `scripts/ingest-crawl.ts`, change two declarations only (no behavioural change):

```ts
export interface Entry { source_url: string; title: string; doc_type: string; domain: string | null; circular_no: string | null; issue_date: string | null }
```

```ts
export async function ingestOne(e: Entry, tmp: string, sb: ReturnType<typeof adminClient>): Promise<{ status: 'ok' | 'ocr' | 'skip'; chunks: number }> {
```

Also confirm the file's `main()` is guarded so importing it does nothing:

```ts
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch(e => { console.error(e); process.exit(1); });
```

If that guard is absent, add it together with `import { pathToFileURL } from 'node:url';`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/ingest-one-export.test.ts && npx vitest run`
Expected: PASS, and the full suite still green.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest-crawl.ts tests/lib/ingest-one-export.test.ts
git commit -m "refactor(ingest): export ingestOne and Entry for reuse by the daily crawl"
```

---

### Task 6: The daily crawl script

**Files:**
- Create: `scripts/crawl-daily.ts`
- Test: `tests/lib/crawl-daily-policy.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–5; `adminClient` from `@/lib/db`; `invalidateAnswerCache` from `@/lib/answerCache`.
- Produces: `function shouldInvalidateCache(ingested: number): boolean`, `function passesDateFloor(issueDate: string | null, floor: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { shouldInvalidateCache, passesDateFloor } from '../../scripts/crawl-daily';

describe('shouldInvalidateCache', () => {
  // ingest-crawl clears the cache unconditionally at run start. For a job that
  // runs every night and usually finds nothing, that would wipe the cache daily
  // and destroy the hit rate that makes repeat questions free.
  it('does not clear the cache on a no-op night', () => {
    expect(shouldInvalidateCache(0)).toBe(false);
  });

  // A cached answer embeds a snapshot of its sources, so it must not outlive a
  // corpus change (migration 004's contract).
  it('clears the cache when something was actually ingested', () => {
    expect(shouldInvalidateCache(1)).toBe(true);
  });
});

describe('passesDateFloor', () => {
  const FLOOR = '2026-08-31';

  it('accepts a document issued after the floor', () => {
    expect(passesDateFloor('2026-09-02', FLOOR)).toBe(true);
  });

  it('rejects a document issued before the floor', () => {
    expect(passesDateFloor('2020-01-01', FLOOR)).toBe(false);
  });

  // FAILS OPEN. Some issue_date values in this corpus are simply wrong —
  // "FM-01 / 2007" is stamped 2021-08-16. The URL diff has already proven the
  // document is new; the floor only vetoes CLEAR evidence of age. A strict floor
  // over an untrustworthy field would silently drop genuinely new circulars.
  it('accepts a document with no issue_date rather than dropping it', () => {
    expect(passesDateFloor(null, FLOOR)).toBe(true);
  });

  it('accepts an unparseable issue_date rather than dropping it', () => {
    expect(passesDateFloor('not-a-date', FLOOR)).toBe(true);
  });

  it('accepts a document issued exactly on the floor date', () => {
    expect(passesDateFloor('2026-08-31', FLOOR)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/crawl-daily-policy.test.ts`
Expected: FAIL — cannot resolve `../../scripts/crawl-daily`.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * crawl-daily.ts — the once-a-day incremental crawl.
 *
 *   list -> diff -> ingest only what is new -> record the run
 *
 * Nothing already in `documents` is re-downloaded, re-OCR'd or re-embedded:
 * the delta is computed against source_url before any network cost is paid.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/crawl-daily.ts            # dry run
 *   npx tsx --env-file=.env.local scripts/crawl-daily.ts --apply    # ingest
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import { adminClient } from '@/lib/db';
import { invalidateAnswerCache } from '@/lib/answerCache';
import { optionalEnv } from '@/lib/env';
import { ingestOne, type Entry } from './ingest-crawl';
import {
  SECTIONS, sectionUrl, extractPdfLinks, extractChildSections, selectSweepChildren,
  computeDelta, assertSectionProductive, assertDeltaSane, DriftError, type Discovered,
} from '@/lib/ingest/discover';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) RailCite-ingest';
const THROTTLE_MS = Number(optionalEnv('CRAWL_THROTTLE_MS', '1000'));
const MAX_NEW = Number(optionalEnv('CRAWL_MAX_NEW', '50'));
const SINCE = optionalEnv('CRAWL_SINCE', '2026-08-31');

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Clear the cache only when the corpus actually changed — see the test. */
export function shouldInvalidateCache(ingested: number): boolean {
  return ingested > 0;
}

/**
 * Secondary guard only. Fails open: skip solely on clear evidence of age.
 * The URL diff is the real filter.
 */
export function passesDateFloor(issueDate: string | null, floor: string): boolean {
  if (!issueDate) return true;
  const d = Date.parse(issueDate);
  const f = Date.parse(floor);
  if (Number.isNaN(d) || Number.isNaN(f)) return true;
  return d >= f;
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`http ${res.status} for ${url}`);
  return await res.text();
}

async function discover(now: Date): Promise<{ found: Discovered[]; pages: number }> {
  const found: Discovered[] = [];
  let pages = 0;
  for (const section of SECTIONS) {
    const rootUrl = sectionUrl(section.id);
    const rootHtml = await fetchPage(rootUrl); pages++;
    await sleep(THROTTLE_MS);

    let pdfCount = 0;
    for (const l of extractPdfLinks(rootHtml, rootUrl)) {
      found.push({ source_url: l.url, title: l.title, domain: section.domain }); pdfCount++;
    }

    for (const childId of selectSweepChildren(extractChildSections(rootHtml, section.id), now)) {
      const childUrl = sectionUrl(childId);
      const childHtml = await fetchPage(childUrl); pages++;
      await sleep(THROTTLE_MS);
      for (const l of extractPdfLinks(childHtml, childUrl)) {
        found.push({ source_url: l.url, title: l.title, domain: section.domain }); pdfCount++;
      }
    }

    // Zero here means the page moved — never a quiet day. See spec §5.
    assertSectionProductive(section.label, pdfCount);
  }
  return { found, pages };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const sb = adminClient();
  const now = new Date();

  const { data: runRow } = await sb.from('crawl_runs')
    .insert({ status: 'running' }).select('id').single();
  const runId = (runRow as { id: string } | null)?.id;

  const finish = async (patch: Record<string, unknown>) => {
    if (runId) await sb.from('crawl_runs').update({ finished_at: new Date().toISOString(), ...patch }).eq('id', runId);
  };

  try {
    const { found, pages } = await discover(now);

    const known = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data } = await sb.from('documents').select('source_url').range(from, from + 999);
      const rows = (data ?? []) as { source_url: string | null }[];
      for (const r of rows) if (r.source_url) known.add(r.source_url);
      if (rows.length < 1000) break;
    }

    const delta = computeDelta(found, known);
    assertDeltaSane(delta.length, MAX_NEW);

    console.log(`pages=${pages} pdfs_seen=${found.length} new=${delta.length}`);
    if (!apply) {
      console.log('DRY RUN — nothing ingested. Re-run with --apply.');
      await finish({ status: 'ok', sections_checked: SECTIONS.length, pdfs_seen: found.length, new_found: delta.length });
      return;
    }

    let ingested = 0, failed = 0, skippedOld = 0;
    for (const item of delta) {
      const tmp = path.join(tmpdir(), `railcite-${Date.now()}.pdf`);
      const entry: Entry = {
        source_url: item.source_url, title: item.title, doc_type: 'circular',
        domain: item.domain, circular_no: null, issue_date: null,
      };
      try {
        const res = await ingestOne(entry, tmp, sb);
        if (res.status === 'skip') { failed++; continue; }
        // Date floor is applied post-parse, against what ingest actually stored.
        const { data: doc } = await sb.from('documents')
          .select('id,issue_date').eq('source_url', item.source_url).maybeSingle();
        const row = doc as { id: string; issue_date: string | null } | null;
        if (row && !passesDateFloor(row.issue_date, SINCE)) {
          await sb.from('documents').delete().eq('id', row.id);   // chunks cascade
          skippedOld++; continue;
        }
        ingested++;
      } catch (err) {
        failed++;
        console.error(`  FAILED ${item.source_url}: ${(err as Error).message}`);
      } finally {
        await rm(tmp, { force: true });
        await sleep(THROTTLE_MS);
      }
    }

    if (shouldInvalidateCache(ingested)) {
      await invalidateAnswerCache(`daily crawl: ${ingested} new`);
    }
    console.log(`ingested=${ingested} failed=${failed} skipped_pre_${SINCE}=${skippedOld}`);
    await finish({ status: 'ok', sections_checked: SECTIONS.length, pdfs_seen: found.length, new_found: delta.length, ingested, failed });
  } catch (err) {
    const msg = err instanceof DriftError ? `DRIFT: ${err.message}` : (err as Error).message;
    console.error(msg);
    await finish({ status: 'failed', error: msg });
    process.exit(1);
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/crawl-daily-policy.test.ts && npx tsc --noEmit 2>&1 | grep crawl-daily`
Expected: tests PASS; no type errors mentioning `crawl-daily`.

- [ ] **Step 5: Commit**

```bash
git add scripts/crawl-daily.ts tests/lib/crawl-daily-policy.test.ts
git commit -m "feat(crawl): daily incremental crawl script"
```

---

### Task 7: Dry-run against the live site

**Files:**
- Modify: none (verification task; fix defects it exposes in the files from Tasks 1–6)

**Interfaces:**
- Consumes: `scripts/crawl-daily.ts`.
- Produces: evidence that discovery works against the real site today.

- [ ] **Step 1: Run the dry run**

```bash
npx tsx --env-file=.env.local scripts/crawl-daily.ts
```

Expected: a line of the form `pages=<20-40> pdfs_seen=<hundreds> new=<small>`, then `DRY RUN — nothing ingested.`

- [ ] **Step 2: Check the delta is plausible**

`new=` should be **0 or a small number**. The corpus already holds everything through 2026-08-31, so anything above a handful means canonicalisation is not matching and the delta would re-ingest documents already held. If `new` is large, print a few and compare against `documents.source_url` before going further:

```bash
npx tsx --env-file=.env.local -e "
import { adminClient } from '@/lib/db';
const sb = adminClient();
const { data } = await sb.from('documents').select('source_url').limit(3);
console.log(data);
"
```

- [ ] **Step 3: Verify the unverified domain mappings**

Spec §3 flags seven section→domain rows as inferred from the section name alone. For each of `Rates Master Circulars`, `Freight Rates`, `Classification of Commodities`, `Claims Circulars`, `Passenger Marketing Letters`, `TC Master Circular - Halt Stations`, `Important Policy Measures`: open one PDF the sweep found under it and confirm the domain is right. Set any doubtful row to `domain: null` in `SECTIONS` and flip `verified: true` on the ones you confirmed.

A wrong row silently mis-scopes an entire series — the defect the domain backfill was written to fix.

- [ ] **Step 4: Confirm the run was recorded**

```bash
npx tsx --env-file=.env.local -e "
import { adminClient } from '@/lib/db';
const sb = adminClient();
const { data } = await sb.from('crawl_runs').select('*').order('started_at',{ascending:false}).limit(1);
console.log(data);
"
```
Expected: one row, `status: 'ok'`, with non-zero `sections_checked` and `pdfs_seen`.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(crawl): corrections from the first live dry run"
```

---

### Task 8: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/daily-crawl.yml`
- Test: `tests/lib/crawl-workflow.test.ts`

**Interfaces:**
- Consumes: `scripts/crawl-daily.ts`.
- Produces: the scheduled job.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/crawl-workflow.test.ts`
Expected: FAIL — ENOENT, the workflow file does not exist.

- [ ] **Step 3: Write minimal implementation**

```yaml
# Daily incremental crawl.
#
# Runs on GitHub Actions rather than Vercel Cron because ingest shells out to
# pdftotext and tesseract and can run for minutes — neither fits a serverless
# function. Typical night ingests 0-5 PDFs.
name: daily-crawl

on:
  schedule:
    - cron: '0 18 * * *'      # 18:00 UTC == 23:30 IST, end of day
  workflow_dispatch:

jobs:
  crawl:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm

      - run: npm ci

      # The ingest path shells out to these; without them every scanned PDF fails.
      - name: Install OCR toolchain
        run: sudo apt-get update && sudo apt-get install -y poppler-utils tesseract-ocr

      # No Anthropic key: ingest embeds (Voyage) but never synthesises.
      - name: Crawl and ingest new circulars
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          VOYAGE_API_KEY: ${{ secrets.VOYAGE_API_KEY }}
        run: npx tsx scripts/crawl-daily.ts --apply
```

The script exits non-zero on drift or failure, which fails the job and triggers GitHub's own failure notification — the run is never silently green.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/crawl-workflow.test.ts && npx vitest run && npm run build`
Expected: all PASS, build clean.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/daily-crawl.yml tests/lib/crawl-workflow.test.ts
git commit -m "feat(crawl): nightly GitHub Actions schedule"
```

---

### Task 9: Monthly structural walk

**Files:**
- Modify: `lib/ingest/discover.ts`, `scripts/crawl-daily.ts`
- Test: `tests/lib/discover-structure.test.ts`

**Interfaces:**
- Consumes: `SECTIONS`, `extractChildSections`, `DriftError` (Tasks 1, 3).
- Produces: `function diffSectionTable(liveChildIds: string[], configured: Section[]): { added: string[]; removed: string[] }`, `function assertSectionTableCurrent(diff: { added: string[]; removed: string[] }): void`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { diffSectionTable, assertSectionTableCurrent, DriftError, SECTIONS } from '../../lib/ingest/discover';

describe('diffSectionTable', () => {
  const ids = SECTIONS.map(s => s.id);

  it('is quiet when the live site matches the configured table', () => {
    expect(diffSectionTable(ids, SECTIONS)).toEqual({ added: [], removed: [] });
  });

  it('reports a section that appeared on the site but is not configured', () => {
    expect(diffSectionTable([...ids, '0,1,304,366,555,9999'], SECTIONS).added)
      .toEqual(['0,1,304,366,555,9999']);
  });

  it('reports a configured section that has vanished from the site', () => {
    expect(diffSectionTable(ids.slice(1), SECTIONS).removed).toEqual([ids[0]]);
  });
});

describe('assertSectionTableCurrent', () => {
  // The legacy index pages froze in 2011 and nobody noticed. Structure changes
  // must interrupt a human, not be absorbed silently.
  it('raises when the site has a section the table lacks', () => {
    expect(() => assertSectionTableCurrent({ added: ['x'], removed: [] })).toThrow(DriftError);
  });

  it('raises when a configured section has disappeared', () => {
    expect(() => assertSectionTableCurrent({ added: [], removed: ['y'] })).toThrow(DriftError);
  });

  it('passes when nothing changed', () => {
    expect(() => assertSectionTableCurrent({ added: [], removed: [] })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/discover-structure.test.ts`
Expected: FAIL — `diffSectionTable` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/ingest/discover.ts`:

```ts
/**
 * Compare the live child sections of Traffic Commercial against the configured
 * table. Run monthly. Lists only — downloads no PDFs — so it costs a handful of
 * page fetches and nothing else.
 */
export function diffSectionTable(
  liveChildIds: string[], configured: Section[],
): { added: string[]; removed: string[] } {
  const live = new Set(liveChildIds);
  const known = new Set(configured.map(s => s.id));
  return {
    added: [...live].filter(id => !known.has(id)),
    removed: [...known].filter(id => !live.has(id)),
  };
}

/** A structure change must interrupt a human — see the 2011 rot in spec §5. */
export function assertSectionTableCurrent(diff: { added: string[]; removed: string[] }): void {
  if (diff.added.length || diff.removed.length) {
    throw new DriftError(
      `Traffic Commercial section structure changed — added: [${diff.added.join(', ')}], ` +
      `removed: [${diff.removed.join(', ')}]. Update SECTIONS in lib/ingest/discover.ts ` +
      `deliberately, including the domain mapping for anything new.`);
  }
}
```

Then in `scripts/crawl-daily.ts`, inside `main()` immediately before `const { found, pages } = await discover(now);`:

```ts
  // Monthly: re-derive the section table from the site so a rename cannot rot
  // silently. Costs a single page fetch and downloads nothing.
  if (now.getUTCDate() === 1 || process.argv.includes('--check-structure')) {
    const tcHtml = await fetchPage(sectionUrl(TC_ROOT_ID));
    const liveIds = extractChildSections(tcHtml, TC_ROOT_ID).map(c => c.id);
    assertSectionTableCurrent(diffSectionTable(liveIds, SECTIONS));
    console.log('section structure unchanged');
  }
```

Extend the import in `scripts/crawl-daily.ts` to include `TC_ROOT_ID`, `diffSectionTable` and `assertSectionTableCurrent`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/discover-structure.test.ts && npx tsx --env-file=.env.local scripts/crawl-daily.ts --check-structure`
Expected: tests PASS. The live check either prints `section structure unchanged` or raises a `DriftError` naming ids — if it raises, reconcile `SECTIONS` against the site now and note what changed.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/discover.ts scripts/crawl-daily.ts tests/lib/discover-structure.test.ts
git commit -m "feat(crawl): monthly structural walk so a section rename cannot rot silently"
```

---

### Task 10: Full verification

**Files:**
- Modify: none (verification; fix anything it exposes)

- [ ] **Step 1: Full suite and build**

```bash
npx vitest run && npm run build
```
Expected: all green. Baseline before this plan was 216 passing.

- [ ] **Step 2: End-to-end apply on a real (empty or near-empty) delta**

```bash
npx tsx --env-file=.env.local scripts/crawl-daily.ts --apply
```
Expected: `ingested=0` on a normal day, `crawl_runs` row `status='ok'`, and — critically — **no cache invalidation logged**, because nothing was ingested.

- [ ] **Step 3: Confirm the cache survived a no-op night**

```bash
npx tsx --env-file=.env.local -e "
import { adminClient } from '@/lib/db';
const sb = adminClient();
const { count } = await sb.from('answer_cache').select('*',{count:'exact',head:true});
console.log('answer_cache rows:', count);
"
```
Expected: unchanged from before Step 2. A nightly wipe is the regression this guards.

- [ ] **Step 4: Confirm drift detection actually fires**

Temporarily add a bogus section (`{ id: '0,1,304,366,555,999999', label: 'Bogus', domain: null, verified: false }`) to `SECTIONS`, run the dry run, and confirm it exits non-zero with a `DRIFT:` message. Then remove it.

This is the guard the whole design rests on; an untested guard is not a guard.

- [ ] **Step 5: Commit and report**

```bash
git add -A
git commit -m "chore(crawl): verification pass"
```

Report to the user: branch name, commits, the dry-run numbers, which domain mappings were verified in Task 7 Step 3, and confirmation that drift detection fired in Step 4. **Do not push and do not deploy** — production deploys from `build/phase5` and that is the user's decision. Note that the workflow will not run until the three secrets are added to the GitHub repository.

---

## Notes for the executor

- **Do not add a review queue, a UI, or historical re-crawling.** All three are explicit non-goals (spec §2).
- **Do not "improve" `ingestOne`.** Task 5 exports it unchanged on purpose; the daily path and the archive path must not drift.
- If the site's structure turns out to differ from the fixtures, **fix the section table and say so** — do not loosen `assertSectionProductive` to make a failing run pass. That guard exists because the last silent failure went unnoticed for a decade.
