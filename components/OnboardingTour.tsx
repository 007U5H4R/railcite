'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import styles from './OnboardingTour.module.css';

// First-run guided tour: glassmorphism coach-marks that spotlight one element at a time. Auto-runs
// once for a new visitor (localStorage flag), and is replayable from the You screen (which sets the
// REPLAY sessionStorage flag and routes to /ask). Purely client-side and best-effort: every storage
// access is guarded, and if an anchor is missing the step is skipped rather than blocking the tour.
const FLAG = 'railcite:onboarded';
const REPLAY = 'railcite:replayTour';

type Step = { sel: string; title: string; body: string };
const STEPS: Step[] = [
  { sel: '[data-tour="case-input"]', title: 'Describe your case',
    body: 'Type the situation in plain words — e.g. “wagons detained beyond free time.” Press Enter to search.' },
  { sel: '[data-tour="scope"]', title: 'Commercial Domain',
    body: 'Every answer is drawn from the full Indian Railways Traffic Commercial corpus — circulars, corrigenda and manuals.' },
  { sel: '[data-tour="suggested"]', title: 'Not sure where to start?',
    body: 'Tap a suggested question to drop it into the box — then tweak the wording if you like.' },
  { sel: '[data-tour="history"]', title: 'History & cited circulars',
    body: 'Open this panel any time for your past cases and the exact circulars each answer cited.' },
  { sel: '[data-tour="value"]', title: 'Cited — or it says so',
    body: 'Every claim links to the real passage it came from, with the supersession lineage. If no rule governs your case, RailCite says so instead of guessing.' },
  { sel: '[data-tour="nav"]', title: 'Find your way',
    body: 'Saved holds your bookmarked cases, Feedback sends the team a note, and You is your account.' },
];

type Box = { top: number; left: number; width: number; height: number };

export function OnboardingTour() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [i, setI] = useState(0);
  const [spot, setSpot] = useState<Box | null>(null);
  const [card, setCard] = useState<{ top: number; left: number; sheet: boolean } | null>(null);
  const startedRef = useRef(false);

  const finish = useCallback(() => {
    setActive(false);
    try { localStorage.setItem(FLAG, '1'); sessionStorage.removeItem(REPLAY); } catch { /* storage may be blocked */ }
  }, []);

  // Decide whether to start: not-yet-onboarded (or an explicit replay), then wait for the first
  // anchor to mount (it only exists on the /ask empty state) before opening.
  useEffect(() => {
    let done = false, replay = false;
    try { done = !!localStorage.getItem(FLAG); replay = !!sessionStorage.getItem(REPLAY); } catch {}
    if (replay) startedRef.current = false;      // allow a replay to re-run within the same session
    if (startedRef.current || (done && !replay)) return;
    let tries = 0;
    const id = window.setInterval(() => {
      if (document.querySelector(STEPS[0].sel)) {
        window.clearInterval(id);
        startedRef.current = true;
        try { sessionStorage.removeItem(REPLAY); } catch {}
        setI(0); setActive(true);
      } else if (++tries > 25) {                 // ~5s: anchor never appeared (not on /ask) — stop trying
        window.clearInterval(id);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [pathname]);

  // Position the spotlight + card for the current step; recompute on scroll/resize.
  const place = useCallback(() => {
    const el = document.querySelector(STEPS[i]?.sel) as HTMLElement | null;
    if (!el) { setSpot(null); setCard(null); return; }
    const r = el.getBoundingClientRect();
    const pad = 8;
    setSpot({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });

    const vw = window.innerWidth, vh = window.innerHeight;
    if (vw < 560) { setCard({ top: 0, left: 0, sheet: true }); return; }   // narrow: bottom sheet
    const cardW = 340, estH = 220, m = 16;        // estimated card height keeps it fully on-screen
    let left = r.left + r.width / 2 - cardW / 2;
    left = Math.max(m, Math.min(left, vw - cardW - m));
    const belowTop = r.bottom + pad + 12;
    const aboveTop = r.top - pad - 12 - estH;
    if (belowTop + estH <= vh - m) setCard({ top: belowTop, left, sheet: false });        // fits below
    else if (aboveTop >= m) setCard({ top: aboveTop, left, sheet: false });               // else above
    else setCard({ top: 0, left: 0, sheet: true });                                       // else bottom sheet
  }, [i]);

  useLayoutEffect(() => {
    if (!active) return;
    const el = document.querySelector(STEPS[i]?.sel) as HTMLElement | null;
    if (el) {
      // Only scroll when the target isn't already fully on-screen. A sticky/fixed element (the
      // header toggle, the bottom nav) is always visible, so scrolling to its in-flow position
      // would jump the page jarringly — this leaves it put and just spotlights where it sits.
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    place();
    const t = window.setTimeout(place, 380);      // re-place after the smooth scroll settles
    const onMove = () => place();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => { window.clearTimeout(t); window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); };
  }, [active, i, place]);

  // Keyboard: Esc skips, ←/→ navigate.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight') setI(v => Math.min(v + 1, STEPS.length - 1));
      else if (e.key === 'ArrowLeft') setI(v => Math.max(v - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, finish]);

  if (!active) return null;
  const last = i === STEPS.length - 1;
  const step = STEPS[i];

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="RailCite tour">
      <div className={styles.scrim} />
      {spot && !card?.sheet && (
        <div className={styles.spot} style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }} />
      )}
      {card && (
        <div
          className={`${styles.card} ${card.sheet ? styles.sheet : ''}`}
          style={card.sheet ? undefined : { top: card.top, left: card.left }}
        >
          <button type="button" className={styles.skip} onClick={finish} aria-label="Skip the tour">Skip</button>
          <p className={styles.kicker}>{i + 1} of {STEPS.length}</p>
          <h3 className={styles.title}>{step.title}</h3>
          <p className={styles.body}>{step.body}</p>
          <div className={styles.foot}>
            <div className={styles.dots} aria-hidden="true">
              {STEPS.map((_, d) => <span key={d} className={d === i ? styles.dotOn : styles.dot} />)}
            </div>
            <div className={styles.actions}>
              {i > 0 && <button type="button" className={styles.back} onClick={() => setI(i - 1)}>Back</button>}
              <button type="button" className={styles.next} onClick={() => (last ? finish() : setI(i + 1))}>
                {last ? 'Done' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
