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
