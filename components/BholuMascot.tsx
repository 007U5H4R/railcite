import './bholu.css';

// Bholu mascot — a homage guard-elephant with a signal lamp, supplied by the project owner
// (an original AI-rendered image, deliberately NOT Indian Railways' official Bholu artwork; the
// TrustFooter disclaims affiliation — Design.md §6.2). Decorative, narrow use only:
// the empty-state greeter and the offline banner.
const ASPECT = 647 / 520; // public/bholu.png intrinsic ratio (w×h = 520×647)

export function BholuMascot({ variant, size = 140 }: { variant: 'greet' | 'offline'; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static local asset; next/image not needed for one decorative mascot
    <img
      src="/bholu.png"
      alt="Bholu, RailCite's guard-elephant mascot"
      width={size}
      height={Math.round(size * ASPECT)}
      className={`bholu bholu-${variant}`}
      draggable={false}
    />
  );
}
