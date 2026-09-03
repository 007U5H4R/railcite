import { describe, it, expect } from 'vitest';
import { deriveCircularNo } from '../../lib/circularNo';

const U = (p: string) => `https://indianrailways.gov.in/railwayboard/uploads/directorate/traffic_comm/${p}`;

// Regression scar: 556 titles were shared by 2,822 documents because circular_no was NULL
// and the UI fell back to a filename-derived title. "FM-01" meant fourteen different
// circulars, so opening a source card could show a different year's PDF than its preview.
describe('deriveCircularNo', () => {
  it.each([
    ['CC-73_2016.pdf in a 2016 folder', 'Comm-Cir_2016/CC-73_2016.pdf', 'CC-73 / 2016'],
    ['CC-No_61 with a No. infix', 'Comm-Cir-2015/CC-No_61_Bilingual.pdf', 'CC-61 / 2015'],
    ['underscore form', 'Comm_Cir_2017/CC_63_2017.pdf', 'CC-63 / 2017'],
    ['year only in the 2k folder', 'comm-cir-2k8/CC-20.pdf', 'CC-20 / 2008'],
    ['2K12 folder shorthand', 'Freight_MKTG_2K12/FM_01_2012.pdf', 'FM-01 / 2012'],
    ['spelt-out "of 2023"', 'FREIGHT_MARKETING_2023/FM%2001%20of%202023.pdf', 'FM-01 / 2023'],
    ['single-digit number padded', 'Frght_Mktg_2k14/FM_1_2014.pdf', 'FM-01 / 2014'],
    ['freight rate becomes RC', 'Freight_Rate_2020/RC_08_2020.pdf', 'RC-08 / 2020'],
    ['series inferred from folder alone', 'freight_marketing_2k7/FM-01.pdf', 'FM-01 / 2007'],
  ])('%s -> %s', (_label, path, expected) => {
    expect(deriveCircularNo(U(path))).toBe(expected);
  });

  it('disambiguates the FM-01 collision that was reported', () => {
    // These three all displayed as the bare title "FM-01" before.
    const a = deriveCircularNo(U('Freight_MKTG_2K12/FM_01_2012.pdf'));
    const b = deriveCircularNo(U('FREIGHT_MARKETING_2023/FM%2001%20of%202023.pdf'));
    const c = deriveCircularNo(U('freight_marketing_2k7/FM-01.pdf'));
    expect(new Set([a, b, c]).size).toBe(3);
  });

  describe('refuses to half-guess', () => {
    it.each([
      ['no year anywhere', 'Comm-Cir/CC-73.pdf'],
      ['no series and no number', 'Important%20Policy-compressed.pdf'],
      ['prose filename with no circular number', 'Master_Circulars/2023/Charging%20of%20bulk%20cement.pdf'],
    ])('%s -> null', (_label, path) => {
      expect(deriveCircularNo(U(path))).toBeNull();
    });

    it('returns null for a missing url', () => {
      expect(deriveCircularNo(null)).toBeNull();
    });
  });

  it('does not mistake the year for the circular number', () => {
    expect(deriveCircularNo(U('Comm-Cir_2016/CC-73_2016.pdf'))).not.toContain('2016 / ');
  });
});
