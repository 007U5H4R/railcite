/**
 * Detects extracted text we cannot honestly present as readable.
 *
 * `is_ocr` answers "how did the text get here" (embedded layer vs. tesseract). It does NOT
 * answer "is the result legible". A PDF with a broken font encoding yields mojibake through
 * the *embedded* layer, so it lands with is_ocr=false and earns the green "Verified text"
 * badge — RailCite asserting accuracy over `6 ]O t'oN a6Dd s^D,ultDd`. That is the one
 * failure the product exists to prevent, so legibility gets its own signal.
 *
 * Two distinct failure shapes, both real in this corpus:
 *   mojibake  — broken cmap: letters present but scrambled into punctuation-heavy soup
 *   numeric   — a fare/rate table flattened into digit soup ("4251 11.07 | 4301 | 1116 …"),
 *               true to the PDF but meaningless as a citation
 */

export type TextQuality = 'ok' | 'low';

/** Sampled from the head of the chunk: enough to judge, cheap enough to run per document. */
const SAMPLE = 1200;

// Words that appear in essentially any real Board circular. Mojibake scores zero of them;
// clean prose in this corpus scores 7-12. This is a legibility probe, not language detection.
const MARKERS = [
  'the', 'of', 'and', 'for', 'to', 'in', 'is', 'shall', 'no', 'dated',
  'railway', 'government', 'ministry', 'board', 'new', 'delhi', 'sub',
  'per', 'rate', 'charge', 'scheme', 'circular',
];

export function scoreText(text: string): { quality: TextQuality; reason: string | null } {
  const s = (text || '').slice(0, SAMPLE);
  if (!s.trim()) return { quality: 'low', reason: 'empty' };

  const nonSpace = s.replace(/\s/g, '');
  if (nonSpace.length < 40) return { quality: 'ok', reason: null }; // too short to judge fairly

  const letters = (s.match(/[A-Za-z]/g) || []).length;
  const digits = (s.match(/[0-9]/g) || []).length;
  const letterRatio = letters / nonSpace.length;
  const digitRatio = digits / nonSpace.length;

  // A rate table is legitimately digit-heavy, but a *citable passage* is not: past ~55% digits
  // with almost no prose, the chunk cannot support a claim in a case file.
  if (digitRatio > 0.55 && letterRatio < 0.25) {
    return { quality: 'low', reason: 'numeric-table' };
  }

  // Bilingual circulars carry Devanagari, which the Latin-token probes below would fail for
  // the wrong reason. If there is real Devanagari here, do not judge it on English shape.
  const devanagari = (s.match(/[ऀ-ॿ]/g) || []).length;
  if (devanagari / nonSpace.length > 0.15) return { quality: 'ok', reason: null };

  // Mojibake is letter-RICH but word-POOR: a broken cmap yields tokens like "s^D,ultDd" and
  // ".ra;;o.r1duo2". Measured on the live corpus, the separation is wide and stable:
  // clean prose ~0.88 clean tokens with 7-12 markers; mojibake ~0.28 with zero.
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length >= 8) {
    const cleanTokens = tokens.filter(t => /^[A-Za-z]{2,}$/.test(t.replace(/^[("']+|[.,;:)"']+$/g, ''))).length;
    const cleanRatio = cleanTokens / tokens.length;
    const lower = s.toLowerCase();
    const markerHits = MARKERS.filter(w => new RegExp(`\\b${w}\\b`).test(lower)).length;
    if (cleanRatio < 0.55 && markerHits < 2) {
      return { quality: 'low', reason: 'mojibake' };
    }
  }

  return { quality: 'ok', reason: null };
}

/** Convenience wrapper for callers that only need the verdict. */
export function isLowQualityText(text: string): boolean {
  return scoreText(text).quality === 'low';
}

/**
 * How many distinct real-word markers appear in the head of the text — a coarse legibility
 * measure. Mojibake scores 0-1; clean prose in this corpus scores 7-12. The re-OCR pass uses
 * it to tell "OCR recovered readable words" from "OCR reproduced the same digit soup", so it
 * only replaces a document's text when OCR genuinely improved it.
 */
export function markerHitCount(text: string): number {
  const lower = (text || '').slice(0, SAMPLE).toLowerCase();
  return MARKERS.filter(w => new RegExp(`\\b${w}\\b`).test(lower)).length;
}

/**
 * A document's quality is judged on its chunks. One bad chunk in a long, otherwise clean
 * circular is a table page, not a broken document — only flag when most of the sample is bad.
 */
export function documentQuality(chunkTexts: string[]): TextQuality {
  const judged = chunkTexts.filter(t => (t || '').replace(/\s/g, '').length >= 40);
  if (!judged.length) return 'ok';
  const low = judged.filter(isLowQualityText).length;
  return low / judged.length > 0.5 ? 'low' : 'ok';
}
