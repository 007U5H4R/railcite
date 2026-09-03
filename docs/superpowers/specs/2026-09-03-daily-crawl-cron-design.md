# Daily incremental crawl — design

**Date:** 2026-09-03
**Status:** approved (design), not yet implemented
**Scope:** detect and ingest circulars published *after* 2026-08-31, once per day, at end of day IST.

---

## 1. Problem

RailCite's corpus is a snapshot. The full archive was crawled once (5,687 documents, newest
`ingested_at` 2026-08-31) from a **static** `ingest/crawl-manifest.json`. Nothing in the repo
re-checks the Railway Board site, so every circular published from 1 September 2026 onward is
invisible to the product.

For this product specifically, staleness is not a missing feature — it is a correctness bug.
RailCite's claim is *"which rule is in force **today**"*. A circular issued last week that
supersedes a rule makes RailCite return a confidently wrong answer **with a citation attached**,
which is worse than returning nothing.

### What the site does and does not offer

Verified 2026-09-03 by direct HTTP probes:

| Probe | Result |
|---|---|
| `robots.txt`, `sitemap.xml` | 404 — no machine-readable index |
| Directory listing (`…/traffic_comm/Comm_Cir_2026/`) | 404 — listing disabled |
| Legacy `traffic_comm/*.jsp` index pages | **frozen at 2011** — the site reorganised and these rotted |
| Modern CMS section pages (`view_section.jsp?id=…`) | current, carry 2022–2026 |

There is **no "published since" feed**. "What appeared today" is therefore only derivable by
listing pages and diffing against the corpus we already hold.

---

## 2. Non-goals

- **No re-crawl of the historical archive.** Already done; not repeated.
- **No re-download, re-OCR or re-embed of anything already ingested.** This is already
  guaranteed: ingest resumes on `source_url`, so known documents are skipped before any network
  or CPU cost is paid.
- **No review queue.** New circulars publish automatically (decision recorded in §7).
- **No coverage of directorates other than Traffic Commercial.**

---

## 3. Site structure (verified)

Root: **Traffic Commercial** = `view_section.jsp?lang=0&id=0,1,304,366,555` (93 direct PDFs,
years through 2026).

Its content sub-sections, each mapping onto a RailCite domain:

| Section | id suffix | domain |
|---|---|---|
| Commercial Circular | `…,555,737` | `coaching` |
| Freight Marketing Circulars | `…,555,862` | `goods` |
| Freight Rate Circulars | `…,555,765` | `goods` |
| Rates Letters – Clarifications/Instructions | `…,555,787` | `goods` |
| Rates Master Circulars | `…,555,1430` | `goods` |
| Freight Rates | `…,555,788` | `goods` |
| Classification of Commodities (Goods Tariff) | `…,555,860` | `goods` |
| Claims Circulars | `…,555,1796` | `null` |
| Passenger Marketing Letters | `…,555,2187` | `coaching` |
| TC Master Circular – Halt Stations | `…,555,2274` | `null` |
| Important Policy Measures for Freight Customers | `…,555,3062` | `goods` |

Sections whose content is genuinely mixed or unclassifiable are mapped to `null` rather than
guessed: an unclassified document is reachable under "Commercial Domain" but never claimed for
Goods or Coaching. This matches the rule already applied to the existing corpus.

> **Confidence on these mappings is uneven, and implementation must not treat the table as
> settled.** Commercial Circular → `coaching` and Freight Marketing / Freight Rate / Rates Master
> / Rates Letters → `goods` are corroborated against documents already in the corpus. The
> remainder — Claims Circulars, Passenger Marketing Letters, Halt Stations, Goods Tariff,
> Important Policy Measures, Freight Rates — are inferred **from the section name alone** and
> were not checked against their contents. A wrong entry here silently mis-scopes an entire
> series, which is exactly the defect the domain backfill was written to fix. Each unverified
> row must be spot-checked against one real document before the first live run; anything still
> doubtful goes to `null` rather than a guess.

### Two structural facts that drive the crawler

**(a) Every page embeds the whole site navigation (~200 links).** Child sections are identified
by **id prefix**: a child's `id` starts with the parent's `id` + `","`. Measured on Freight
Marketing: 201 link ids on the page, **31 true children**. Nothing else reliably separates
content links from chrome.

