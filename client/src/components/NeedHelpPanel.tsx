import {
  REPORT_TYPES,
  type IntakeScenario,
  type ReportTypeId
} from "../../../shared/drivableDecisionEngine";

type NeedHelpPanelProps = {
  topic?: string;
  compact?: boolean;
};

const reportDescriptions: Record<ReportTypeId, string> = {
  first_look_report: "Quick read on what may be wrong and what to check next.",
  full_decision_report: "Deeper repair, sell, DIY, or wait decision guidance.",
  human_review_add_on: "Extra review before higher-risk repair, safety, or buying decisions.",
  buyer_remote_risk_review: "Review a vehicle before chasing it, inspecting it, or buying it.",
  seller_as_is_listing_pack: "Turn known issues into a clearer, more honest listing."
};

const vehicleSituations: readonly {
  id: IntakeScenario;
  label: string;
  description: string;
}[] = [
  {
    id: "current_problem",
    label: "Current problem",
    description: "My vehicle is acting up and I need to know what may be wrong."
  },
  {
    id: "buying_vehicle",
    label: "Buying a vehicle",
    description: "I want help spotting red flags before I chase, inspect, or buy it."
  },
  {
    id: "selling_vehicle",
    label: "Selling a vehicle",
    description: "I want to understand and explain the vehicle honestly before listing it."
  },
  {
    id: "ownership_health_check",
    label: "Ownership health check",
    description: "I want to know whether my vehicle seems worth keeping, fixing, or watching."
  },
  {
    id: "sitting_vehicle",
    label: "Sitting/dead vehicle",
    description: "I have a vehicle sitting and need to decide whether to revive, sell, or walk away."
  }
];

const guidedInputs = [
  ["Symptoms", "What you feel, hear, smell, see, or notice while driving or starting the vehicle."],
  ["Photos", "Dash lights, leaks, tire wear, fluids, damaged areas, engine bay, or seller-provided pictures."],
  ["Video", "Cold start, idle, revving, driving issue, walkaround, under-hood view, or seller walkaround."],
  ["Audio", "Knocking, ticking, grinding, squealing, humming, misfires, exhaust noise, or startup sound."],
  ["Vibration", "When it happens, where you feel it, speed range, braking, turning, idle, or acceleration."],
  ["Scan codes", "Any OBD-II codes, freeze-frame data, warning lights, or scanner screenshots."],
  ["History", "Mileage, recent repairs, maintenance records, and how long the issue has been happening."],
  ["Goal", "Whether you want to fix, DIY, sell, buy, wait, or walk away."]
] as const;

export function NeedHelpPanel({ topic, compact = false }: NeedHelpPanelProps) {
  const params = new URLSearchParams();

  if (topic) {
    params.set("topic", topic);
  }

  const href = `/help${params.size ? `?${params.toString()}` : ""}`;

  function getReportHref(reportType: ReportTypeId) {
    const reportParams = new URLSearchParams(params);
    reportParams.set("reportType", reportType);
    return `/help?${reportParams.toString()}`;
  }

  function getSituationHref(scenario: IntakeScenario) {
    const situationParams = new URLSearchParams(params);
    situationParams.set("scenario", scenario);
    return `/help?${situationParams.toString()}`;
  }

  return (
    <section className={compact ? "support-panel support-panel-compact" : "support-panel"}>
      <div className="support-panel-heading">
        <div className="support-kicker">AI-assisted Drivable Guides</div>
        <h2>Need help?</h2>
        <p>You do not have to figure this out alone. Tell us where you are stuck and a Drivable Guide will help route you.</p>
        <a className="support-link" href={href}>Ask a Drivable Guide</a>
      </div>
      <div className="support-report-section">
        <div className="support-situation-section">
          <h3>What are you trying to figure out?</h3>
          <div className="support-situation-grid">
            {vehicleSituations.map((situation) => (
              <a className="support-report-option" href={getSituationHref(situation.id)} key={situation.id}>
                <strong>{situation.label}</strong>
                <span>{situation.description}</span>
              </a>
            ))}
          </div>
          <p className="support-situation-note">
            Drivable starts with your situation, then guides the questions, media, and decision path around that goal.
          </p>
        </div>
        <div className="support-input-section">
          <h3>What Drivable needs from you</h3>
          <p className="support-input-intro">
            You do not need to know car terms. Drivable guides the information we need so the report can be more useful.
          </p>
          <div className="support-input-grid">
            {guidedInputs.map(([label, description]) => (
              <div className="support-input-item" key={label}>
                <strong>{label}</strong>
                <span>{description}</span>
              </div>
            ))}
          </div>
          <p className="support-confidence-note">
            More complete inputs usually mean better confidence. Missing information should lower confidence, not create fake certainty.
          </p>
        </div>
        <h3>Choose the kind of help you need</h3>
        <div className="support-report-grid">
          {REPORT_TYPES.map((report) => (
            <a className="support-report-option" href={getReportHref(report.id)} key={report.id}>
              <strong>{report.label}</strong>
              <span>{reportDescriptions[report.id]}</span>
            </a>
          ))}
        </div>
        <p className="support-safety-note">
          Drivable helps you understand risk and next steps from the information provided. Major safety, title, or repair decisions may still require in-person inspection.
        </p>
      </div>
    </section>
  );
}
