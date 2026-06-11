import { NextActionStrip } from "./NextActionStrip";

const PACKAGES = [
  {
    name: "First Look Report",
    price: "$19-$29",
    forWhom: "Owners, buyers, or sitting-vehicle users who need a lower-cost starting point.",
    includes: "Possible causes, evidence gaps, confidence, safety flags, and the next useful checks.",
    boundary: "Not a confirmed diagnosis, repair approval, or safety certification.",
    action: "Choose First Look"
  },
  {
    name: "Full Decision Report",
    price: "$49-$79",
    forWhom: "People comparing professional repair, DIY, selling, waiting, or walking away.",
    includes: "Deeper cause paths, evidence analysis, decision options, mechanic script, and buyer or seller guidance.",
    boundary: "Does not guarantee the cause, repair result, condition, or financial outcome.",
    action: "Choose Full Report"
  },
  {
    name: "Human Review Add-On",
    price: "$49-$99 add-on",
    forWhom: "Higher-risk safety, repair, buying, or selling decisions that need another layer of review.",
    includes: "Human review of evidence, AI draft, contradictions, confidence, and customer-ready wording.",
    boundary: "Does not certify the vehicle or replace hands-on inspection and testing.",
    action: "Request Human Review"
  },
  {
    name: "Buyer Remote Risk Review",
    price: "$29-$59",
    forWhom: "Buyers deciding whether a private-party or remote vehicle is worth pursuing.",
    includes: "Seller-claim review, missing evidence, red flags, questions, and pursue or walk-away guidance.",
    boundary: "Not a pre-purchase inspection and does not verify title, ownership, mileage, or seller claims.",
    action: "Review Before Buying"
  },
  {
    name: "Seller As-Is Listing Pack",
    price: "$39-$99",
    forWhom: "Private sellers who need to explain known issues and repairs more clearly.",
    includes: "Condition summary, issue organization, evidence checklist, disclosure prompts, and listing-ready language.",
    boundary: "Does not inspect, certify, own, sell, title, transport, finance, or guarantee the vehicle.",
    action: "Prepare My Listing"
  }
] as const;

export function ReportPackagePreview() {
  return (
    <main className="rpp-page">
      <section className="rpp-shell">
        <header className="rpp-header">
          <p className="rpp-eyebrow">Drivable report options</p>
          <h1>Choose the level of help that fits the decision.</h1>
          <p>
            Start with a quick first look or choose deeper guidance for repair, buying, selling, or
            a higher-risk decision.
          </p>
        </header>

        <div className="rpp-grid">
          {PACKAGES.map((item, index) => (
            <article className={`rpp-card${index < 2 ? " rpp-featured" : ""}`} key={item.name}>
              {index < 2 && <span className="rpp-launch-label">Early launch option</span>}
              <h2>{item.name}</h2>
              <p className="rpp-price">{item.price}</p>
              <dl>
                <div><dt>Who it is for</dt><dd>{item.forWhom}</dd></div>
                <div><dt>What it includes</dt><dd>{item.includes}</dd></div>
                <div><dt>What it does not guarantee</dt><dd>{item.boundary}</dd></div>
              </dl>
              <a href="/help?topic=report-package" className="rpp-action">{item.action}</a>
            </article>
          ))}
        </div>

        <aside className="rpp-warning">
          Prices are planning placeholders and may change. Drivable reports are informational and
          confidence-rated, not certified inspections or repair guarantees.
        </aside>

        <NextActionStrip
          primaryLabel="Start with my situation"
          primaryHref="/start"
          secondaryLabel="Ask about a report"
          secondaryHref="/help?topic=report-package"
          note="Not sure which report fits? Start with the decision you are trying to make."
        />
      </section>
    </main>
  );
}
