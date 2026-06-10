import {
  DECISION_PATHS,
  REPORT_TYPES,
  type ConfidenceLevel,
  type DecisionPathId,
  type ReportTypeId
} from "../../../shared/drivableDecisionEngine";

type PossibleCause = {
  title: string;
  confidence: ConfidenceLevel | "low_moderate";
};

type ReportPreviewData = {
  reportTypeId: ReportTypeId;
  vehicle: string;
  submittedDate: string;
  scenario: string;
  customerGoal: string;
  summary: string;
  possibleCauses: readonly PossibleCause[];
  supportingEvidence: readonly string[];
  missingInformation: readonly string[];
  urgencyLabel: string;
  urgencyCopy: string;
  decisionRecommendations: Readonly<Record<DecisionPathId, string>>;
  mechanicScript: string;
  nextQuestions: readonly string[];
};

type DrivableReportPreviewProps = {
  data?: Partial<ReportPreviewData>;
};

const sampleData: ReportPreviewData = {
  reportTypeId: "buyer_remote_risk_review",
  vehicle: "2014 Honda Accord EX, 142,500 miles",
  submittedDate: "June 10, 2026",
  scenario: "Buying a vehicle",
  customerGoal: "Decide whether this vehicle is worth inspecting or buying.",
  summary:
    "Based on the information provided, this vehicle shows signs of a brake or vibration issue that should be checked before money is spent or the vehicle is driven heavily.",
  possibleCauses: [
    { title: "Brake rotor or pad issue", confidence: "moderate" },
    { title: "Front suspension or wheel bearing issue", confidence: "low_moderate" },
    { title: "ABS or sensor-related concern", confidence: "low" }
  ],
  supportingEvidence: [
    "Vibration while braking",
    "Intermittent ABS light",
    'Seller says it "only needs pads"',
    "Missing in-person inspection"
  ],
  missingInformation: [
    "Cold start video",
    "Brake inspection photos",
    "Scan code screenshot",
    "Test drive details",
    "Tire and wheel condition photos"
  ],
  urgencyLabel: "Needs inspection before a purchase decision",
  urgencyCopy:
    "Do not treat this as cleared for driving or purchase. Brake, steering, wheel, tire, overheating, fuel leak, smoke, or severe electrical concerns may require immediate in-person inspection.",
  decisionRecommendations: {
    professional_repair:
      "Recommended next step: arrange an independent brake, wheel, tire, and suspension inspection before purchase.",
    diy_repair:
      "Limit DIY work to safe evidence gathering; brake and ABS concerns need proper tools and experience.",
    sell_as_is:
      "If selling instead, disclose the vibration and intermittent ABS light clearly and avoid unsupported repair claims.",
    monitor_wait:
      "Waiting is not a strong path until the safety-related causes have been inspected.",
    walk_away:
      "Walk away if the seller refuses inspection, title verification, scan results, or reasonable evidence requests."
  },
  mechanicScript:
    "Tell the shop the vibration happens while braking above 40 mph and that the ABS light is intermittent. Ask them to inspect front brakes, rotors, calipers, wheel bearings, suspension, tires, and scan ABS codes before replacing parts.",
  nextQuestions: [
    "Does the ABS light stay on or come and go?",
    "Does vibration happen only while braking?",
    "Is the steering wheel shaking or the whole car?",
    "Can the seller provide a cold start and braking video?"
  ]
};

const confidenceLabels: Record<PossibleCause["confidence"], string> = {
  low: "Low confidence",
  moderate: "Moderate confidence",
  high: "High confidence",
  insufficient_information: "Insufficient information",
  low_moderate: "Low/moderate confidence"
};

function ReportList({
  title,
  items,
  tone
}: {
  title: string;
  items: readonly string[];
  tone?: "evidence" | "missing";
}) {
  return (
    <section className={`dr-report-section ${tone ? `dr-report-${tone}` : ""}`}>
      <h2>{title}</h2>
      <ul className="dr-report-list">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

export function DrivableReportPreview({ data }: DrivableReportPreviewProps) {
  const report = {
    ...sampleData,
    ...data,
    decisionRecommendations: {
      ...sampleData.decisionRecommendations,
      ...data?.decisionRecommendations
    }
  };
  const reportType =
    REPORT_TYPES.find((item) => item.id === report.reportTypeId) ?? REPORT_TYPES[0];

  return (
    <main className="dr-report-page">
      <article className="dr-report">
        <header className="dr-report-header">
          <div>
            <p className="dr-report-brand">Drivable by Mechanic&apos;s Eye</p>
            <h1>{reportType.label}</h1>
            <p className="dr-report-vehicle">{report.vehicle}</p>
          </div>
          <div className="dr-report-meta">
            <span className="dr-report-status">Sample Preview</span>
            <dl>
              <div><dt>Report type</dt><dd>{reportType.label}</dd></div>
              <div><dt>Submitted</dt><dd>{report.submittedDate}</dd></div>
            </dl>
          </div>
        </header>

        <section className="dr-report-section dr-report-summary">
          <p className="dr-report-kicker">Plain-English Summary</p>
          <h2>What the information may mean</h2>
          <p>{report.summary}</p>
        </section>

        <section className="dr-report-section">
          <h2>Vehicle Situation</h2>
          <dl className="dr-report-facts">
            <div><dt>Scenario</dt><dd>{report.scenario}</dd></div>
            <div><dt>Report type</dt><dd>{reportType.label}</dd></div>
            <div><dt>Customer goal</dt><dd>{report.customerGoal}</dd></div>
          </dl>
        </section>

        <section className="dr-report-section">
          <h2>Possible Causes</h2>
          <p className="dr-report-section-copy">
            These are possible paths based on the information provided, not confirmed diagnoses.
          </p>
          <div className="dr-cause-grid">
            {report.possibleCauses.map((cause) => (
              <div className="dr-cause-card" key={cause.title}>
                <h3>{cause.title}</h3>
                <span className={`dr-confidence dr-confidence-${cause.confidence}`}>
                  {confidenceLabels[cause.confidence]}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="dr-report-two-column">
          <ReportList title="Supporting Evidence" items={report.supportingEvidence} tone="evidence" />
          <ReportList title="Missing Information" items={report.missingInformation} tone="missing" />
        </div>

        <section className="dr-report-section dr-report-safety">
          <div>
            <p className="dr-report-kicker">Urgency / Safety Rating</p>
            <h2>{report.urgencyLabel}</h2>
          </div>
          <p>{report.urgencyCopy}</p>
        </section>

        <section className="dr-report-section">
          <h2>Decision Paths</h2>
          <div className="dr-decision-grid">
            {DECISION_PATHS.map((path) => (
              <div className="dr-decision-card" key={path.id}>
                <h3>{path.label}</h3>
                <p>{report.decisionRecommendations[path.id]}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="dr-report-section dr-report-script">
          <p className="dr-report-kicker">Mechanic Script</p>
          <h2>What to tell the shop</h2>
          <blockquote>{report.mechanicScript}</blockquote>
        </section>

        <ReportList title="Next Questions" items={report.nextQuestions} />

        <footer className="dr-report-notice">
          <h2>Safety / Limitation Notice</h2>
          <p>
            Drivable provides informational, confidence-rated guidance based on the information
            provided. This is not a certified diagnosis, inspection, safety clearance, title
            verification, or repair guarantee. Major safety, title, structural, or high-cost
            decisions may require in-person inspection.
          </p>
        </footer>
      </article>
    </main>
  );
}
