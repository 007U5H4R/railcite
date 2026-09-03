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