**(b) Section shapes differ.** Some roots list PDFs directly; others are year indexes:

| Section | direct PDFs | children | shape |
|---|---|---|---|
| Rates Letters | 190 (newest 2026) | 1 | flat list on the root |
| Commercial Circular | 10 | 30, labelled `2026`, `2025`, … | year index |
| Freight Marketing | 0 | 31, labelled `Freight Marketing 2026`, … | year index |

Child anchor text carries the year, so current-year children are selectable by parsing a year
out of the link text. Some children legitimately have no year (`Master Circulars`,
`Parcel Traffic (SLR, PCET & VPs)`) and are simply not part of the daily sweep.

---

## 4. Daily job

Runs once per day at **23:30 IST** (`cron: '0 18 * * *'` UTC) — end of day, as requested.

1. **List.** For each section in the table above: fetch the root, plus only those children whose
   anchor-text year is the **current or previous** calendar year. Previous-year is included
   because a circular filed in early January, or filed late, still lands in last year's page.
   Cost: roughly **20–30 page fetches**, not the ~300 a full walk would take.
2. **Extract.** Collect `.pdf` hrefs with a **tolerant matcher** covering double-quoted,
   single-quoted and unquoted attributes. This is not defensive padding: a naive
   `href="…"` regex found **0 PDFs on `rate-letter.jsp`, which actually has 80**, because that
   page uses single quotes. A stricter matcher would silently miss an entire series.
3. **Normalise.** Run every URL through the existing `canonicalUrl()` so http/https twins and
   percent-encoding variants collapse to the same key the corpus is stored under.
4. **Diff.** Drop any `source_url` already present in `documents`. What remains is the delta.
5. **Ingest the delta** with the existing `ingestOne()` — download → extract → OCR if scanned →
   chunk → embed → insert. All current guards apply unchanged: `classifyDomain`,
   `deriveCircularNo`, `documentQuality`, chunkless-document rollback, and the DB size cap.
6. **Record the run** in `crawl_runs`.
7. **Invalidate the answer cache only if `ingested > 0`** (see §6).

### The date floor

`CRAWL_SINCE` (default `2026-08-31`) is a **secondary** guard, not the primary filter.

The primary mechanism is the URL diff: the corpus already contains everything through
2026-08-31, so the diff *is* "published after 31 August". The floor exists to stop a mass
re-ingest of old documents if URL canonicalisation ever drifts.

It is applied **after parsing** and **fails open**: a document is skipped only when it has an
`issue_date` that is *older* than the floor. Missing or unparseable dates pass through.

> Rationale: some documents carry wrong dates in the source data — `FM-01 / 2007` is stamped
> `issue_date 2021-08-16`. A strict floor applied to an untrustworthy field would silently drop
> genuinely new circulars, which is precisely the failure this product cannot have. The URL diff
> has already proven the document is new; the floor only vetoes clear evidence of age.

---

## 5. Drift detection

The legacy `traffic_comm/*.jsp` pages stopped being updated in 2011 and nobody noticed for over a
decade. A crawler that finds nothing looks exactly like a quiet day. Three guards, all cheap:

1. **Zero-PDF section is a failure, not a success.** If a section (root plus its swept children)
   yields no PDF links at all, the page has moved or changed shape. The run fails loudly.
2. **Monthly structural walk.** On the first run of each month, re-derive the child set from
   Directorates → Traffic Commercial and diff it against the section table in §3. Any new,
   renamed or vanished section fails the run so the table is updated deliberately. This walk
   **lists only — it downloads no PDFs** and therefore costs nothing beyond page fetches.
3. **Sanity ceiling.** If the delta exceeds `CRAWL_MAX_NEW` (default 50), stop and fail without
   ingesting. A sudden flood means something upstream changed; mass-ingesting unreviewed
   documents into a citable corpus is the wrong response to surprise.

---

## 6. Answer-cache invalidation

An `answer_cache` row stores the whole `QueryResponse` verbatim, including a snapshot of each
source document. Migration 004's contract: *a cached answer must never outlive the corpus
snapshot that produced it.*

`ingest-crawl` currently clears the cache **unconditionally at run start**. For a daily job that
is wrong: most days the delta is zero, and an unconditional wipe would destroy the cache every
night — including the accumulated hit-rate that makes repeat questions free.

