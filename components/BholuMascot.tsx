import './bholu.css';

// Bholu mascot — a homage guard-elephant with a signal lamp, supplied by the project owner
// (an original AI-rendered image, deliberately NOT Indian Railways' official Bholu artwork; the
// TrustFooter disclaims affiliation — Design.md §6.2). Decorative, narrow use only.
//
// The GREETER now plays a short looping "lantern signal" clip (Higgsfield image-to-video from the
// same still — the hand raises/lowers the lantern, flame glowing). It renders on a white card, so
// the clip's white background blends invisibly (chroma-keying was rejected — it holes the mascot's
// white cap/trousers/gloves). Reduced-motion and the offline banner fall back to the still PNG.
const ASPECT = 647 / 520; // public/bholu.png intrinsic ratio (w×h = 520×647)

export function BholuMascot({ variant, size = 168 }: { variant: 'greet' | 'offline'; size?: number }) {
  const height = Math.round(size * ASPECT);

  if (variant === 'offline') {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static local asset; next/image not needed for one decorative mascot
      <img
        src="/bholu.png"
        alt="Bholu, RailCite's guard-elephant mascot"
        width={size}
        height={height}
        className="bholu bholu-offline"
        draggable={false}
      />
    );
  }

  return (
    <span className="bholu-greet" style={{ width: size }}>
      <video
        className="bholu-video"
        width={size}
        autoPlay
        loop
        muted
        playsInline
        poster="/bholu.png"
        aria-label="Bholu, RailCite's guard-elephant mascot, signalling with a lantern"
      >
        <source src="/bholu-signal.mp4?v=3" type="video/mp4" />
      </video>
      {/* eslint-disable-next-line @next/next/no-img-element -- static local asset; reduced-motion / no-video fallback */}
      <img
        className="bholu-fallback"
        src="/bholu.png"
        alt="Bholu, RailCite's guard-elephant mascot"
        width={size}
        height={height}
        draggable={false}
      />
    </span>
  );
}
