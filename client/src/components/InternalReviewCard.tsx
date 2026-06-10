import {
  REPORT_TYPES,
  type IntakeScenario,
  type ReportTypeId,
  type RiskLevel
} from "../../../shared/drivableDecisionEngine";

type RiskFlag = {
  label: string;
  level: RiskLevel;
  detail: string;
};

type ReviewerDecision = {
  label: string;
  state: "selected" | "available" | "blocked";
  description: string;
};

type InternalReviewData = {
  caseId: string;
  intakeType: string;
  scenario: IntakeScenario;
  scenarioLabel: string;
  reportTypeId: ReportTypeId;
  submittedAt: string;
  reviewStatus: string;
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  vehicle: {
    year: string;
    make: string;
    model: string;
    trim: string;
    mileage: string;
    vin: string;
  };
  customerGoal: string;
  symptoms: {
    summary: string;
    warningLights: string;
    noise: string;
    vibration: string;
  };
  media: readonly {
    label: string;
    value: string;
    status: "received" | "missing";
  }[];
  aiDraftSummary: string;
  riskFlags: readonly RiskFlag[];
  reviewerDecisions: readonly ReviewerDecision[];
  readiness: "Not ready" | "Needs review" | "Customer-ready after human approval";
  internalNotes: string;
};

type InternalReviewCardProps = {
  data?: Partial<InternalReviewData>;
};

const sampleReview: InternalReviewData = {
  caseId: "DRV-2026-0610-0142",
  intakeType: "internal-diagnosis-response",
  scenario: "buying_vehicle",
  scenarioLabel: "Buying a vehicle",
  reportTypeId: "buyer_remote_risk_review",
  submittedAt: "June 10, 2026 at 8:42 AM",
  reviewStatus: "Needs human review",
  customer: {
    name: "Jordan Taylor",
    email: "jordan.test@example.com",
    phone: "(555) 010-0142"
  },
  vehicle: {
    year: "2014",
    make: "Honda",
    model: "Accord",
    trim: "EX",
    mileage: "142,500 miles",
    vin: "Not provided"
  },
  customerGoal:
    "Decide whether this vehicle is worth paying for an inspection, negotiating, or walking away from.",
  symptoms: {
    summary:
      "Customer reports vibration while braking above 40 mph. The seller says the vehicle only needs brake pads.",
    warningLights: "Intermittent ABS light",
    noise: "No clear noise description provided",
    vibration: "Steering-wheel vibration while braking; speed and severity need confirmation"
  },
  media: [
    { label: "Photos", value: "2 seller listing photos; no brake or tire detail", status: "received" },
    { label: "Video", value: "Not provided", status: "missing" },
    { label: "Audio", value: "Not provided", status: "missing" }
  ],
  aiDraftSummary:
    "Based on the information provided, possible causes include brake rotor or pad problems, a front wheel or suspension concern, or an ABS-related fault. Confidence is moderate for a brake-related path and low for the other possibilities because no scan data, detailed photos, or in-person inspection are available. An independent brake, wheel, tire, suspension, and ABS inspection is recommended before purchase.",
  riskFlags: [
    {
      label: "Safety risk",
      level: "high",
      detail: "Braking vibration and an intermittent ABS light require cautious language and inspection."
    },
    {
      label: "Missing information",
      level: "medium",
      detail: "No scan codes, test-drive details, brake photos, tire photos, or braking video."
    },
    {
      label: "Legal/title risk",
      level: "unknown",
      detail: "VIN, title status, and ownership evidence were not submitted."
    },
    {
      label: "High-cost repair risk",
      level: "medium",
      detail: "Wheel bearing, suspension, ABS, or brake-system work could exceed a basic pad replacement."
    },
    {
      label: "Confidence too low",
      level: "medium",
      detail: "Evidence is not strong enough to approve a single diagnosis or repair claim."
    }
  ],
  reviewerDecisions: [
    {
      label: "Needs more info",
      state: "selected",
      description: "Request scan results, brake/tire photos, and clearer test-drive details."
    },
    {
      label: "Ready for customer draft",
      state: "available",
      description: "Available only after the risk language and missing evidence are reviewed."
    },
    {
      label: "Needs mechanic review",
      state: "selected",
      description: "Recommended because the submitted concern involves braking and ABS behavior."
    },
    {
      label: "Unsafe/high-risk language required",
      state: "selected",
      description: "The customer response must not imply the vehicle is cleared for driving or purchase."
    },
    {
      label: "Do not send",
      state: "blocked",
      description: "Keep the response internal until a human approves the final customer wording."
    }
  ],
  readiness: "Not ready",
  internalNotes:
    "Seller's claim that the vehicle only needs pads is unverified. Ask whether the ABS light remains on, whether the vibration occurs outside braking, and whether an independent inspection is allowed. Do not repeat the seller's repair claim as fact."
};

const scenarioLabels: Record<IntakeScenario, string> = {
  current_problem: "Current problem",
  buying_vehicle: "Buying a vehicle",
  selling_vehicle: "Selling a vehicle",
  ownership_health_check: "Ownership health check",
  sitting_vehicle: "Sitting/dead vehicle"
};

