const PROCESS_STEPS = [
  {
    title: "We review what you sent",
    text: "We organize your symptoms, vehicle details, codes, notes, and any uploaded photos as case context. Photos are not visually analyzed."
  },
  {
    title: "We check what is missing",
    text: "If the information is not enough, we ask for specific photos, videos, codes, or details."
  },
  {
    title: "We organize the likely options",
    text: "We separate possible causes, risk level, confidence, and repair/sell/buy/walk-away paths."
  },
  {
    title: "You get a clear next move",
    text: "You may receive a report, a request for more information, or a recommendation for in-person inspection."
  }
] as const;

export function WhatHappensNext() {
  return (
    <section className="whn-section" aria-labelledby="what-happens-next-title">
      <header className="whn-header">
        <p className="whn-eyebrow">A clear process</p>
        <h2 id="what-happens-next-title">What happens next?</h2>
      </header>

      <ol className="whn-grid">
        {PROCESS_STEPS.map((step, index) => (
          <li className="whn-step" key={step.title}>
            <span className="whn-number" aria-hidden="true">{index + 1}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="whn-note">
        High-risk safety, title, structural, or high-cost repair decisions may require human
        review or in-person inspection.
      </p>
    </section>
  );
}
