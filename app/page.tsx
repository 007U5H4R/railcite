// Home route. Minimal real shell for now (R4 fills in the greeting, recent cases, and
// corpus stats). Renders inside the app Shell provided by app/layout.tsx.
export default function HomePage() {
  return (
    <section className="route-screen" aria-labelledby="home-title">
      <h1 id="home-title" className="route-title">Home</h1>
      <p className="route-lede">
        Your recent cases and the RailCite corpus at a glance. Tap <strong>Ask</strong> to research a new case.
      </p>
    </section>
  );
}
