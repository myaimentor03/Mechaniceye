import { NextActionStrip } from "./NextActionStrip";

/**
 * Find My Car is intentionally a truthful product boundary until a durable,
 * reviewed inventory source exists. This page gives the customer a safe next
 * step without presenting demo inventory as searchable supply.
 */
export function FindMyCarPreview() {
  return (
    <main className="product-landing">
      <section className="product-landing-shell">
        <header className="product-landing-hero">
          <p className="product-landing-eyebrow">Vehicle search</p>
          <h1>Find My Car</h1>
          <p>We can help you organize what you need in a vehicle before you shop.</p>
        </header>

        <section className="product-landing-grid" aria-label="Find My Car status">
          <article className="product-landing-card">
            <h2>What is available now</h2>
            <p>
              Buyer Check can turn a listing, vehicle details, and your observations into a
              first-pass checklist for questions, evidence, and inspection planning.
            </p>
          </article>
          <article className="product-landing-card">
            <h2>What is not connected yet</h2>
            <p>
              There is no live inventory feed, saved search, dealer network, ranking system,
              or durable Find My Car request in this release. We will not present sample listings
              as available vehicles to buy.
            </p>
          </article>
          <article className="product-landing-card">
            <h2>Your next safe step</h2>
            <p>
              Use Buyer Check for a vehicle you are considering, or ask for help describing the
              type of vehicle and tradeoffs you want to explore.
            </p>
          </article>
        </section>

        <nav className="product-landing-actions" aria-label="Find My Car actions">
          <a className="product-landing-action primary" href="/buyer-check">
            Use Buyer Check
          </a>
          <a className="product-landing-action" href="/help?topic=find-my-car">
            Ask for help
          </a>
          <a className="product-landing-action" href="/marketplace/browse">
            View clearly labeled sample listings
          </a>
        </nav>

        <aside className="product-landing-warning">
          Find My Car is not a live marketplace search, dealer referral, price guarantee, vehicle
          recommendation, or offer to sell a vehicle. Sample marketplace content is synthetic and
          is not an available inventory feed.
        </aside>

        <NextActionStrip
          primaryLabel="Use Buyer Check"
          primaryHref="/buyer-check"
          secondaryHref="/help?topic=find-my-car"
          additionalLinks={[{ label: "Sample listings", href: "/marketplace/browse" }]}
        />
      </section>
    </main>
  );
}
