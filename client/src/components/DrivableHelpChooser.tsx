import { WhatHappensNext } from "./WhatHappensNext";

const HELP_CHOICES = [
  {
    title: "I'm stuck or not sure I can keep driving",
    subtitle: "Get a safety-first next move: stop, limp to a safer place, call a tow, or gather more info.",
    href: "/roadside-preview?mode=roadside_now",
    actionLabel: "Get roadside guidance",
    priority: true
  },
  {
    title: "Can I keep driving this?",
    subtitle: "Something feels wrong and you need a risk check.",
    href: "/help?scenario=current_problem&topic=drivability",
    actionLabel: "Start here",
    priority: false
  },
  {
    title: "Should I fix it or sell it?",
    subtitle: "Understand whether repair money still makes sense.",
    href: "/help?scenario=current_problem&topic=repair-vs-sell",
    actionLabel: "Compare options",
    priority: false
  },
  {
    title: "I'm thinking about buying this vehicle",
    subtitle: "Get a remote risk review before chasing it.",
    href: "/report-preview?scenario=buying_vehicle&reportType=buyer_remote_risk_review",
    actionLabel: "Review before buying",
    priority: false
  },
  {
    title: "I want to sell a vehicle as-is",
    subtitle: "Prepare a clearer listing with known issues explained.",
    href: "/marketplace/sell/intake",
    actionLabel: "Start seller intake",
    priority: false
  },
  {
    title: "I already submitted something",
    subtitle: "Ask for help with an existing case or listing.",
    href: "/help?topic=existing-case",
    actionLabel: "Get help",
    priority: false
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
            <article
              className={`dhc-card${choice.priority ? " dhc-card-priority" : ""}`}
              key={choice.title}
            >
              <div>
                {choice.priority && <span className="dhc-priority-label">Roadside / stuck driver</span>}
                <h2>{choice.title}</h2>
                <p>{choice.subtitle}</p>
              </div>
              <a className="dhc-action" href={choice.href}>{choice.actionLabel}</a>
            </article>
          ))}
        </div>

        <aside className="dhc-safety">
          <strong>Stop if the vehicle may be unsafe.</strong>
          <p>
            If brakes, steering, smoke, fire smell, fuel leak, overheating, wheel/tire failure, or
            severe electrical issues are involved, stop driving and seek in-person help.
          </p>
        </aside>

        <WhatHappensNext />
      </section>
    </main>
  );
}
