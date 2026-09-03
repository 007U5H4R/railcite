import { describe, it, expect } from 'vitest';
import { basenameKey, isTrafficCommercial } from '../../lib/ingest/discover';

describe('basenameKey', () => {
  it('is the decoded lowercased filename, so encoded and plain forms collide', () => {
    expect(basenameKey('https://x/CC%2D73_2016.PDF')).toBe(basenameKey('https://x/cc-73_2016.pdf'));
  });
  it('survives a malformed % sequence instead of throwing', () => {
    expect(() => basenameKey('https://x/100%.pdf')).not.toThrow();
  });
});
describe('isTrafficCommercial', () => {
  it('accepts a traffic_comm path', () => {
    expect(isTrafficCommercial('https://x/uploads/directorate/traffic_comm/a.pdf')).toBe(true);
  });
  it('rejects other directorates (nav cross-links)', () => {
    expect(isTrafficCommercial('https://x/uploads/directorate/vigilance/a.pdf')).toBe(false);
    expect(isTrafficCommercial('https://x/uploads/directorate/civil_engg/a.pdf')).toBe(false);
  });
});
