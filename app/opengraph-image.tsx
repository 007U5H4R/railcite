import { ImageResponse } from 'next/og';

// Purpose-built 1200×630 social card. Rendered by satori (code-drawn text, always crisp) — never a
// diffusion image. Next wires og:image / og:image:width / og:image:height automatically, resolved to
// an absolute URL via metadataBase (app/layout.tsx). Deliberately typographic + on-brand (blue
// #2f7bf0), leading with the trust moat: cite-or-refuse.
export const alt = 'RailCite — every answer cites its source, or says no governing rule was found';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', padding: '76px 84px', color: '#ffffff',
          fontFamily: 'sans-serif',
          backgroundColor: '#1c62d6',
          backgroundImage: 'linear-gradient(135deg, #1653c4 0%, #2f7bf0 58%, #4f93ff 100%)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 25, letterSpacing: 3, fontWeight: 600, color: 'rgba(255,255,255,0.72)' }}>
          <div style={{ display: 'flex' }}>INDIAN RAILWAYS · TRAFFIC COMMERCIAL</div>
          <div style={{ display: 'flex' }}>CITE · OR · REFUSE</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 132, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>RailCite</div>
          <div style={{ display: 'flex', marginTop: 26, fontSize: 42, fontWeight: 500, lineHeight: 1.28, color: 'rgba(255,255,255,0.96)', maxWidth: 940 }}>
            Every answer cites its source — or says no governing rule was found.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ display: 'flex', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, padding: '13px 28px', fontSize: 27, fontWeight: 600 }}>
            15,000+ circular passages
          </div>
          <div style={{ display: 'flex', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, padding: '13px 28px', fontSize: 27, fontWeight: 600 }}>
            with supersession lineage
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
