// You route. Minimal real shell for now (R4 fills in the account + preferences screen).
export default function YouPage() {
  return (
    <section className="route-screen" aria-labelledby="you-title">
      <h1 id="you-title" className="route-title">You</h1>
      <p className="route-lede">Your account, sign-in, and RailCite preferences.</p>
    </section>
  );
}
