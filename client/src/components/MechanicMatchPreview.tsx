import { NextActionStrip } from "./NextActionStrip";

const SECTIONS = [
  {
    title: "When to use it",
    body: "Use Mechanic Match when the vehicle needs hands-on diagnosis, inspection, or repair and you need help choosing the right kind of provider."
  },
  {
    title: "What Drivable can prepare",
    body: "Drivable can organize the vehicle details, symptom story, urgency, safe evidence, and questions a mechanic should see first."
  },
  {
    title: "What it does not guarantee",
    body: "It is request and referral support, not live booking, emergency dispatch, provider certification, or control of third-party work."
  },
  {
    title: "Safety first",
    body: "If brakes, steering, smoke, fire, fuel, overheating, wheel/tire failure, or severe electrical risk is present, stop driving and seek qualified in-person help."
  }
] as const;

export function MechanicMatchPreview() {
  return (
    <main className="product-landing">
      <section className="product-landing-shell">
        <header className="product-landing-hero">
          <p className="product-landing-eyebrow">Hands-on help</p>
          <h1>Mechanic Match</h1>
          <p>Find the right next step when a vehicle needs hands-on help.</p>
        </header>

        <section className="product-landing-grid" aria-label="How Mechanic Match works">
          {SECTIONS.map((section) => (
            <article className="product-landing-card" key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </section>

        <nav className="product-landing-actions" aria-label="Mechanic Match actions">
          <a className="product-landing-action primary" href="/start">Start at /start</a>
          <a className="product-landing-action" href="/help">Ask for help</a>
          <a className="product-landing-action" href="/evidence-checklist">Evidence checklist</a>
          <a className="product-landing-action" href="/mechanic-match/request">Open match request</a>
        </nav>

        <aside className="product-landing-warning">
          Mechanic Match does not guarantee mechanic availability, pricing, repair outcome, inspection result, or shop quality.
        </aside>

        <NextActionStrip
          primaryLabel="Start with Drivable"
          primaryHref="/start"
          secondaryHref="/help"
          additionalLinks={[{ label: "Open match request", href: "/mechanic-match/request" }]}
        />
      </section>
    </main>
  );
}

