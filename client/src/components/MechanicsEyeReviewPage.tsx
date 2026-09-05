import { DrivablePublicHeader } from "./PublicHeaderNavigation";

export function MechanicsEyeReviewPage() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <DrivablePublicHeader />
      </header>

      <main className="content-shell simple-page">
        <section className="hero-card">
          <div className="eyebrow">Mechanic&apos;s Eye Review</div>
          <h1>A clearer case record for the next real-world decision.</h1>
          <p>
            Review organizes the vehicle details, written symptoms, manual OBD codes, and available
            evidence connected to a case. It keeps what was provided, what is missing, and what still
            needs hands-on confirmation visible.
          </p>
        </section>

        <section className="feature-grid" aria-label="Current review capabilities">
          <article className="feature-card">
            <h2>What review can organize</h2>
            <p>
              Vehicle details, mileage or VIN when supplied, written observations, timing and
              driveability context, user-entered OBD codes, and photo attachment records.
            </p>
          </article>
          <article className="feature-card">
            <h2>What happens to photos</h2>
            <p>
              Current photo uploads are persisted as case evidence when storage succeeds. They are
              not visually analyzed by the current AI path.
            </p>
          </article>
          <article className="feature-card">
            <h2>Unavailable evidence types</h2>
            <p>
              Audio and video upload are not enabled in this photo-first release. Vibration is
              accepted only as written, manual symptom context; no readings are generated, simulated,
              or inferred.
            </p>
          </article>
        </section>

        <section className="legal-card">
          <article className="legal-block">
            <h2>Important boundary</h2>
            <div className="legal-copy">
              <p>
                Mechanic&apos;s Eye Review is informational case organization. It is not a confirmed
                diagnosis, safety clearance, vehicle-condition certification, or certified inspection.
              </p>
              <p>
                Safety-critical, structural, title, and high-cost decisions may require qualified
                in-person inspection, testing, or official records.
              </p>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
