import { describe, it, expect } from 'vitest';
import { distinctSuffix, dateFromFilename, filenameStem, humanStem, reducedStem, stripSuffix } from '../../lib/distinctLabel';

const U = (p: string) => `https://indianrailways.gov.in/railwayboard/uploads/directorate/traffic_comm/${p}`;
const doc = (source_url: string | null, title: string | null = null, issue_date: string | null = null) =>
  ({ circular_no: null, title, source_url, issue_date });

// Regression scar: after the source-integrity backfill, 1,492 documents still shared a display
// label — 27 corrigenda to RC-62/2009 all read "RC-62 / 2009", and 37 rate letters all read the
// file number "TC-I/2005/108/3". The distinguisher must come from the document's own filename.
describe('distinctSuffix', () => {
  describe('corrigenda keep their number', () => {
    it.each([
      ['RC_62_09_Corrigendum-25.pdf', 'Corrigendum-25 to RC-62 of 2009', 'Corr-25'],
      ['corri_44_RC_62_2009.PDF', 'Corrigendum-44 to RC-62 of 2009', 'Corr-44'],
      ['Corri_51_to_RC62_2009.pdf', 'Corrigendum 51 to RC 62 of 2009', 'Corr-51'],
      ['RC-62_Corrigendum-3.pdf', 'Corrigendum-3 to RC-62 of 2009', 'Corr-3'],
      ['RC_62_09_Corrigendum-38.pdf', 'RC_62_09_Corrigendum-38.pdf', 'Corr-38'],   // title == filename
    ])('%s -> %s', (file, title, tag) => {
      expect(distinctSuffix(doc(U(file), title))).toBe(tag);
    });

    it('separates a correction slip from a corrigendum', () => {
      expect(distinctSuffix(doc(U('CC_10_Correction-Slip-2.pdf')))).toBe('CS-2');
    });

    it('all 5 sampled RC-62 corrigenda produce distinct suffixes', () => {
      const tags = [
        distinctSuffix(doc(U('RC_62_09_Corrigendum-25.pdf'))),
        distinctSuffix(doc(U('corri_44_RC_62_2009.PDF'))),
        distinctSuffix(doc(U('Corri_51_to_RC62_2009.pdf'))),
        distinctSuffix(doc(U('RC-62_Corrigendum-3.pdf'))),
        distinctSuffix(doc(U('RC_62_09_Corrigendum-38.pdf'))),
      ];
      expect(new Set(tags).size).toBe(5);
    });
  });

  describe('file-number rate letters distinguish by the date in the filename', () => {
    it.each([
      ['EIMWB_280113.pdf', '28.01.2013'],
      ['In-motion-weighbridges_dt_290711.pdf', '29.07.2011'],
      ['Weighbridge_301013.pdf', '30.10.2013'],
      ['Clarification_SER_dt_300611.pdf', '30.06.2011'],
      ['EIMWB_260607.pdf', '26.06.2007'],
    ])('%s -> %s', (file, tag) => {
      expect(distinctSuffix(doc(U(file)))).toBe(tag);
    });

    it('reads a fully separated DD_MM_YYYY date', () => {
      expect(dateFromFilename(U('Demurrage%20and%20Wharfage%20Waiver%20dated%2010_04_2023.pdf'))).toBe('10.04.2023');
    });

    it('prefers the filename date over a bogus stored issue_date', () => {
      // The stored date for this file-number series is the crawl artefact 2023-04-03.
      expect(distinctSuffix(doc(U('EIMWB_280113.pdf'), null, '2023-04-03'))).toBe('28.01.2013');
    });
  });

  describe('falls back to the stored issue_date only when the filename yields nothing', () => {
    it('uses issue_date for a prose filename with no date token', () => {
      expect(distinctSuffix(doc(U('Charging%20of%20bulk%20cement.pdf'), null, '2015-06-10'))).toBe('10.06.2015');
    });
    it('returns null when there is no signal at all', () => {
      expect(distinctSuffix(doc(U('Important%20Policy.pdf'), null, null))).toBeNull();
    });
  });

  describe('does not misread stray numbers as dates', () => {
    it.each([
      'CC-73_2016.pdf',            // a year, not a date
      'RC%20No.%2062%20of%202009.pdf',
      'Chapter-II-Goods-Tariff.pdf',
    ])('%s -> no filename date', (file) => {
      expect(dateFromFilename(U(file))).toBeNull();
    });

    it('rejects an out-of-range compact number (day 99)', () => {
      expect(dateFromFilename(U('report_990101.pdf'))).toBeNull();
    });
  });
});

describe('helpers', () => {
  it('filenameStem decodes and drops the extension', () => {
    expect(filenameStem(U('Corri_45_RC_62_2009.pdf'))).toBe('Corri_45_RC_62_2009');
    expect(filenameStem(U('RC%20No.%2062%20of%202009.pdf'))).toBe('RC No. 62 of 2009');
  });

  it('humanStem is unique per document even when suffixes collide', () => {
    expect(humanStem(U('EIMWB_280113.pdf'))).toBe('eimwb 280113');
  });

  it('reducedStem drops tokens the base already carries', () => {
    expect(reducedStem('RC-20 / 2018', U('Corri_4_RC_20_2018.pdf'))).toBe('corri 4');
    expect(reducedStem('RC-20 / 2018', U('Corri_4_RC_20_2018_E.pdf'))).toBe('corri 4 e');
  });

  it('reducedStem falls back to the full stem when nothing but base tokens remain', () => {
    expect(reducedStem('CC-03', U('CC-03.pdf'))).toBe('cc 03');
  });

  it('stripSuffix is idempotent — removes a previously appended distinguisher', () => {
    expect(stripSuffix('RC-62 / 2009 · Corr-25')).toBe('RC-62 / 2009');
    expect(stripSuffix('TC-I/2005/108/3 · 28.01.2013')).toBe('TC-I/2005/108/3');
    expect(stripSuffix('RC-62 / 2009')).toBe('RC-62 / 2009');   // nothing to strip
    expect(stripSuffix(null)).toBeNull();
  });
});
