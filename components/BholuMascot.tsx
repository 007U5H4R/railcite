import './bholu.css';
// Original, hand-authored line-art of a friendly guard-elephant holding a signal lamp.
// Inspired by Indian Railways' "Bholu" but deliberately NOT the official artwork — no
// impersonation of IR (see Design.md §6.2). Decorative only; empty-state greeter + offline.
export function BholuMascot({ variant, size = 96 }: { variant: 'greet' | 'offline'; size?: number }) {
  const greet = variant === 'greet';
  const lamp = greet ? 'var(--ok-marker)' : 'var(--warn-line)';
  return (
    <svg role="img" aria-label="Bholu, the guard elephant" width={size} height={size}
      viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" className="bholu" data-variant={variant}>
      {/* torso — guard's uniform */}
      <ellipse cx="42" cy="65" rx="18" ry="17" />
      <path d="M37 52 42 56 47 52" />                              {/* collar */}
      <circle cx="42" cy="64" r="1.4" fill="currentColor" stroke="none" />   {/* button */}
      <circle cx="42" cy="72" r="1.4" fill="currentColor" stroke="none" />   {/* button */}
      {/* head, ears, eyes, trunk */}
      <circle cx="42" cy="33" r="14" />
      <path d="M29 30c-7-3-11 3-9 9 2 4 6 6 9 4" />                {/* left ear */}
      <path d="M55 30c7-3 11 3 9 9-2 4-6 6-9 4" />                 {/* right ear */}
      <circle cx="37" cy="33" r="1.8" fill="currentColor" stroke="none" />   {/* left eye */}
      <circle cx="47" cy="33" r="1.8" fill="currentColor" stroke="none" />   {/* right eye */}
      <path d="M42 38c0 9-2 15-6 19c-1 1-1 3 1 3" />               {/* trunk with a friendly curl */}
      {/* guard cap */}
      <path d="M31 22Q42 11 53 22" />                              {/* cap dome */}
      <path d="M29 22H55" />                                       {/* cap band */}
      <circle cx="42" cy="18" r="1.6" fill="currentColor" stroke="none" />   {/* cap badge */}
      {/* signal lamp on a raised (greet) / lowered (offline) arm — the only animated part */}
      <g className={greet ? 'bholu-lamp bholu-lamp-greet' : 'bholu-lamp'}>
        <path d={greet ? 'M58 54 74 36' : 'M58 56 74 72'} />       {/* arm */}
        <circle cx="76" cy={greet ? 31 : 77} r="6" fill={lamp} stroke="none" />
      </g>
    </svg>
  );
}