function DetailList({
  items
}: {
  items: readonly { label: string; value: string }[];
}) {
  return (
    <dl className="ir-detail-list">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function InternalReviewCard({ data }: InternalReviewCardProps) {
  const review: InternalReviewData = {
    ...sampleReview,
    ...data,
    customer: { ...sampleReview.customer, ...data?.customer },
    vehicle: { ...sampleReview.vehicle, ...data?.vehicle },
    symptoms: { ...sampleReview.symptoms, ...data?.symptoms }
  };
  const reportType =
    REPORT_TYPES.find((item) => item.id === review.reportTypeId) ?? REPORT_TYPES[0];

  return (
    <main className="ir-page">
      <article className="ir-card">
        <header className="ir-case-header">
          <div>
            <p className="ir-eyebrow">Drivable Internal Review</p>
            <h1>Case {review.caseId}</h1>
            <p className="ir-header-copy">
              Sample review packet for Glenn/admin approval before customer delivery.
            </p>
          </div>
          <span className="ir-status">{review.reviewStatus}</span>
        </header>

        <section className="ir-section">
          <h2>Case Header</h2>
          <DetailList items={[
            { label: "Case ID", value: review.caseId },
            { label: "Intake type", value: review.intakeType },
            { label: "Scenario", value: review.scenarioLabel || scenarioLabels[review.scenario] },
            { label: "Report type", value: reportType.label },
            { label: "Submitted at", value: review.submittedAt },
            { label: "Review status", value: review.reviewStatus }
          ]} />
        </section>

        <div className="ir-two-column">
          <section className="ir-section">
            <h2>Customer / Contact</h2>
            <DetailList items={[
              { label: "Name", value: review.customer.name },
              { label: "Email", value: review.customer.email },
              { label: "Phone", value: review.customer.phone }
            ]} />
          </section>

          <section className="ir-section">
            <h2>Vehicle</h2>
            <DetailList items={[
              {
                label: "Vehicle",
                value: `${review.vehicle.year} ${review.vehicle.make} ${review.vehicle.model} ${review.vehicle.trim}`
              },
              { label: "Mileage", value: review.vehicle.mileage },
              { label: "VIN", value: review.vehicle.vin }
            ]} />
          </section>
        </div>

        <section className="ir-section ir-goal">
          <p className="ir-eyebrow">Customer Goal</p>
          <h2>What they are trying to decide</h2>
          <p>{review.customerGoal}</p>
        </section>

        <section className="ir-section">
          <h2>Submitted Symptoms / Media</h2>
          <div className="ir-symptom-grid">
            <div>
              <h3>Symptoms summary</h3>
              <p>{review.symptoms.summary}</p>
            </div>
            <div>
              <h3>Warning lights</h3>
              <p>{review.symptoms.warningLights}</p>
            </div>
            <div>
              <h3>Noise</h3>
              <p>{review.symptoms.noise}</p>
            </div>
            <div>
              <h3>Vibration</h3>
              <p>{review.symptoms.vibration}</p>
            </div>
          </div>
          <div className="ir-media-grid">
            {review.media.map((item) => (
              <div className="ir-media-item" key={item.label}>
                <span className={`ir-media-status ir-media-${item.status}`}>{item.status}</span>
                <h3>{item.label}</h3>
                <p>{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="ir-section ir-ai-draft">
          <div className="ir-section-heading">
            <div>
              <p className="ir-eyebrow">AI Draft</p>
              <h2>AI draft - requires human review.</h2>
            </div>
            <span className="ir-internal-chip">Internal only</span>
          </div>
          <p>{review.aiDraftSummary}</p>
        </section>

        <section className="ir-section">
          <h2>Risk Flags</h2>
          <div className="ir-risk-grid">
            {review.riskFlags.map((flag) => (
              <div className={`ir-risk-card ir-risk-${flag.level}`} key={flag.label}>
                <div className="ir-risk-heading">
                  <h3>{flag.label}</h3>
                  <span>{flag.level}</span>
                </div>
                <p>{flag.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="ir-section">
          <h2>Reviewer Decision</h2>
          <p className="ir-section-copy">Sample decision states only. No action is submitted from this preview.</p>
          <div className="ir-decision-grid">
            {review.reviewerDecisions.map((decision) => (
              <div className={`ir-decision-option ir-decision-${decision.state}`} key={decision.label}>
                <span className="ir-decision-marker" aria-hidden="true" />
                <div>
                  <h3>{decision.label}</h3>
                  <p>{decision.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="ir-section ir-readiness">
          <div>
            <p className="ir-eyebrow">Customer Response Readiness</p>
            <h2>{review.readiness}</h2>
          </div>
          <div className="ir-readiness-steps" aria-label="Customer response readiness states">
            {["Not ready", "Needs review", "Customer-ready after human approval"].map((step) => (
              <span className={step === review.readiness ? "active" : ""} key={step}>{step}</span>
            ))}
          </div>
        </section>

        <section className="ir-section">
          <h2>Internal Notes</h2>
          <div className="ir-notes">{review.internalNotes}</div>
        </section>

        <footer className="ir-safety-notice">
          <strong>Human approval required.</strong>
          <p>
            Internal review must not automatically send high-risk diagnosis, safety, title, or
            repair-cost guidance to the customer without human approval.
          </p>
        </footer>
      </article>
    </main>
  );
}