The daily job therefore calls `invalidateAnswerCache('daily crawl: N new')` **only when at least
one document was ingested**.

---

## 7. Decisions recorded

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Incremental only | Historical archive already ingested |
| Publication | Auto-publish with guards | `text_quality`, URL-derived domain and chunkless rollback already gate quality; a review queue means nothing updates unattended |
| Compute | GitHub Actions | OCR needs `tesseract`/`poppler` and minutes of runtime; Vercel functions cannot |
| Daily surface | Roots + current/previous-year children | New circulars land in the current-year page; full walk reserved for monthly drift detection |
| Schedule | 23:30 IST (`0 18 * * *`) | End of day, as requested |

---

## 8. Components

| Path | Responsibility |
|---|---|
| `lib/ingest/discover.ts` | `SECTIONS` table; fetch a section; tolerant PDF-link extraction; id-prefix child filtering; year parsing from anchor text. Pure and unit-testable. |
| `scripts/crawl-daily.ts` | Orchestration: list → diff → ingest delta → record run → conditionally invalidate cache. `--dry-run` default-safe, `--apply` to write. |
| `scripts/ingest-crawl.ts` | Export the existing `ingestOne()` so the daily job reuses it verbatim. No behavioural change. |
| `migrations/006_crawl_runs.sql` | `crawl_runs` table (below). |
| `.github/workflows/daily-crawl.yml` | Schedule, runtime deps, secrets, failure surfacing. |

### `crawl_runs`

```
id                uuid primary key
started_at        timestamptz not null default now()
finished_at       timestamptz
sections_checked  int not null default 0
pdfs_seen         int not null default 0
new_found         int not null default 0
ingested          int not null default 0
failed            int not null default 0
status            text not null check (status in ('running','ok','failed'))
error             text
```

Two purposes: forensics when a run breaks, and a durable answer to *"how fresh is this corpus?"*
The app can later surface **"corpus last checked: <date>"** — a procurement-grade claim that is
cheap to make only because the run is recorded.

### Workflow

- `schedule: cron '0 18 * * *'` plus `workflow_dispatch` for manual runs
- Runner installs `poppler-utils` and `tesseract-ocr`
- Secrets: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VOYAGE_API_KEY`
  — **no Anthropic key**: ingest embeds but never synthesises
- Non-zero exit fails the workflow, which sends GitHub's native failure notification

---

## 9. Testing

Fixtures are the **real pages already captured** during design, committed under
`tests/fixtures/crawl/`:

| Test | Guards against |
|---|---|
| Tolerant extraction on the `rate-letter.jsp` fixture finds all 80 PDFs | The single-quote bug that hid an entire 942-document series |
| Id-prefix filtering on the Freight Marketing fixture returns 31 children, not 201 links | Nav chrome being crawled as content |
| Year parsing accepts `2026` and `Freight Marketing 2026`, ignores `Master Circulars` | Missing the current-year page, or sweeping undated children |
| Section → domain mapping | Silent misclassification of a whole series |
| Delta computation against a fake corpus, including http/https and encoding twins | Re-ingesting documents already held |
| Zero-PDF section raises | The 2011-style silent rot |
| Delta above `CRAWL_MAX_NEW` raises before ingesting | Mass-ingest on upstream change |
| Date floor skips an older `issue_date` but passes a missing one | Dropping genuinely new circulars with bad date metadata |
| Cache invalidated when `ingested > 0`, untouched when `0` | Nightly destruction of the answer cache |

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Section ids change (has happened once — the 2011 rot) | Monthly structural walk; zero-PDF failure |
| A circular is filed into an older year's page | Monthly walk lists all children; sweep includes previous year |
| Government site slow or unavailable | Existing retry + timeout in the download path; run fails and notifies rather than recording a false "all clear" |
| ~20–30 requests/night against a government host | Throttled ~1 req/s with a real UA, matching the existing ingest's politeness |
| OCR pushes runtime up on a heavy day | GitHub Actions allows 6h; typical delta is 0–5 PDFs |

---

## 11. Open question for implementation

The daily sweep assumes new circulars appear in the current-year child page. That held for every
series inspected on 2026-09-03, but has not been observed *over time* — no new circular has been
published since the corpus snapshot. The first weeks of runs are therefore also a test of the
assumption. The monthly structural walk is what keeps a wrong assumption from becoming a silent
gap.
