import { NextActionStrip } from "./NextActionStrip";

const SELLER_CLAIMS = [
  "Runs great",
  "Clean title claimed",
  "Check-engine light is \"just a sensor\"",
  "Needs brakes soon",
  "No leaks claimed"
] as const;

const EVIDENCE_NEEDED = [
  "Cold-start video",
  "Walk-around video",
  "Dash warning-light photo",
  "Underhood photo",
  "Tire and wheel photos",
  "OBD code screenshot",
  "Title and status details",
  "Recent repair receipts",
  "Driving or braking video only if the seller can do it safely"
] as const;

const RISK_FLAGS = [
  "Warning lights dismissed as \"just a sensor\"",
  "Missing title information",
  "No scan codes",
  "No cold start",
  "Fresh detail but no repair proof",
  "Price appears too low for the stated condition"
] as const;

const SELLER_QUESTIONS = [
  "Why are you selling it?",
  "Does it have a clean title in your name?",
  "Are any warning lights on?",
  "Can you send a cold-start video?",
  "Any overheating, slipping, smoke, leaks, or misfires?",
  "What repairs were completed recently?",
  "Can it safely drive 30 minutes?"
] as const;

const WALK_AWAY_SIGNALS = [
  "Seller refuses basic evidence",
  "Title story is unclear",
  "Overheating or transmission issue",
  "Severe warning lights",
  "\"Easy fix\" claim but the seller will not fix it",
  "Pressure to buy immediately"
] as const;

function BuyerList({ items }: { items: readonly string[] }) {
  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

export function BuyerRiskReviewPreview() {
  return (
    <main className="brr-page">
      <section className="brr-shell">
        <header className="brr-hero">
          <p className="brr-eyebrow">Drivable buyer risk review</p>
          <h1>Decide whether this vehicle is worth chasing, inspecting, negotiating, or walking away from.</h1>
          <p>Sample preview for a remote used-car decision.</p>
        </header>

        <section className="brr-snapshot">
          <div>
            <span>Vehicle snapshot</span>
            <h2>2012 Honda Accord, 168,000 miles</h2>
          </div>
          <blockquote>Seller says: "Runs great, only needs minor work."</blockquote>
        </section>

        <div className="brr-two-column">
          <section className="brr-card">
            <h2>Seller claims</h2>
            <BuyerList items={SELLER_CLAIMS} />
          </section>
          <section className="brr-card">
            <h2>Evidence needed from seller</h2>
            <BuyerList items={EVIDENCE_NEEDED} />
          </section>
          <section className="brr-card brr-risk-card">
            <h2>Risk flags</h2>
            <BuyerList items={RISK_FLAGS} />
          </section>
          <section className="brr-card">
            <h2>Questions to ask the seller</h2>
            <BuyerList items={SELLER_QUESTIONS} />
          </section>
        </div>

        <section className="brr-walk-away">
          <h2>Walk-away signals</h2>
          <BuyerList items={WALK_AWAY_SIGNALS} />
        </section>

        <section className="brr-recommendation">
          <p className="brr-eyebrow">Next move recommendation</p>
          <h2>
            Based on missing evidence and seller claims, the safer next move is to request proof
            before spending time or money chasing the vehicle.
          </h2>
        </section>

        <aside className="brr-warning">
          This is not a substitute for an in-person inspection. Drivable does not verify ownership,
          title, mileage, seller claims, vehicle condition, or transaction legitimacy.
        </aside>

        <NextActionStrip
          primaryLabel="Choose a buyer path"
          primaryHref="/start"
          additionalLinks={[
            { label: "Compare decision paths", href: "/decision-path-preview" },
            { label: "Buyer report options", href: "/report-packages" }
          ]}
          note="Request evidence first, then decide whether an independent inspection is worth it."
        />
      </section>
    </main>
  );
}
