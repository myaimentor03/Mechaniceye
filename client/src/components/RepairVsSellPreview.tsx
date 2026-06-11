import { NextActionStrip } from "./NextActionStrip";

const REVIEW_INPUTS = [
  "Vehicle age and mileage",
  "Symptoms",
  "Warning lights",
  "Repair history",
  "Known issues",
  "Customer goal",
  "Estimated risk level",
  "Missing evidence",
  "Whether the vehicle is still useful to the customer"
] as const;

const QUESTIONS = [
  "Does the vehicle run and drive?",
  "What is the mileage?",
  "How much have you already spent?",
  "What is the vehicle worth repaired versus as-is?",
  "Is the issue safety-related?",
  "Are parts and labor likely to exceed value?",
  "Are you trying to keep it, sell it, or just get home?"
] as const;

const PATHS = [
  {
    title: "Repair path",
    copy: "When repair still makes sense, Drivable helps organize likely causes, next checks, and what to ask the shop."
  },
  {
    title: "Sell/list as-is path",
    copy: "When repair may not make financial sense, Drivable helps summarize the issue honestly for an as-is listing."
  },
  {
    title: "Wait/monitor path",
    copy: "When risk appears lower, Drivable may suggest watching symptoms and gathering more evidence."
  },
  {
    title: "Stop-spending / walk-away path",
    copy: "When cost and risk stack up, the best decision may be to stop chasing repairs."
  }
] as const;

export function RepairVsSellPreview() {
  return (
    <main className="rvs-page">
      <section className="rvs-shell">
        <header className="rvs-hero">
          <p className="rvs-eyebrow">Drivable repair decision</p>
          <h1>Is this vehicle worth fixing, or is it time to sell/list it as-is?</h1>
          <p>
            Compare the vehicle, evidence, risk, cost, and your real goal before spending more.
          </p>
        </header>

        <section className="rvs-section">
          <h2>What Drivable looks at</h2>
          <ul className="rvs-chip-list">
            {REVIEW_INPUTS.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>

        <div className="rvs-path-grid">
          {PATHS.map((path) => (
            <article key={path.title}>
              <h2>{path.title}</h2>
              <p>{path.copy}</p>
            </article>
          ))}
        </div>

        <section className="rvs-section">
          <h2>Questions Drivable asks</h2>
          <ol className="rvs-question-list">
            {QUESTIONS.map((question) => <li key={question}>{question}</li>)}
          </ol>
        </section>

        <aside className="rvs-warning">
          Drivable does not guarantee sale price, repair result, buyer interest, legal/title
          outcome, or vehicle condition.
        </aside>

        <NextActionStrip
          primaryLabel="Start with my situation"
          primaryHref="/start"
          additionalLinks={[
            { label: "See decision paths", href: "/decision-path-preview" },
            { label: "Compare report options", href: "/report-packages" }
          ]}
          note="Use the path that matches what you are trying to decide, not just the latest estimate."
        />
      </section>
    </main>
  );
}
