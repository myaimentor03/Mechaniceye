import { NextActionStrip } from "./NextActionStrip";
import { StatusLegend } from "./StatusLegend";

type PreviewLabel =
  | "Customer-facing sample"
  | "Internal-only"
  | "Future/preview"
  | "Safety-critical";

type PreviewLink = {
  title: string;
  href: string;
  description: string;
  labels: readonly PreviewLabel[];
};

type PreviewGroup = {
  title: string;
  description: string;
  links: readonly PreviewLink[];
};

const PREVIEW_GROUPS: readonly PreviewGroup[] = [
  {
    title: "Customer Start / Intake",
    description: "Entry points and evidence requests a customer may see.",
    links: [
      {
        title: "Start chooser",
        href: "/start",
        description: "The ABC-easy starting point for choosing a vehicle situation.",
        labels: ["Customer-facing sample"]
      },
      {
        title: "Decision path preview",
        href: "/decision-path-preview",
        description: "Plain-English routes from the customer's question to the next useful action.",
        labels: ["Customer-facing sample", "Future/preview"]
      },
      {
        title: "Repair vs. sell preview",
        href: "/repair-vs-sell-preview",
        description: "A practical comparison of repair, pause, sell, and gather-more-info paths.",
        labels: ["Customer-facing sample", "Future/preview"]
      },
      {
        title: "Buyer risk preview",
        href: "/buyer-risk-preview",
        description: "A sample remote review of seller claims, evidence, and walk-away risks.",
        labels: ["Customer-facing sample", "Future/preview"]
      },
      {
        title: "Help / concierge",
        href: "/help",
        description: "Guided support request with selected Drivable context.",
        labels: ["Customer-facing sample", "Future/preview"]
      },
      {
        title: "Evidence checklist",
        href: "/evidence-checklist",
        description: "Safe, practical photos, videos, codes, and details to gather.",
        labels: ["Customer-facing sample"]
      },
      {
        title: "Missing info request",
        href: "/missing-info-preview",
        description: "Customer request for stronger evidence before a useful recommendation.",
        labels: ["Customer-facing sample", "Future/preview"]
      }
    ]
  },
  {
    title: "Reports / Guidance",
    description: "Sample guidance and report deliverables.",
    links: [
      {
        title: "Report preview",
        href: "/report-preview",
        description: "Structured possible causes, confidence, safety, and decision paths.",
        labels: ["Customer-facing sample", "Future/preview"]
      },
      {
        title: "Report email preview",
        href: "/report-email-preview",
        description: "Customer-safe email presentation of a sample report.",
        labels: ["Customer-facing sample", "Future/preview"]
      },
      {
        title: "Roadside preview",
        href: "/roadside-preview",
        description: "Stop, move cautiously, tow, safe-check, and repair-path guidance.",
        labels: ["Customer-facing sample", "Safety-critical"]
      },
      {
        title: "Roadside severity guide",
        href: "/roadside-severity-guide",
        description: "A clear low-to-critical risk guide with stop-now warning signals.",
        labels: ["Customer-facing sample", "Safety-critical"]
      },
      {
        title: "Report packages",
        href: "/report-packages",
        description: "Planning previews for First Look, Full Decision, buyer, seller, and review offers.",
        labels: ["Customer-facing sample", "Future/preview"]
      }
    ]
  },
  {
    title: "Internal Review / Safety",
    description: "Human review controls that must stay separate from customer delivery.",
    links: [
      {
        title: "Internal review preview",
        href: "/internal-review-preview",
        description: "Full internal case packet with evidence, risk, and readiness.",
        labels: ["Internal-only", "Safety-critical"]
      },
      {
        title: "Review action preview",
        href: "/review-action-preview",
        description: "Sample reviewer choices and the next system action for each choice.",
        labels: ["Internal-only", "Future/preview"]
      },
      {
        title: "Send safety gate",
        href: "/send-safety-preview",
        description: "Read-only status rules showing when customer delivery is blocked or allowed.",
        labels: ["Internal-only", "Safety-critical"]
      }
    ]
  },
  {
    title: "Data / Learning",
    description: "Follow-up previews connecting recommendations to real outcomes.",
    links: [
      {
        title: "Outcome capture preview",
        href: "/outcome-capture-preview",
        description: "Sample follow-up record of action, cause, repair, cost, and usefulness.",
        labels: ["Internal-only", "Future/preview"]
      },
      {
        title: "Learning loop preview",
        href: "/learning-loop-preview",
        description: "The connected path from intake and evidence to reviewed real-world outcomes.",
        labels: ["Internal-only", "Future/preview"]
      }
    ]
  }
] as const;

const DEMO_PATH = [
  { label: "Start at the chooser", href: "/start" },
  { label: "Review the customer decision paths", href: "/decision-path-preview" },
  { label: "Choose roadside guidance", href: "/roadside-preview" },
  { label: "Check the roadside severity guide", href: "/roadside-severity-guide" },
  { label: "Request more evidence if needed", href: "/missing-info-preview" },
  { label: "Open the customer report", href: "/report-preview" },
  { label: "Check the send safety gate", href: "/send-safety-preview" },
  { label: "Capture the outcome and learning", href: "/learning-loop-preview" }
] as const;

function labelClass(label: PreviewLabel) {
  return `dph-label dph-label-${label.toLowerCase().replaceAll("/", "-").replaceAll(" ", "-")}`;
}

export function DrivablePreviewHub() {
  return (
    <main className="dph-page">
      <section className="dph-shell">
        <header className="dph-hero">
          <div>
            <p className="dph-eyebrow">Drivable Internal Preview Hub</p>
            <h1>Open every product preview from one place.</h1>
            <p>
              Use this internal sitemap to check the customer journey, report surfaces, safety
              controls, and learning loop without remembering route names.
            </p>
          </div>
          <span className="dph-internal-badge">Internal only</span>
        </header>

        <section className="dph-demo" aria-labelledby="recommended-demo-path">
          <div>
            <p className="dph-eyebrow">Recommended demo path</p>
            <h2 id="recommended-demo-path">Walk through the roadside-to-outcome story</h2>
          </div>
          <ol>
            {DEMO_PATH.map((step, index) => (
              <li key={`${step.href}-${index}`}>
                <span aria-hidden="true">{index + 1}</span>
                <a href={step.href}>{step.label}</a>
              </li>
            ))}
          </ol>
        </section>

        <div className="dph-groups">
          {PREVIEW_GROUPS.map((group) => (
            <section className="dph-group" key={group.title}>
              <header>
                <h2>{group.title}</h2>
                <p>{group.description}</p>
              </header>
              <div className="dph-grid">
                {group.links.map((link) => (
                  <article className="dph-card" key={link.href}>
                    <div className="dph-labels">
                      {link.labels.map((label) => (
                        <span className={labelClass(label)} key={label}>{label}</span>
                      ))}
                    </div>
                    <h3>{link.title}</h3>
                    <p>{link.description}</p>
                    <code className="dph-route">{link.href}</code>
                    <a className="dph-open" href={link.href}>Open preview</a>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <StatusLegend />

        <aside className="dph-operations">
          <strong>Make / Operations</strong>
          <p>
            Make/router testing is tracked in docs/automation. This page is frontend preview
            navigation only.
          </p>
        </aside>

        <NextActionStrip
          primaryLabel="Start recommended demo"
          primaryHref="/start"
          secondaryLabel="Open internal review"
          secondaryHref="/internal-review-preview"
          note="Use the hub cards above for the complete preview sitemap."
        />
      </section>
    </main>
  );
}
