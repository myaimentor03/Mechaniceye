import { NextActionStrip } from "./NextActionStrip";
import { StatusLegend } from "./StatusLegend";

const REVIEW_ACTIONS = [
  {
    label: "Request more info",
    action: "Prepare a customer-safe missing-information request and keep the case in review."
  },
  {
    label: "Send to human/mechanic review",
    action: "Assign the case for a qualified review before customer wording is prepared."
  },
  {
    label: "Prepare customer draft",
    action: "Create a draft response with confidence, limitations, and missing evidence clearly stated."
  },
  {
    label: "Approve to send",
    action: "Release only the final human-approved customer response through the approved workflow."
  },
  {
    label: "Do not send",
    action: "Block delivery and record the safety, quality, legal, or evidence reason."
  }
] as const;

export function InternalReviewActionPanel() {
  return (
    <main className="ira-page">
      <article className="ira-panel">
        <header className="ira-header">
          <div>
            <p className="ira-eyebrow">Drivable Internal Review</p>
            <h1>Reviewer Action Panel</h1>
            <p>Sample controls only. Nothing on this page sends a customer message.</p>
          </div>
          <span className="ira-internal">Internal only</span>
        </header>

        <section className="ira-section">
          <h2>Case summary</h2>
          <dl className="ira-summary-grid">
            <div><dt>Case ID</dt><dd>DRV-2026-0611-0248</dd></div>
            <div><dt>Vehicle</dt><dd>2014 Toyota Camry LE</dd></div>
            <div><dt>Scenario</dt><dd>Current problem / roadside decision</dd></div>
            <div><dt>Customer question</dt><dd>Can I get home or should I stop?</dd></div>
          </dl>
        </section>

        <div className="ira-two-column">
          <section className="ira-section">
            <h2>AI draft status</h2>
            <span className="ira-draft-status">Draft complete - not approved</span>
            <p>
              Possible brake, wheel, tire, bearing, suspension, or ABS paths are described with
              moderate confidence. Safety language needs human review.
            </p>
          </section>
          <section className="ira-section">
            <h2>Risk flags</h2>
            <ul className="ira-flags">
              <li>Braking and vehicle-control concern</li>
              <li>Missing ABS codes and pedal-feel details</li>
              <li>Driving guidance could create safety risk</li>
              <li>Repair cost and cause remain unverified</li>
            </ul>
          </section>
        </div>

        <section className="ira-section">
          <h2>Reviewer choices</h2>
          <p className="ira-section-copy">Static preview of the decision and its next system action.</p>
          <div className="ira-action-grid">
            {REVIEW_ACTIONS.map((item) => (
              <article key={item.label}>
                <span className="ira-choice-marker" aria-hidden="true" />
                <div>
                  <h3>{item.label}</h3>
                  <p><strong>Next action:</strong> {item.action}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="ira-warning">
          High-risk safety, title, structural, or high-cost repair guidance must not be sent
          automatically.
        </aside>

        <StatusLegend />

        <section className="ira-section">
          <h2>Sample reviewer note</h2>
          <div className="ira-note">
            Request a dash-light photo, ABS scan, brake pedal description, and tire/wheel photos.
            Do not imply that the vehicle is safe to drive. If braking changes, a red brake warning
            appears, or the vehicle becomes unstable, tell the customer to stop and seek in-person
            help.
          </div>
        </section>
      </article>

      <NextActionStrip
        primaryLabel="View missing-info request"
        primaryHref="/missing-info-preview"
        secondaryLabel="View customer report"
        secondaryHref="/report-preview"
        note="Compare the internal decision with the customer-facing next step."
      />
    </main>
  );
}
