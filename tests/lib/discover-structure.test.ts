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

  it('does not flag a deliberately-excluded live child as drift (e.g. a TestPage/backup)', () => {
    const ids = SECTIONS.map(s => s.id);
    const excluded = new Set(['0,1,304,366,555,1615']);
    const diff = diffSectionTable([...ids, '0,1,304,366,555,1615'], SECTIONS, excluded);
    expect(diff.added).toEqual([]);
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
