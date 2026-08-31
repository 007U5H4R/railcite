---
target: Ask screen + answered view (CaseConsole)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
timestamp: 2026-08-31T14-59-19Z
slug: components-caseconsole-tsx
---
Method: dual-agent (A: isolated design-review agent · B: isolated detector/evidence agent)

# Design Health Score — 22/40 (Acceptable)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Translate feedback renders only at top of column — flipping the note's हिं at page bottom gave 20 observed silent seconds; "Searching…" static through ~25s; save failure silent |
| 2 | Match System / Real World | 3 | Officer vocabulary throughout, but Ref: cites internal filenames; "relevance bar" is retrieval-engineer speak |
| 3 | User Control and Freedom | 2 | No cancel on a 25s query; refuse on the app's own starter offers only "Rephrase"; post-answer pill changes have no apply/undo model |
| 4 | Consistency and Standards | 2 | LanguageToggle active fill = saturated --accent (violates the app's own one-primary-blue rule); 32px control vs 44px floor; two toggle placements |
| 5 | Error Prevention | 2 | 10-char gate unexplained (dead Go button); drawer layout shift caused an observed wrong-case open |
| 6 | Recognition Rather Than Recall | 2 | Lineage forces recall of which corrigendum mattered; 4 source titles truncate identically |
| 7 | Flexibility and Efficiency | 2 | ⌘+Enter hidden in tooltip; no sticky language preference (Hindi-first CCI flips two toggles every case); reopen-with-translations excellent |
| 8 | Aesthetic and Minimalist Design | 2 | Card system genuinely handsome; lineage wall + citation stutter + 5 long starters front-load noise; h1 collides with too-translucent frosted bar |
| 9 | Error Recovery | 3 | Refuse card category-leading; translate error has real retry; but error renders far from the toggle that caused it |
| 10 | Help and Documentation | 2 | Surfaces self-explain; nothing explains OCR badge implications or "verified only" scope |
| **Total** | | **22/40** | **Acceptable — significant improvements before users are happy** |

# Design Specificity Verdict
**LLM assessment:** NOT category-interchangeable — authored for a railway officer's trust ritual (refuse-as-diligence, trust-color grammar, office-document note, corpus-count transparency). The bilingual layer respects the trust grammar (amber verify caveat; citations/₹/[n] never translated). But the authored shell is betrayed by the content layer: citation stutter ("[5]. [5]"), double-numbered note points ("2. 2."), filename Refs, and a 20+-row lineage dump — the rigor the visuals promise is not what the officer can copy out.
**Deterministic scan:** 0 findings across all 10 changed UI files (verified non-trivial scan; exit 0). Console clean on the live page. The detector caught nothing the reviewer missed; every real issue found is judgment-level, beyond mechanical rules.
**Visual overlays:** injection BLOCKED (https page cannot load the http://localhost detect script — mixed-content auto-upgrade stall; preflight passed, server served detect.js, script never executed). No overlay exists; fallback = the evidence above. Narrow-width (610px) was NOT obtainable this session (resize_window silently no-ops on shrink; verified, not skipped) — responsive judgment rests on CSS evidence, not fresh pixels.

# Overall Impression
A genuinely authored trust instrument with an execution gap exactly at the officer's moment of reliance: the first-tap starter refuses, the copyable note needs manual repair, and the lineage proves everything except what governs this case. Fix the artifact layer and this is a 30+ product.

# What's Working
1. **The refuse state** — calm, slate, mono corpus count, recovery actions, zero red; "no answer" converted into visible diligence. The product's soul, executed (Hindi variant keeps the register).
2. **Trust-color grammar end-to-end** — verified green / OCR amber / refuse slate across badges, dots, history, and the Hindi caveat; citations/₹/dates verbatim in Hindi. Coherent, teachable.
3. **Transparency loading + instant reopen** — real corpus count in tabular mono turns dead time into a trust claim; history reopen rehydrates with persisted translations.

# Priority Issues
- **[P0] Flagship starter refuses.** EXAMPLE_CASES[0] live-returns the refuse card, breaking EmptyState's own stated contract ("first tap … never a refuse"). First-run funnel dead-ends at hello. Fix: smoke-test all 5 starters vs prod corpus (deploy gate); replace the failing one; starter-aware refuse copy. → /impeccable harden
- **[P1] Bilingual feedback invisible at the interaction point.** Translating/error+retry render at top of answerMain; the note's toggle is ~15 viewport-heights below (observed: 20 silent seconds). Fix: busy state on the toggle + inline status under the requesting segment. → /impeccable polish
- **[P1] Citation stutter + double numbering on the official artifacts.** Prose keeps literal "[5]" before the chips ("…[5]. [5]", also in Hindi), note points render "1. 1."/"2. 2." (ol marker + embedded number) — flowing into Copy/Export, the thing an officer signs. Fix: strip inline [n] + leading "N." at parse with copied-text regression tests. → /impeccable polish
- **[P1] Lineage is a dump, not a story.** 20+ identical green "In force" rows; the one supersession justifying the answer indistinguishable from ~18 uncited siblings; description repeats title. Fix: highlight the cited chain, collapse the rest ("+16 more corrigenda"), delete duplicate line. → /impeccable distill
- **[P1] Fixed bottom nav overlaps content (corroborated by both assessments).** Detector agent: at ~1440px the tab bar clips the starter-question card text; design agent: occluded refuse CTA/answer at 664px viewport. Content never reserves bar-height clearance. Fix: bottom padding = nav height + safe-area on the scroll container (or hide mobile nav pattern at desktop). → /impeccable adapt
- **[P2] LanguageToggle breaks the app's own rules.** Saturated accent fill + white 13px text (4.03:1, below the AA bar this codebase itself documents), 32px control vs the 44px floor (the CSS comment claiming padded ≥44 is untrue), two placements; language resets EN every submit — no remembered preference. → /impeccable polish

# Persona Red Flags
- **Jordan (first-timer):** first exampleChip → RefuseState (P0); chip tap gives no visible response at the finger (no focus/scroll); "Rephrase the case" blames Jordan for the app's own phrasing; h1 bleeds through frosted bar on first scroll.
- **Alex (power user):** ⌘+Enter only in a title tooltip; flipping "Verified only" after an answer silently does nothing to the visible answer; per-case EN reset = re-flip every note; 20+-row lineage is the only path to "which corrigendum governs".
- **Sam (screen reader/keyboard):** aria-live="polite" on the whole ConclusionCard re-announces the entire answer when Hindi swaps in — with the stutter read twice per sentence; EmptyState examples div has aria-label without role (name dropped); 32px toggle targets with no busy state; save button doubles aria-pressed with a swapping label.

# Minor Observations
Refuse card ghost-faded ~40% opacity beyond the 300ms fade (observed twice); drawer "Loading cases…" above an already-rendered list → observed wrong-case open (fixed-height skeleton rows); Devanagari through the IBM Plex Mono stack (no glyphs → mid-line font fallback + reflow); skeleton max-width 68ch vs full-width answer card (arrival shift); "Searching…" runs through synthesis (staged copy would be honest); source titles leak underscored filenames, [3]/[4]/[7]/[8] truncate identically; dead white space at page end; offline cached card wires chips to a no-op onCite; stale "in the TopBar" comment in LanguageToggle.module.css:1; green leadDot reads as verified-status even when an OCR source is cited.

# Questions to Consider
1. The lineage spends 20+ rows proving every corrigendum is "In force" and zero pixels saying which one governs *this* case — what if it answered "why this rule" instead of "here is everything we know"?
2. A CCI signs their name under the note. Is it "drafted" while it still needs manual repair — and should the acceptance test be "a real officer submitted it verbatim"?
3. Two independent EN|हिं toggles are architecturally honest — but does any officer want a Hindi answer with an English note, or is this one remembered preference masquerading as two 32px controls?
