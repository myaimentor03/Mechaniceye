import { NextActionStrip } from "./NextActionStrip";

const REVIEW_AREAS = [
  "Seller evidence checklist",
  "Warning signs and inconsistent claims",
  "Title and vehicle-story concerns",
  "Questions to ask the seller",
  "Signals that it may be time to walk away"
] as const;

export function BuyerCheckPreview() {
  return (
    <main className="product-landing">
      <section className="product-landing-shell">
        <header className="product-landing-hero">
          <p className="product-landing-eyebrow">Buyer support</p>
          <h1>Buyer Check by Drivable</h1>
          <p>Review risk before chasing a used vehicle.</p>
        </header>

        <section className="product-landing-card product-landing-list">
          <h2>Know what deserves a closer look</h2>
          <p>Buyer Check helps organize a remote first-pass review before you spend time, travel, or money.</p>
          <ul>
            {REVIEW_AREAS.map((area) => <li key={area}>{area}</li>)}
          </ul>
        </section>

        <nav className="product-landing-actions" aria-label="Buyer Check actions">
          <a className="product-landing-action primary" href="/buyer-risk-preview">
            Open buyer risk review
          </a>
          <a className="product-landing-action" href="/evidence-checklist">
            Evidence checklist
          </a>
          <a className="product-landing-action" href="/help?scenario=buying_vehicle">
            Ask for help
          </a>
        </nav>

        <aside className="product-landing-warning">
          Buyer Check is not a certified inspection, title verification, guarantee of vehicle condition, or legal advice.
        </aside>

        <NextActionStrip
          primaryLabel="Open buyer risk review"
          primaryHref="/buyer-risk-preview"
          secondaryHref="/help?scenario=buying_vehicle"
        />
      </section>
    </main>
  );
}

