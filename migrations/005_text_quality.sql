-- 005_text_quality.sql — separate "how the text was obtained" from "is the text legible".
--
-- `is_ocr` answers the first question only. A PDF with a broken font encoding returns
-- mojibake through its EMBEDDED text layer, so it arrives with is_ocr=false and is badged
-- "✓ Verified text" — RailCite vouching for `6 ]O t'oN a6Dd s^D,ultDd`. Same for fare
-- tables flattened into digit soup: faithful to the PDF, useless as a citation.
--
-- Asserting accuracy over text we cannot read is the one failure this product exists to
-- prevent, so legibility gets its own column and its own badge.
--
--   ok   — legible extraction (default; the overwhelming majority)
--   low  — mojibake or a numeric table; surfaced as "Low-quality extraction — verify
--          against original" and never shown under the green Verified badge
--
-- Detection lives in lib/textQuality.ts and runs both at ingest and in the backfill, so a
-- newly crawled circular is judged by exactly the same rule as the existing corpus.

alter table documents
  add column if not exists text_quality text not null default 'ok'
  check (text_quality in ('ok', 'low'));

-- Retrieval does not filter on this (a low-quality passage is still evidence of what the
-- PDF says); it only changes how the source is labelled. Indexed for corpus audits.
create index if not exists documents_text_quality_idx on documents (text_quality)
  where text_quality = 'low';
