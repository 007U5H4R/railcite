import { describe, it, expect } from 'vitest';
import { LABELS, t, citedFrom, searchedPassages, LANGUAGES, type Language } from '@/lib/i18n';

describe('i18n static label map', () => {
  it('returns the Hindi note labels', () => {
    expect(t('subLabel', 'hi')).toBe('विषय:');
    expect(t('refLabel', 'hi')).toBe('संदर्भ:');
  });

  it('returns the English note labels unchanged', () => {
    expect(t('subLabel', 'en')).toBe('Sub:');
    expect(t('refLabel', 'en')).toBe('Ref:');
  });

  it('has full key parity across both languages (no missing translation)', () => {
    const enKeys = Object.keys(LABELS.en).sort();
    const hiKeys = Object.keys(LABELS.hi).sort();
    expect(hiKeys).toEqual(enKeys);
    // and no empty strings slipped in
    for (const lang of LANGUAGES) for (const k of enKeys) expect(LABELS[lang][k as keyof typeof LABELS['en']].length).toBeGreaterThan(0);
  });

  it('the Hindi translation caveat names the English source', () => {
    expect(t('caveat', 'hi')).toContain('अंग्रेज़ी');
  });
});

describe('citedFrom lead line', () => {
  it('English, single domain, plural', () => {
    expect(citedFrom(2, 'goods', 'en')).toBe('Cited from 2 passages in the Goods manual');
  });
  it('English, single passage is singular and domain-agnostic when no domain', () => {
    expect(citedFrom(1, null, 'en')).toBe('Cited from 1 passage');
  });
  it('Hindi keeps the domain name verbatim and the passage count as a Latin numeral', () => {
    const s = citedFrom(2, 'goods', 'hi');
    expect(s).toContain('Goods');
    expect(s).toContain('2');
    expect(s).toContain('अंश');
  });
});

describe('searchedPassages refuse meta', () => {
  it('English', () => {
    expect(searchedPassages(458, 'en')).toBe('Searched 458 passages — none met the relevance bar.');
  });
  it('Hindi keeps the Latin numeral', () => {
    expect(searchedPassages(458, 'hi')).toContain('458');
  });
});
