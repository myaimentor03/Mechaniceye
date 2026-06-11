import {
  DECISION_PATHS,
  REPORT_TYPES,
  type ConfidenceLevel
} from "../../../shared/drivableDecisionEngine";
import {
  type DrivableReport
} from "../../../shared/drivableReportTypes";
import {
  SAMPLE_GENERATED_DRIVABLE_REPORT
} from "../../../shared/mockDrivableReportGenerator";

type DrivableReportEmailPreviewProps = {
  report?: DrivableReport;
};

const confidenceLabels: Record<ConfidenceLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  insufficient_information: "Insufficient information"
};

const riskLabels = {
  low: "Low",
  medium: "Needs attention",
  high: "High - in-person inspection recommended",
  critical: "Critical - stop use and seek immediate help",
  unknown: "Unknown from current information"
} as const;

function strongestConfidence(report: DrivableReport): ConfidenceLevel {
  if (report.possibleCauses.some((cause) => cause.confidence === "high")) return "high";
  if (report.possibleCauses.some((cause) => cause.confidence === "moderate")) return "moderate";
  if (report.possibleCauses.some((cause) => cause.confidence === "low")) return "low";
  return "insufficient_information";
}

export function DrivableReportEmailPreview({
  report = SAMPLE_GENERATED_DRIVABLE_REPORT
}: DrivableReportEmailPreviewProps) {
  const reportType =
    REPORT_TYPES.find((item) => item.id === report.reportType) ?? REPORT_TYPES[0];
  const vehicleName = [
    report.vehicle.year,
    report.vehicle.make,
    report.vehicle.model,
    report.vehicle.trim
  ].filter(Boolean).join(" ");
  const confidence = strongestConfidence(report);

  return (
    <main className="dre-page">
      <div className="dre-preview-label">Customer email preview - sample only</div>
      <article className="dre-email">
        <header className="dre-subject-strip">
          <span>Subject</span>
          <strong>Your Drivable {reportType.label}: {vehicleName}</strong>
        </header>

        <div className="dre-email-body">
          <div className="dre-email-brand">
            <span>Drivable</span>
            <small>by Mechanic&apos;s Eye</small>
          </div>

          <p className="dre-greeting">Hi {report.customer.name},</p>

          <section className="dre-summary">
            <p className="dre-kicker">Your {reportType.label}</p>
            <h1>Here is the clearest next-step picture from what you provided.</h1>
            <p>{report.plainEnglishSummary}</p>
          </section>

          <section className="dre-section">
            <h2>Key findings</h2>
            <div className="dre-finding-summary">
              <div>
                <span>Overall confidence</span>
                <strong>{confidenceLabels[confidence]}</strong>
              </div>
              <div>
                <span>Urgency / safety</span>
                <strong>{riskLabels[report.urgencySafetyRating.level]}</strong>
              </div>
            </div>
            <div className="dre-cause-list">
              {report.possibleCauses.map((cause) => (
                <div key={cause.id}>
                  <div>
                    <h3>{cause.title}</h3>
                    <span>{confidenceLabels[cause.confidence]} confidence</span>
                  </div>
                  <p>{cause.explanation}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="dre-section dre-next-info">
            <h2>What we need next</h2>
            <p>These items would help improve confidence before a high-cost or safety-related decision:</p>
            <ul>
              {report.missingInformation.map((item) => (
                <li key={item.id}>
                  <strong>{item.label}</strong>
                  <span>{item.reason}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="dre-section">
            <h2>Your decision options</h2>
            <div className="dre-option-list">
              {DECISION_PATHS.map((path) => {
                const recommendation =
                  report.decisionPaths.find((item) => item.pathId === path.id);
                return (
                  <div key={path.id}>
                    <h3>{path.label}</h3>
                    <p>
                      {recommendation?.recommendation
                        ?? "This option needs more information before it can be evaluated."}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="dre-section dre-script">
            <p className="dre-kicker">Mechanic script</p>
            <h2>Copy this when you contact a shop</h2>
            <blockquote>{report.mechanicScript.script}</blockquote>
          </section>

          <section className="dre-section dre-safety">
            <h2>Important safety and limitation notice</h2>
            <p>
              Drivable provides informational, confidence-rated guidance based on the information
              provided. This is not a certified diagnosis, inspection, safety clearance, title
              verification, or repair guarantee.
            </p>
            <p>{report.safetyNotice.guidance}</p>
          </section>

          <section className="dre-cta">
            <h2>Ready to improve this report?</h2>
            <p>
              Reply with the missing information above or request human review before making a
              high-cost or safety-related decision.
            </p>
          </section>

          <footer className="dre-footer">
            <strong>Drivable by Mechanic&apos;s Eye</strong>
            <span>Clear information for the decision in front of you.</span>
          </footer>
        </div>
      </article>
    </main>
  );
}
