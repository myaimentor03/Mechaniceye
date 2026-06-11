import { NextActionStrip } from "./NextActionStrip";

const DECISION_PATHS = [
  {
    title: "Stop now / do not drive",
    when: "Brake failure, steering loss, overheating, smoke, fuel leak, severe shaking, oil-pressure warning, or wheel/tire failure.",
    guidance: "The safest next move may be to stop driving and seek in-person help.",
    boundary: "Drivable cannot certify that a vehicle is safe.",
    tone: "critical"
  },
  {
    title: "Drive only to a safer nearby place",
    when: "Symptoms are concerning but not clearly critical, and the driver needs to move out of danger.",
    guidance: "Move only if brakes, steering, and control feel normal. Avoid highways and stop if symptoms worsen.",
    boundary: "This is not a clearance to keep driving normally.",
    tone: "high"
  },
  {
    title: "Call tow",
    when: "High-risk symptoms, no safe movement, or a worsening condition.",
    guidance: "A tow may be safer than risking more damage or a roadside failure.",
    boundary: "Drivable does not dispatch towing or replace in-person judgment.",
    tone: "high"
  },
  {
    title: "Try a basic safe check",
    when: "The customer can safely view dash lights, leaks, tires, visible damage, codes, or symptoms without driving, crawling under, or touching hot parts.",
    guidance: "Only check what is safe from outside the vehicle or while parked.",
    boundary: "Basic checks do not prove the vehicle is safe.",
    tone: "low"
  },
  {
    title: "Request more info",
    when: "There is not enough evidence for a confidence-rated answer.",
    guidance: "Drivable may ask for photos, videos, codes, or symptom details before giving a useful next move.",
    boundary: "Missing information can lower confidence.",
    tone: "moderate"
  },
  {
    title: "Repair professionally",
    when: "Safety, complexity, high cost, or diagnostic uncertainty is too high.",
    guidance: "A shop should inspect and confirm the issue before parts are replaced.",
    boundary: "Drivable does not guarantee a repair result or cost.",
    tone: "moderate"
  },
  {
    title: "DIY only if appropriate",
    when: "The issue is low-risk, simple, non-safety-related, and the customer has the right tools and skill.",
    guidance: "DIY may make sense only when the risk is low and the steps are clear.",
    boundary: "Drivable should not push unsafe repairs.",
    tone: "low"
  },
  {
    title: "Sell/list as-is",
    when: "Repair cost may not make sense or the customer wants to disclose issues clearly.",
    guidance: "Drivable can help organize known issues and disclosure-friendly listing information.",
    boundary: "Drivable does not guarantee sale price, buyer interest, title outcome, or legal compliance.",
    tone: "moderate"
  },
  {
    title: "Buy / walk away decision",
    when: "A remote or used-car buyer is deciding whether to inspect, chase, negotiate, or walk away.",
    guidance: "Drivable can flag risk signals and suggest what to ask before spending time or money.",
    boundary: "This is not a substitute for an in-person inspection.",
    tone: "moderate"
  }
] as const;

export function CustomerDecisionPathPreview() {
  return (
    <main className="cgd-page">
      <section className="cgd-shell">
        <header className="cgd-hero">
          <p className="cgd-eyebrow">Plain-English customer guide</p>
          <h1>Drivable Decision Paths</h1>
          <p>
            Drivable helps turn confusing vehicle symptoms and goals into clearer next steps.
          </p>
        </header>

        <div className="cgd-path-grid">
          {DECISION_PATHS.map((path, index) => (
            <article className={`cgd-path-card cgd-tone-${path.tone}`} key={path.title}>
              <div className="cgd-path-heading">
                <span aria-hidden="true">{index + 1}</span>
                <h2>{path.title}</h2>
              </div>
              <dl>
                <div>
                  <dt>When this might apply</dt>
                  <dd>{path.when}</dd>
                </div>
                <div>
                  <dt>Plain-English guidance</dt>
                  <dd>{path.guidance}</dd>
                </div>
                <div>
                  <dt>Cannot guarantee</dt>
                  <dd>{path.boundary}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        <aside className="cgd-warning">
          <strong>Do not use Drivable as a safety clearance.</strong>
          <p>
            Critical brake, steering, tire/wheel, overheating, fuel leak, smoke, or severe
            electrical symptoms may require stopping and seeking in-person help.
          </p>
        </aside>

        <NextActionStrip
          primaryLabel="Choose my situation"
          primaryHref="/start"
          additionalLinks={[
            { label: "Roadside risk levels", href: "/roadside-severity-guide" },
            { label: "Repair vs sell", href: "/repair-vs-sell-preview" }
          ]}
          note="Choose the path closest to the decision in front of you."
        />
      </section>
    </main>
  );
}
