import {
  DECISION_PATHS,
  REPORT_TYPES
} from "../../../shared/drivableDecisionEngine";
import {
  SAMPLE_DRIVABLE_REPORT,
  type DrivableReport
} from "../../../shared/drivableReportTypes";

type DrivableReportPreviewProps = {
  report?: DrivableReport;
};

const confidenceLabels: Record<DrivableReport["possibleCauses"][number]["confidence"], string> = {
  low: "Low confidence",
  moderate: "Moderate confidence",
  high: "High confidence",
  insufficient_information: "Insufficient information"
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

export function DrivableReportPreview({
  report = SAMPLE_DRIVABLE_REPORT
}: DrivableReportPreviewProps) {
  const reportType =
    REPORT_TYPES.find((item) => item.id === report.reportType) ?? REPORT_TYPES[0];
  const vehicleLabel = [
    report.vehicle.year,
    report.vehicle.make,
    report.vehicle.model,
    report.vehicle.trim
  ].filter(Boolean).join(" ");
  const submittedDate = new Date(report.submittedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  return (
    <main className="dr-report-page">
      <article className="dr-report">
        <header className="dr-report-header">
          <div>
            <p className="dr-report-brand">Drivable by Mechanic&apos;s Eye</p>
            <h1>{reportType.label}</h1>
            <p className="dr-report-vehicle">
              {vehicleLabel}{report.vehicle.mileage ? `, ${report.vehicle.mileage}` : ""}
            </p>
          </div>
          <div className="dr-report-meta">
            <span className="dr-report-status">Sample Preview</span>
            <dl>
              <div><dt>Report type</dt><dd>{reportType.label}</dd></div>
              <div><dt>Submitted</dt><dd>{submittedDate}</dd></div>
            </dl>
          </div>
        </header>

        <section className="dr-report-section dr-report-summary">
          <p className="dr-report-kicker">Plain-English Summary</p>
          <h2>What the information may mean</h2>
          <p>{report.plainEnglishSummary}</p>
        </section>

        <section className="dr-report-section">
          <h2>Vehicle Situation</h2>
          <dl className="dr-report-facts">
            <div><dt>Scenario</dt><dd>{report.scenario.replaceAll("_", " ")}</dd></div>
            <div><dt>Report type</dt><dd>{reportType.label}</dd></div>
            <div><dt>Customer goal</dt><dd>{report.customer.goal}</dd></div>
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
          <ReportList
            title="Supporting Evidence"
            items={report.supportingEvidence.map((item) => item.label)}
            tone="evidence"
          />
          <ReportList
            title="Missing Information"
            items={report.missingInformation.map((item) => item.label)}
            tone="missing"
          />
        </div>

        <section className="dr-report-section dr-report-safety">
          <div>
            <p className="dr-report-kicker">Urgency / Safety Rating</p>
            <h2>{report.urgencySafetyRating.headline}</h2>
          </div>
          <p>{report.urgencySafetyRating.guidance}</p>
        </section>

        <section className="dr-report-section">
          <h2>Decision Paths</h2>
          <div className="dr-decision-grid">
            {DECISION_PATHS.map((path) => (
              <div className="dr-decision-card" key={path.id}>
                <h3>{path.label}</h3>
                <p>
                  {report.decisionPaths.find((item) => item.pathId === path.id)?.recommendation
                    ?? "This path is not evaluated in the current report."}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="dr-report-section dr-report-script">
          <p className="dr-report-kicker">Mechanic Script</p>
          <h2>{report.mechanicScript.title}</h2>
          <blockquote>{report.mechanicScript.script}</blockquote>
        </section>

        <ReportList title="Next Questions" items={report.nextQuestions} />

        <footer className="dr-report-notice">
          <h2>Safety / Limitation Notice</h2>
          <p>
            {report.safetyNotice.limitation} {report.safetyNotice.guidance}
          </p>
        </footer>
      </article>
    </main>
  );
}
