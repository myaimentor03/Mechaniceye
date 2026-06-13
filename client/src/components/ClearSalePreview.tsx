import { NextActionStrip } from "./NextActionStrip";

const BENEFITS = [
  {
    title: "Built for as-is sellers",
    body: "Use ClearSale when a vehicle needs repair, has known issues, or no longer fits your time and budget."
  },
  {
    title: "Organize the story",
    body: "Bring known issues, safe evidence, repair history, and disclosure-friendly notes into one clearer starting point."
  },
  {
    title: "Move into seller intake",
    body: "The seller intake captures the vehicle and ownership details needed for a reviewed listing request."
  }
] as const;

export function ClearSalePreview() {
  return (
    <main className="product-landing">
      <section className="product-landing-shell">
        <header className="product-landing-hero">
          <p className="product-landing-eyebrow">Seller support</p>
          <h1>ClearSale by Drivable</h1>
          <p>Prepare a clearer as-is vehicle listing with known issues organized.</p>
        </header>

        <section className="product-landing-grid" aria-label="How ClearSale helps">
          {BENEFITS.map((benefit) => (
            <article className="product-landing-card" key={benefit.title}>
              <h2>{benefit.title}</h2>
              <p>{benefit.body}</p>
            </article>
          ))}
        </section>

        <nav className="product-landing-actions" aria-label="ClearSale actions">
          <a className="product-landing-action primary" href="/marketplace/sell/intake">
            Start seller intake
          </a>
          <a className="product-landing-action" href="/repair-vs-sell-preview">
            Compare repair vs sell
          </a>
          <a className="product-landing-action" href="/help?topic=seller-as-is">
            Ask for help
          </a>
        </nav>

        <aside className="product-landing-warning">
          ClearSale does not guarantee sale price, buyer interest, title status, legal compliance, or vehicle condition.
        </aside>

        <NextActionStrip
          primaryLabel="Start seller intake"
          primaryHref="/marketplace/sell/intake"
          secondaryHref="/help?topic=seller-as-is"
          additionalLinks={[{ label: "Compare repair vs sell", href: "/repair-vs-sell-preview" }]}
        />
      </section>
    </main>
  );
}

