import { describe, it, expect } from 'vitest';
import { classifyDomain } from '../../scripts/backfill-domain';

// Regression scar for the "Vikalpa returns Freight-Marketing circulars" bug.
//
// Root cause was NOT retrieval: `documents.domain` was 'goods' for 5,685 of 5,687 rows, so
// match_chunks(filter_domain) could never separate Coaching from Goods. Domain is now derived
// from the Board's own folder taxonomy, so these cases lock that mapping in place.
describe('classifyDomain', () => {
  describe('coaching — Commercial Circular series', () => {
    // The five circulars that actually carry the VIKALP scheme. If any of these stop
    // resolving to 'coaching', the original bug is back.
    it.each([
      'https://indianrailways.gov.in/railwayboard/uploads/directorate/traffic_comm/Comm-Cir_2016/CC-73_2016.pdf',
      'https://indianrailways.gov.in/railwayboard/uploads/directorate/traffic_comm/Comm-Cir-2015/CC-No_61_Bilingual.pdf',
      'https://indianrailways.gov.in/railwayboard/uploads/directorate/traffic_comm/Comm_Cir_2017/CC_63_2017.pdf',
      'https://indianrailways.gov.in/railwayboard/uploads/directorate/traffic_comm/Comm-Cir_2016/cc17%20of%202016%20bilingual.pdf',
      'https://indianrailways.gov.in/railwayboard/uploads/directorate/traffic_comm/Comm_Cir_2018/cc%2060_2018.pdf',
    ])('VIKALP-bearing circular is coaching: %s', url => {
      expect(classifyDomain(url, null)).toBe('coaching');
    });

    // Every casing the Board has shipped since 1999.
    it.each([
      ['comm-cir-2002', 'traffic_comm/comm-cir-2002/CC-73-002.pdf'],
      ['COMM-CIR-2K11', 'traffic_comm/COMM-CIR-2K11/x.pdf'],
      ['commercial-circulars2k6', 'traffic_comm/commercial-circulars2k6/x.pdf'],
      ['comml-cir-2004', 'traffic_comm/comml-cir-2004/x.pdf'],
      ['CC-2019 bare series folder', 'traffic_comm/CC-2019/x.pdf'],
    ])('%s -> coaching', (_label, path) => {
      expect(classifyDomain(path, null)).toBe('coaching');
    });
  });

  describe('goods — freight series', () => {
    it.each([
      ['Freight Marketing spelt out', 'traffic_comm/FREIGHT_MARKETING_2023/FM%2001%20of%202023.pdf'],
      ['lowercase marketing', 'traffic_comm/freight_marketing_2k7/FM-01.pdf'],
      ['double-t Marketting typo', 'traffic_comm/Freight_Marketting_2016/x.pdf'],
      ['abbreviated mktg', 'traffic_comm/Frght_Mktg_2k14/FM_1_2014.pdf'],
      ['bare FM_YYYY folder', 'traffic_comm/FM_2021/FM_01_2021.pdf'],
      ['freight rate', 'traffic_comm/Freight_Rate_2024/x.pdf'],
      ['rates master circulars', 'traffic_comm/Rates_Master_Circulars/x.pdf'],
      ['rates letters', 'traffic_comm/Rates-Letters/x.pdf'],
      ['nested under downloads', 'traffic_comm/downloads/Freight_Rate_2019/corrigendum.pdf'],
    ])('%s -> goods', (_label, path) => {
      expect(classifyDomain(path, null)).toBe('goods');
    });
  });

  describe('null — refuse to guess', () => {
    // We would rather under-claim than mis-assert a domain: these stay reachable under
    // "Commercial Domain" but must never surface under Goods or Coaching.
    it.each([
      ['commercial manual', 'traffic_comm/IRCM VOL-I.pdf'],
      ['undated master circular', 'traffic_comm/Master_Circulars/MC_PFT_020115.pdf'],
      ['loose root file', 'traffic_comm/Important%20Policy-compressed.pdf'],
      ['off-directorate', 'https://indianrailways.gov.in/railwayboard/uploads/irpersonel/Vacancy.pdf'],
    ])('%s -> null', (_label, path) => {
      expect(classifyDomain(path, null)).toBeNull();
    });

    it('returns null when there is no path at all', () => {
      expect(classifyDomain(null, null)).toBeNull();
    });
  });

  it('falls back to file_path when source_url is absent', () => {
    expect(classifyDomain(null, '/Data/Freight_Rate_2022/x.pdf')).toBe('goods');
  });

  it('survives a malformed %-encoding instead of throwing', () => {
    expect(() => classifyDomain('traffic_comm/Comm-Cir_2016/100%.pdf', null)).not.toThrow();
    expect(classifyDomain('traffic_comm/Comm-Cir_2016/100%.pdf', null)).toBe('coaching');
  });
});
