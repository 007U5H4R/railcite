import { ImageResponse } from 'next/og';

// App icon / favicon: the RailCite elephant glyph (from the TopBar logo) in white on the brand-blue
// gradient. Full-bleed background + centred glyph in the maskable safe zone, so it also works as the
// PWA maskable icon (public/icon-*.png are rendered from this same mark). 512² source.
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

const GLYPH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="300" height="300"><g fill="#ffffff"><ellipse cx="17" cy="28" rx="11" ry="13"/><ellipse cx="47" cy="28" rx="11" ry="13"/><circle cx="32" cy="30" r="15"/></g><path d="M32 44 C31 51 33 57 39 59 C44 60.6 46 56 44 53 C42.6 51 39.6 51.6 40 54" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #2f7bf0, #1c62d6)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img width="300" height="300" src={`data:image/svg+xml;base64,${Buffer.from(GLYPH).toString('base64')}`} />
      </div>
    ),
    { ...size },
  );
}
