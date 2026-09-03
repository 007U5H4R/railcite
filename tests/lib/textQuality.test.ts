import { describe, it, expect } from 'vitest';
import { scoreText, isLowQualityText, documentQuality } from '../../lib/textQuality';

// Regression scar: garbled extractions were being shown under the green "Verified text"
// badge, because is_ocr=false only means "came from the embedded text layer" — it says
// nothing about whether the result is legible.
describe('textQuality', () => {
  // Real strings from the live corpus (FM-01 family), abbreviated.
  const MOJIBAKE = `6 ]O t'oN a6Dd s^D,ultDd/Jauolssluulo,lDlruDulJ JoJ lrtl lr | -l t\\ | \\-4-1' .rqlaq,vlaN \\ , 'oN tZZ uroo6'(s,brvrlroX) aq1 orpul lo prauag Jo+rpnyp .ra;;o.r1duo2,fundaq`;
  const NUMERIC_TABLE = `SCALE- JP 4251 11.07 | 4301 | 1116 | 4351 | 11.24 | 4401 11.42 4252 11.07 | 4302 | 14.16 | 4352 | 11.25 | 4402 11.43 4253 11.07 | 4303 | 1116 | 4353 | 11.25 | 4403 11.43 4254 11.07 | 4304 | 11.16 | 4354 | 11.25`;
  const CLEAN = `GOVERNMENT OF INDIA MINISTRY OF RAILWAYS (RAILWAY BOARD) No. 2007/TG-1/20/P/ATAS New Delhi, dated 14.12.2016. Sub: Introduction of Alternate Train Accommodation Scheme (VIKALP). Please refer to this office letter of even number dated 11.04.2016 wherein VIKALP scheme was extended to five more sectors.`;
  // Clean prose that still carries plenty of figures — must NOT be flagged.
  const CLEAN_WITH_FIGURES = `The demurrage charge shall be levied at the rate of Rs. 150 per wagon per hour beyond the free time of 5 hours, and the wharfage charge at Rs. 100 per tonne per day after the expiry of 12 hours from the time of unloading, as revised with effect from 01.04.2023.`;

  it('flags mojibake from a broken font encoding', () => {
    const r = scoreText(MOJIBAKE);
    expect(r.quality).toBe('low');
    expect(r.reason).toBe('mojibake');
  });

  it('flags a rate table flattened into digit soup', () => {
    const r = scoreText(NUMERIC_TABLE);
    expect(r.quality).toBe('low');
    expect(r.reason).toBe('numeric-table');
  });

  it('passes genuine circular prose', () => {
    expect(scoreText(CLEAN).quality).toBe('ok');
  });

  it('does not punish prose that legitimately cites figures and dates', () => {
    expect(scoreText(CLEAN_WITH_FIGURES).quality).toBe('ok');
  });

  it('treats empty text as low quality', () => {
    expect(scoreText('   ').quality).toBe('low');
  });

  it('does not judge a fragment too short to assess', () => {
    expect(scoreText('CC-73 of 2016').quality).toBe('ok');
  });

  it('isLowQualityText mirrors scoreText', () => {
    expect(isLowQualityText(MOJIBAKE)).toBe(true);
    expect(isLowQualityText(CLEAN)).toBe(false);
  });

  describe('documentQuality', () => {
    it('keeps a document whose single table page sits among clean prose', () => {
      expect(documentQuality([CLEAN, CLEAN_WITH_FIGURES, NUMERIC_TABLE])).toBe('ok');
    });

    it('flags a document that is mostly garbled', () => {
      expect(documentQuality([MOJIBAKE, MOJIBAKE, CLEAN])).toBe('low');
    });

    it('defaults to ok when there is nothing long enough to judge', () => {
      expect(documentQuality(['', '  ', 'CC-1'])).toBe('ok');
    });
  });
});
