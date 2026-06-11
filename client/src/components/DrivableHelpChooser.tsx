import { WhatHappensNext } from "./WhatHappensNext";

const HELP_CHOICES = [
  {
    title: "Can I keep driving this?",
    subtitle: "Something feels wrong and you need a risk check.",
    href: "/help?scenario=current_problem&topic=drivability"
  },
  {
    title: "Should I fix it or sell it?",
    subtitle: "Understand whether repair money still makes sense.",
    href: "/help?scenario=current_problem&topic=repair-vs-sell"
  },
  {
    title: "I'm thinking about buying this vehicle",
    subtitle: "Get a remote risk review before chasing it.",
    href: "/report-preview?scenario=buying_vehicle&reportType=buyer_remote_risk_review"
  },
  {
    title: "I want to sell a vehicle as-is",
    subtitle: "Prepare a clearer listing with known issues explained.",
    href: "/marketplace/sell/intake"
  },
  {
    title: "I already submitted something",
    subtitle: "Ask for help with an existing case or listing.",
    href: "/help?topic=existing-case"
  }
] as const;

export function DrivableHelpChooser() {
  return (
    <main className="dhc-page">
      <section className="dhc-shell">
        <header className="dhc-header">
          <p className="dhc-eyebrow">Start here</p>
          <h1>What do you need help deciding?</h1>
          <p>Choose the option that sounds closest. You do not need to know car terms.</p>
        </header>

        <div className="dhc-grid">
          {HELP_CHOICES.map((choice) => (
            <article className="dhc-card" key={choice.title}>
              <div>
                <h2>{choice.title}</h2>
                <p>{choice.subtitle}</p>
              </div>
              <a className="dhc-action" href={choice.href}>Start here</a>
            </article>
          ))}
        </div>

        <aside className="dhc-safety">
          <strong>Stop if the vehicle may be unsafe.</strong>
          <p>
            If you have brake failure, steering loss, overheating, smoke, fuel leak, severe
            electrical issues, or a wheel/tire problem, do not keep driving just to gather evidence.
          </p>
        </aside>

        <WhatHappensNext />
      </section>
    </main>
  );
}
