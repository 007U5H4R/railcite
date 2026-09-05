import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'migrations', '008_dead_urls.sql'), 'utf8');

describe('008_dead_urls', () => {
  it('creates the table idempotently so re-applying is safe', () => {
    expect(sql).toMatch(/create table if not exists dead_urls/i);
  });

  it('keys the skip set on the URL', () => {
    expect(sql).toMatch(/url\s+text\s+primary key/i);
  });

  it('stores the identity fields the delta exclusion needs', () => {
    for (const col of ['filename', 'fail_count', 'last_error']) {
      expect(sql).toContain(col);
    }
  });

  it('records when a link first and last failed, for observability', () => {
    expect(sql).toMatch(/first_failed_at\s+timestamptz/i);
    expect(sql).toMatch(/last_failed_at\s+timestamptz/i);
  });

  it('indexes the basename so an ad-hoc "why skipped?" lookup is cheap', () => {
    expect(sql).toMatch(/create index if not exists dead_urls_filename_idx on dead_urls/i);
  });

  it('enables RLS — dead_urls is operational data, not user data', () => {
    expect(sql).toMatch(/alter table dead_urls enable row level security/i);
  });
});
