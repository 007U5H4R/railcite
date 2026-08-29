// Saved route. Minimal real shell for now (R4 lists the user's saved cases from /api/cases).
export default function SavedPage() {
  return (
    <section className="route-screen" aria-labelledby="saved-title">
      <h1 id="saved-title" className="route-title">Saved</h1>
      <p className="route-lede">Cases you save will be collected here for quick reference.</p>
    </section>
  );
}
