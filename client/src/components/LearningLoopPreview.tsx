import { NextActionStrip } from "./NextActionStrip";

const LEARNING_STEPS = [
  {
    title: "Customer submits issue",
    description: "The case starts with the vehicle, symptoms, timing, warning lights, and the decision the customer is trying to make."
  },
  {
    title: "Drivable captures evidence",
    description: "Useful photos, videos, scan information, repair history, and missing details are connected to the same case."
  },
  {
    title: "AI drafts possible paths",
    description: "The draft organizes possible causes, evidence gaps, confidence, and practical next moves without claiming a confirmed diagnosis."
  },
  {
    title: "Human/safety review checks risk",
    description: "A reviewer can correct the draft, escalate safety concerns, and require qualified in-person help when the evidence is not enough."
  },
  {
    title: "Customer gets next move",
    description: "The approved recommendation explains what to check, what to avoid, and which repair, monitor, sell, or walk-away path fits the evidence."
  },
  {
    title: "Customer reports what happened",
    description: "Follow-up records the action taken, the actual cause or repair when known, cost, and whether the guidance helped."
  },
  {
    title: "Outcome improves future guidance",
    description: "Reviewed outcomes can reveal which evidence and questions improve calibration, usefulness, and earlier safety escalation."
  }
] as const;

const SAMPLE_OUTCOME = [
  { label: "caseId", value: "DRV-2026-0148" },
  { label: "vehicle", value: "2014 Toyota Camry LE, 148,000 miles" },
  { label: "original symptoms", value: "Steering-wheel vibration while braking and an intermittent ABS light." },
  { label: "recommended action", value: "Limit driving, arrange a brake and front-end inspection, and retrieve ABS codes." },
  { label: "confidence", value: "Moderate" },
  { label: "customer action taken", value: "Parked the vehicle and scheduled an independent inspection." },
  { label: "actual cause found", value: "Front rotor variation and a damaged right-front wheel-speed sensor wire." },
  { label: "actual repair performed", value: "Front rotors replaced; sensor wiring repaired and verified." },
  { label: "actual cost", value: "$684 paid" },
  { label: "advice helped yes/no/unknown", value: "Yes" }
] as const;

export function LearningLoopPreview() {
  return (
    <main className="llp-page">
      <section className="llp-shell">
        <header className="llp-hero">
          <div>
            <p className="llp-eyebrow">Drivable Learning Loop</p>
            <h1>What happened next matters.</h1>
            <p className="llp-intro">
              This is how Drivable gets smarter: intake, evidence, AI draft, human review,
              recommendation, customer action, actual outcome, repair result, and feedback.
            </p>
          </div>
          <span className="llp-preview-badge">Sample-data preview</span>
        </header>

        <section className="llp-process" aria-labelledby="learning-loop-steps">
          <div className="llp-section-heading">
            <p className="llp-eyebrow">One connected case</p>
            <h2 id="learning-loop-steps">From first symptom to useful outcome</h2>
            <p>
              Each step keeps the original evidence, confidence, review decisions, and real-world
              result linked without rewriting history.
            </p>
          </div>

          <ol className="llp-timeline">
            {LEARNING_STEPS.map((step, index) => (
              <li className="llp-step" key={step.title}>
                <span className="llp-step-number" aria-hidden="true">{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="llp-outcome-card" aria-labelledby="sample-outcome-title">
          <div className="llp-outcome-header">
            <div>
              <p className="llp-eyebrow">Sample case outcome</p>
              <h2 id="sample-outcome-title">The follow-up record closes the loop</h2>
            </div>
            <span className="llp-status">Outcome confirmed</span>
          </div>

          <dl className="llp-outcome-grid">
            {SAMPLE_OUTCOME.map((field) => (
              <div className="llp-outcome-field" key={field.label}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>

          <aside className="llp-learning-note">
            <span>learning note</span>
            <p>
              Brake vibration alone supported several possible paths. The intermittent ABS light
              and confirmed sensor-wire damage show why code retrieval and warning-light evidence
              should stay prominent in similar cases. Keep confidence moderate until inspection.
            </p>
          </aside>
        </section>

        <aside className="llp-safety-note">
          <strong>Privacy and safety come first.</strong>
          <p>
            Outcome data should be used to improve guidance responsibly. Drivable should improve
            confidence-rated recommendations, not claim unsafe certainty.
          </p>
          <p>
            Customer-reported results, reviewer-confirmed findings, and repair-document evidence
            should remain clearly separated, permissioned, and protected.
          </p>
        </aside>

        <NextActionStrip
          primaryLabel="Start a Drivable check"
          primaryHref="/start"
          note="See how evidence and confidence-rated next steps begin, or review a sample report."
        />
      </section>
    </main>
  );
}
