import { NextActionStrip } from "./NextActionStrip";

const STOP_NOW_SIGNS = [
  "Brake pedal goes soft",
  "Steering pulls hard",
  "ABS/brake light stays on",
  "Grinding noise gets worse",
  "Wheel shakes violently",
  "Smoke or a burning smell",
  "Fluid leak",
  "Warning lights multiply"
] as const;

const MOVE_GUIDANCE = [
  "Move only if brakes and steering feel normal",
  "Keep speed low",
  "Avoid highways",
  "Increase following distance",
  "Use hazard lights if needed",
  "Go to the nearest safe parking lot or shop, not across town",
  "Stop immediately if symptoms worsen"
] as const;

const SAFE_CHECKS = [
  "Look for leaking fluid",
  "Check tire and wheel damage from outside",
  "Check dashboard warnings",
  "Listen for grinding or metal noise",
  "Confirm the brake pedal feels firm",
  "Do not crawl under the vehicle on the roadside"
] as const;

const MISSING_INFO = [
  "Braking video if safe",
  "Dash light photo",
  "OBD/ABS code screenshot",
  "Tire and brake photos",
  "When the vibration happens"
] as const;

function GuidanceList({ items }: { items: readonly string[] }) {
  return (
    <ul className="rg-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

export function RoadsideGuidancePreview() {
  return (
    <main className="rg-page">
      <article className="rg-card">
        <header className="rg-header">
          <div>
            <p className="rg-eyebrow">Drivable Roadside Guidance</p>
            <h1>Can I get home or should I stop?</h1>
            <p className="rg-vehicle">2014 Toyota Camry LE, 148,000 miles</p>
          </div>
          <span className="rg-preview-badge">Sample Preview</span>
        </header>

        <section className="rg-recommendation">
          <p className="rg-eyebrow">Immediate Recommendation</p>
          <h2>Limit movement to reaching the nearest safe place.</h2>
          <p>
            Do not treat this as cleared for normal driving. Based on brake vibration and an
            intermittent ABS light, the safer move is to drive only to the nearest safe place if
            braking feels normal, then arrange inspection.
          </p>
        </section>

        <section className="rg-section">
          <h2>Risk Level</h2>
          <div className="rg-risk-grid">
            <div><span>Risk</span><strong className="rg-risk-high">Moderate/high risk</strong></div>
            <div><span>Confidence</span><strong>Moderate</strong></div>
            <div><span>Human review</span><strong>Required if risk becomes high</strong></div>
          </div>
        </section>

        <section className="rg-stop-now">
          <p className="rg-eyebrow">Stop Now If</p>
          <h2>Do not continue if any of these signs appear.</h2>
          <GuidanceList items={STOP_NOW_SIGNS} />
        </section>

        <div className="rg-two-column">
          <section className="rg-section">
            <h2>If You Must Move It</h2>
            <GuidanceList items={MOVE_GUIDANCE} />
          </section>

          <section className="rg-section">
            <h2>Safe Checks Before Moving</h2>
            <GuidanceList items={SAFE_CHECKS} />
          </section>
        </div>

        <section className="rg-section">
          <h2>Temporary Path vs Complete Fix Path</h2>
          <div className="rg-path-grid">
            <article className="rg-path-temporary">
              <p className="rg-eyebrow">Temporary path</p>
              <h3>Reach a safer place</h3>
              <p>May help reach a safer place only if risk stays low enough.</p>
            </article>
            <article className="rg-path-complete">
              <p className="rg-eyebrow">Complete fix path</p>
              <h3>Inspect the whole braking concern</h3>
              <p>
                Requires inspection of brakes, rotors, calipers, wheel bearings, suspension,
                tires, and ABS codes.
              </p>
            </article>
          </div>
        </section>

        <section className="rg-section rg-script">
          <p className="rg-eyebrow">What To Tell A Mechanic</p>
          <h2>Copy this when you call</h2>
          <blockquote>
            I have a 2014 Toyota Camry with vibration while braking and an intermittent ABS light.
            I need the brakes, rotors, calipers, tires, wheel bearings, front suspension, and ABS
            codes checked. Please tell me what you verified before recommending parts, and let me
            know whether the vehicle should be driven before repairs.
          </blockquote>
        </section>

        <section className="rg-section">
          <h2>Missing Info Needed</h2>
          <GuidanceList items={MISSING_INFO} />
        </section>

        <footer className="rg-safety-notice">
          <h2>Safety Notice</h2>
          <p>
            Drivable provides informational, confidence-rated guidance based on information
            provided. This is not a certified diagnosis, inspection, towing recommendation, safety
            clearance, or repair guarantee. If critical safety symptoms are present, stop driving
            and seek in-person help.
          </p>
        </footer>
      </article>

      <NextActionStrip
        primaryLabel="Choose another path"
        primaryHref="/start"
        note="Use the evidence checklist, sample report, or guided help for the next step."
      />
    </main>
  );
}
