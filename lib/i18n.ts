// Bilingual (English / Hindi) UI strings for the answer + justification-note segments.
// Scope is deliberately narrow: RailCite's trust model is extractive-only over ENGLISH
// circulars, so only the model's PROSE and a handful of fixed content labels are localized.
// Source cards, citation [n] chips, circular numbers, paras, dates and ₹ figures are NEVER
// translated (they are the "verify against the original" anchor). Global nav stays English.

export type Language = 'en' | 'hi';
export const LANGUAGES: readonly Language[] = ['en', 'hi'] as const;

export type LabelKey =
  | 'subLabel' | 'refLabel' | 'draftedNoteTitle' | 'reviewBeforeSubmitting' | 'reviewClose' | 'sources'
  | 'copyNote' | 'export' | 'copied' | 'caveat'
  | 'refuseTitle' | 'refuseSub' | 'removeVerifiedOnly' | 'rephrase'
  | 'translating' | 'translateFailed'
  | 'langEnglish' | 'langHindi' | 'switchToEnglish' | 'switchToHindi';

export const LABELS: Record<Language, Record<LabelKey, string>> = {
  en: {
    subLabel: 'Sub:',
    refLabel: 'Ref:',
    draftedNoteTitle: 'Drafted justification note',
    reviewBeforeSubmitting: 'assembled from the cited passages — review before submitting',
    reviewClose: 'Assembled from the cited passages — review before submitting.',
    sources: 'Sources:',
    copyNote: 'Copy note',
    export: 'Export',
    copied: 'Copied ✓',
    caveat: 'Hindi translation — verify against the English sources.',
    refuseTitle: 'No governing circular found for this case.',
    refuseSub: 'RailCite won’t guess. Do not rely on this as an answer.',
    removeVerifiedOnly: 'Remove “verified only”',
    rephrase: 'Rephrase the case',
    translating: 'Translating to Hindi…',
    translateFailed: 'Couldn’t translate — showing English.',
    langEnglish: 'English',
    langHindi: 'हिंदी',
    switchToEnglish: 'Show in English',
    switchToHindi: 'Show in Hindi',
  },
  hi: {
    subLabel: 'विषय:',
    refLabel: 'संदर्भ:',
    draftedNoteTitle: 'प्रारूपित औचित्य टिप्पणी',
    reviewBeforeSubmitting: 'उद्धृत अंशों से संकलित — प्रस्तुत करने से पूर्व समीक्षा करें',
    reviewClose: 'उद्धृत अंशों से संकलित — प्रस्तुत करने से पूर्व समीक्षा करें।',
    sources: 'स्रोत:',
    copyNote: 'टिप्पणी कॉपी करें',
    export: 'निर्यात',
    copied: 'कॉपी किया ✓',
    caveat: 'हिंदी अनुवाद — मूल अंग्रेज़ी स्रोत से सत्यापित करें।',
    refuseTitle: 'इस मामले के लिए कोई शासी परिपत्र नहीं मिला।',
    refuseSub: 'RailCite अनुमान नहीं लगाएगा। इसे उत्तर के रूप में उपयोग न करें।',
    removeVerifiedOnly: '“केवल सत्यापित” हटाएँ',
    rephrase: 'मामला पुनः लिखें',
    translating: 'हिंदी में अनुवाद हो रहा है…',
    translateFailed: 'अनुवाद नहीं हो सका — अंग्रेज़ी दिखाई जा रही है।',
    langEnglish: 'English',
    langHindi: 'हिंदी',
    switchToEnglish: 'अंग्रेज़ी में दिखाएँ',
    switchToHindi: 'हिंदी में दिखाएँ',
  },
};

export function t(key: LabelKey, lang: Language): string {
  return LABELS[lang][key];
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "Cited from N passages in the X manual" lead line. Numerals stay Latin in both languages —
// consistent with keeping paras / ₹ figures verbatim. The domain name is a corpus label
// (Goods / Coaching) and is never translated.
export function citedFrom(n: number, domain: string | null, lang: Language): string {
  const dn = domain ? titleCase(domain) : null;
  if (lang === 'hi') {
    return dn ? `${dn} मैनुअल से ${n} अंश उद्धृत` : `${n} अंश उद्धृत`;
  }
  const noun = n === 1 ? 'passage' : 'passages';
  return dn ? `Cited from ${n} ${noun} in the ${dn} manual` : `Cited from ${n} ${noun}`;
}

export function searching(n: number | null, lang: Language): string {
  if (n == null) return lang === 'hi' ? 'खोज हो रही है…' : 'Searching…';
  const num = n.toLocaleString('en-IN');
  return lang === 'hi' ? `${num} अंश खोजे जा रहे हैं…` : `Searching ${num} passages…`;
}

export function searchedPassages(n: number, lang: Language): string {
  const num = n.toLocaleString('en-IN');   // Latin numerals, Indian grouping — same in both langs
  return lang === 'hi'
    ? `${num} अंश खोजे गए — कोई भी प्रासंगिकता मानदंड पर खरा नहीं उतरा।`
    : `Searched ${num} passages — none met the relevance bar.`;
}
