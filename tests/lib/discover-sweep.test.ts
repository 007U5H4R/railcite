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

  it('includes children with no year (subject pages like Rates Master topics)', () => {
    expect(selectSweepChildren(kids, NOW)).toContain('p,4');
  });

  it('sweeps a subject (year-less) child even when there are no year pages', () => {
    expect(selectSweepChildren([{ id: 'p,9', label: 'Misc', year: null }], NOW)).toEqual(['p,9']);
  });

  it('sweeps every child of a subject-indexed section (all year-less, like Rates Master)', () => {
    const subjectKids = [
      { id: 's,1', label: 'Demurrage, Wharfage', year: null },
      { id: 's,2', label: 'Weighment of wagons', year: null },
      { id: 's,3', label: 'Freight Incentive Schemes', year: null },
    ];
    expect(selectSweepChildren(subjectKids, NOW)).toEqual(['s,1', 's,2', 's,3']);
  });
});
