import { NextActionStrip } from "./NextActionStrip";

const REQUESTED_ITEMS = [
  "Cold start video",
  "Walk-around video",
  "Dash warning light photo",
  "Scan code screenshot",
  "Short driving, braking, or vibration video if safe",
  "Photos of tires, wheels, brakes, or leaks",
  "Description of when the symptom happens"
] as const;

const REASONS = [
  "Reduce guessing",
  "Improve confidence",
  "Avoid unsafe advice",
  "Help compare repair, sell, buy, or walk-away options"
] as const;

export function MissingInfoRequestPreview() {
  return (
    <main className="mip-page">
      <article className="mip-card">
        <header className="mip-header">
          <div>
            <p className="mip-brand">Drivable by Mechanic&apos;s Eye</p>
            <h1>Missing Information Needed</h1>
            <p>2014 Toyota Camry LE, 148,000 miles</p>
          </div>
          <span className="mip-status">Needs More Info</span>
        </header>

        <section className="mip-intro">
          <h2>We understand the concern. We need a clearer picture.</h2>
          <p>
            Thanks. We have enough to understand the concern, but not enough to give a useful
            confidence-rated recommendation yet.
          </p>
        </section>

        <section className="mip-section">
          <h2>Why we need more info</h2>
          <div className="mip-reason-grid">
            {REASONS.map((reason) => <div key={reason}>{reason}</div>)}
          </div>
        </section>

        <section className="mip-section">
          <h2>Requested items</h2>
          <ul className="mip-checklist">
            {REQUESTED_ITEMS.map((item) => (
              <li key={item}><span aria-hidden="true">OK</span>{item}</li>
            ))}
          </ul>
        </section>

        <aside className="mip-warning">
          <strong>Do not gather evidence by taking a safety risk.</strong>
          <p>
            If the vehicle has brake, steering, overheating, fuel leak, smoke, severe electrical,
            wheel/tire, or loss-of-power concerns, do not keep driving it just to gather evidence.
          </p>
        </aside>

        <section className="mip-section mip-reply">
          <h2>How to reply</h2>
          <p>
            Reply with the items above or send what you can. If something is unsafe to capture,
            skip it and tell us what happened.
          </p>
        </section>

        <footer className="mip-limitation">
          Drivable provides informational, confidence-rated guidance based on information provided.
          This is not a certified diagnosis, inspection, safety clearance, title verification, or
          repair guarantee.
        </footer>
      </article>

      <NextActionStrip
        primaryLabel="See evidence checklist"
        primaryHref="/evidence-checklist"
        secondaryLabel="Ask for help"
        secondaryHref="/help"
        note="Gather only what is safe, then return for the next review step."
      />
    </main>
  );
}
