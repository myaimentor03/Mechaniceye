import { NextActionStrip } from "./NextActionStrip";

const OUTCOME_FIELDS = [
  ["Case ID", "DRV-2026-0611-0248"],
  ["Original recommendation", "Move only to the nearest safe place if braking feels normal, then arrange inspection."],
  ["Customer action taken", "Drove two miles to a nearby repair shop at low speed."],
  ["Actual cause found", "Front brake rotors heavily warped; right-front wheel bearing also showed play."],
  ["Actual repair performed", "Front pads and rotors replaced; wheel bearing scheduled for follow-up."],
  ["Actual cost", "$684 paid; bearing repair not yet completed."],
  ["Tow used", "No"],
  ["Did customer drive", "Yes"],
  ["Did advice help", "Yes"],
  ["Follow-up notes", "Customer reported normal pedal feel and no red brake warning before moving the vehicle."],
  ["Learning notes", "Brake vibration path was useful, but future guidance should ask about wheel-bearing noise earlier."]
] as const;

export function OutcomeCapturePreview() {
  return (
    <main className="ocp-page">
      <article className="ocp-card">
        <header className="ocp-header">
          <div>
            <p className="ocp-eyebrow">Drivable Follow-Up</p>
            <h1>Outcome Capture Preview</h1>
            <p>This sample shows how the original guidance can be compared with what happened next.</p>
          </div>
          <span className="ocp-status">Outcome Needed</span>
        </header>

        <section className="ocp-explanation">
          <h2>Real outcomes close the loop.</h2>
          <p>This feedback is how Drivable improves future confidence-rated guidance.</p>
        </section>

        <dl className="ocp-fields">
          {OUTCOME_FIELDS.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <footer className="ocp-note">
          Sample data only. Customer-reported results should remain separate from causes verified
          by a qualified inspection or repair record.
        </footer>
      </article>

      <NextActionStrip
        primaryLabel="View sample report"
        primaryHref="/report-preview"
        secondaryLabel="View review action"
        secondaryHref="/review-action-preview"
        note="Trace the sample from report and review to its eventual real-world outcome."
      />
    </main>
  );
}
