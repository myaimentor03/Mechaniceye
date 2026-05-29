import { FormEvent } from "react";

type HeroProps = {
  eyebrow?: string;
  title: string;
  body: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

type Listing = {
  title: string;
  price: string;
  mileage: string;
  location: string;
  titleStatus: string;
  runsDrives: string;
  evidence: string;
};

const listings: Listing[] = [
  {
    title: "2012 Ford F-150 XLT",
    price: "$8,900 asking",
    mileage: "168,400 mi",
    location: "Bakersfield, CA",
    titleStatus: "Clean title",
    runsDrives: "Runs and drives",
    evidence: "Photos + repair notes",
  },
  {
    title: "2015 Toyota Camry LE",
    price: "$7,450 asking",
    mileage: "142,100 mi",
    location: "Fresno, CA",
    titleStatus: "Clean title",
    runsDrives: "Runs and drives",
    evidence: "Diagnostic notes",
  },
  {
    title: "2008 Chevrolet Silverado 1500",
    price: "$5,800 best offer",
    mileage: "211,900 mi",
    location: "Lancaster, CA",
    titleStatus: "Clean title",
    runsDrives: "Needs battery",
    evidence: "Known issues listed",
  },
];

const packages = [
  {
    title: "Basic Listing",
    price: "Flat listing fee",
    body: "A straightforward public listing with photos, condition notes, and seller contact flow.",
    features: ["Vehicle details", "Seller notes", "Known issues", "Buyer interest path"],
  },
  {
    title: "Featured Listing",
    price: "Featured listing fee",
    body: "Extra visibility for sellers who want their listing placed more prominently.",
    features: ["Featured placement", "Evidence badge", "Listing polish prompts", "Buyer checklist link"],
    highlighted: true,
  },
  {
    title: "Mechanic-Reviewed Listing",
    price: "Diagnostic/evidence package",
    body: "Mechanic's Eye can help organize diagnostic evidence without guaranteeing condition.",
    features: ["Evidence review", "Repair history structure", "Symptom notes", "No certification claim"],
  },
  {
    title: "Weekend Offer Event Entry",
    price: "Event entry fee",
    body: "Collect buyer interest during a Friday-Monday timed offer window.",
    features: ["Timed offer window", "Seller chooses next step", "Best offer language", "No sale guarantee"],
  },
];

function Hero({ eyebrow = "Mechanic's Eye Marketplace", title, body, primaryLabel, primaryHref, secondaryLabel, secondaryHref }: HeroProps) {
  return (
    <section className="mp-hero">
      <div>
        <div className="mp-eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{body}</p>
        {(primaryLabel || secondaryLabel) && (
          <div className="mp-actions">
            {primaryLabel && primaryHref && <a className="mp-btn mp-btn-primary" href={primaryHref}>{primaryLabel}</a>}
            {secondaryLabel && secondaryHref && <a className="mp-btn mp-btn-secondary" href={secondaryHref}>{secondaryLabel}</a>}
          </div>
        )}
      </div>
      <div className="mp-hero-panel">
        <div><strong>Seller-controlled listings</strong><span>You set the price, notes, timing, and terms.</span></div>
        <div><strong>Evidence helps buyers</strong><span>Photos, symptoms, repair history, and optional diagnostic context.</span></div>
        <div><strong>Peer-to-peer transaction</strong><span>Mechanic's Eye gives you tools. You handle the transaction.</span></div>
      </div>
    </section>
  );
}

function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? "mp-disclaimer mp-disclaimer-compact" : "mp-disclaimer"}>
      <h2>Marketplace disclaimer</h2>
      <p>
        Mechanic's Eye Marketplace is a peer-to-peer vehicle listing and software platform only.
        Mechanic's Eye does not own, sell, buy, title, transport, finance, inspect, certify, or
        guarantee vehicles. Sellers list their own vehicles. Buyers and sellers are responsible for
        title transfer, payment, pickup or shipping, taxes, registration, inspections, and legal requirements.
      </p>
    </section>
  );
}

function EvidenceBadge({ label, score }: { label: string; score?: string }) {
  return <span className="mp-evidence-badge"><span />{label}{score && <strong>{score}</strong>}</span>;
}

function ListingCard({ listing }: { listing: Listing }) {
  return (
    <article className="mp-listing-card">
      <div className="mp-photo-placeholder">Vehicle photos</div>
      <div className="mp-listing-body">
        <div className="mp-listing-heading"><h2>{listing.title}</h2><strong>{listing.price}</strong></div>
        <dl className="mp-spec-grid">
          <div><dt>Mileage</dt><dd>{listing.mileage}</dd></div>
          <div><dt>Location</dt><dd>{listing.location}</dd></div>
          <div><dt>Title</dt><dd>{listing.titleStatus}</dd></div>
          <div><dt>Runs/Drives</dt><dd>{listing.runsDrives}</dd></div>
        </dl>
        <div className="mp-card-footer">
          <EvidenceBadge label={listing.evidence} />
          <a className="mp-btn mp-btn-small" href="/marketplace/listing/sample">View Listing</a>
        </div>
      </div>
    </article>
  );
}

function PackageCard({ pkg }: { pkg: (typeof packages)[number] }) {
  return (
    <article className={pkg.highlighted ? "mp-package-card mp-package-featured" : "mp-package-card"}>
      <h2>{pkg.title}</h2>
      <strong>{pkg.price}</strong>
      <p>{pkg.body}</p>
      <ul>{pkg.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
      <a className="mp-btn mp-btn-secondary" href="/marketplace/sell/intake">Start Seller Intake</a>
    </article>
  );
}

function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mp-shell">
      <div className="mp-topbar">
        <a className="mp-brand" href="/marketplace">Mechanic's Eye <span>Marketplace</span></a>
        <nav className="mp-nav" aria-label="Marketplace navigation">
          <a href="/">Diagnosis Home</a>
          <a href="/marketplace">Marketplace</a>
          <a href="/marketplace/browse">Browse</a>
          <a href="/marketplace/sell">Sell Your Vehicle</a>
          <a href="/marketplace/offer-event">Weekend Offer Event</a>
          <a href="/marketplace/terms">Terms</a>
        </nav>
      </div>
      {children}
    </div>
  );
}

function HomePage() {
  return (
    <MarketplaceLayout>
      <Hero title="Sell your vehicle with better information." body="Mechanic's Eye Marketplace helps sellers present vehicles with photos, symptoms, repair history, and clear condition notes so buyers can make better decisions." primaryLabel="Sell Your Vehicle" primaryHref="/marketplace/sell" secondaryLabel="Browse Vehicles" secondaryHref="/marketplace/browse" />
      <section className="mp-option-grid">
        <a className="mp-option-card" href="/marketplace/browse"><span>Browse Vehicles</span><p>View seller-controlled listings with title status, mileage, location, and evidence notes.</p></a>
        <a className="mp-option-card" href="/marketplace/sell"><span>Sell Your Vehicle</span><p>Create a listing request and choose the package that fits your sale.</p></a>
        <a className="mp-option-card" href="/marketplace/offer-event"><span>Join Weekend Offer Event</span><p>Collect buyer interest during a timed weekend window while you stay in control.</p></a>
      </section>
      <section className="mp-card">
        <h2>Built for real-world private sales</h2>
        <p>This is not a dealership page. Sellers control their listings, buyers contact or submit interest, and both sides handle the final transaction directly.</p>
        <div className="mp-trust-grid"><div>Clear known-issue notes</div><div>Repair history prompts</div><div>Evidence badges</div><div>Buyer safety reminders</div></div>
      </section>
      <section className="mp-cta">
        <div><h2>You stay in control of the sale.</h2><p>Mechanic's Eye gives you the tools. You handle the transaction.</p></div>
        <div className="mp-actions"><a className="mp-btn mp-btn-primary" href="/marketplace/sell/intake">Start Seller Intake</a><a className="mp-btn mp-btn-secondary" href="/marketplace/terms">Read Marketplace Terms</a></div>
      </section>
      <Disclaimer />
    </MarketplaceLayout>
  );
}

function BrowsePage() {
  return (
    <MarketplaceLayout>
      <section className="mp-page-heading"><div className="mp-eyebrow">Browse vehicles</div><h1>Seller-controlled vehicle listings</h1><p>Demo listings are shown for the MVP shell. Real listings can connect here later without changing the public marketplace flow.</p></section>
      <section className="mp-browse-layout">
        <aside className="mp-filters">
          <h2>Filters</h2>
          {["Price", "Make", "Title status", "Runs/drives", "Location"].map((label) => <label key={label}>{label}<select defaultValue=""><option value="">Any</option><option value="demo">Demo option</option></select></label>)}
          <button className="mp-btn mp-btn-secondary" type="button">Apply Filters</button>
        </aside>
        <div className="mp-listing-grid">{listings.map((listing) => <ListingCard key={listing.title} listing={listing} />)}</div>
      </section>
      <Disclaimer compact />
    </MarketplaceLayout>
  );
}

function SampleListingPage() {
  return (
    <MarketplaceLayout>
      <section className="mp-detail">
        <div className="mp-gallery"><div className="mp-gallery-main">Main vehicle photo</div><div className="mp-gallery-thumbs"><span>Engine bay</span><span>Dash</span><span>Tires</span></div></div>
        <div className="mp-summary">
          <div className="mp-eyebrow">Sample public listing</div><h1>2012 Ford F-150 XLT</h1><strong className="mp-price">$8,900 asking</strong>
          <EvidenceBadge label="Evidence score" score="72/100" />
          <dl className="mp-spec-grid"><div><dt>Mileage</dt><dd>168,400 mi</dd></div><div><dt>Location</dt><dd>Bakersfield, CA</dd></div><div><dt>Title</dt><dd>Clean title</dd></div><div><dt>Runs/Drives</dt><dd>Runs and drives</dd></div></dl>
          <div className="mp-actions"><button className="mp-btn mp-btn-primary" type="button">Submit Buyer Interest</button><button className="mp-btn mp-btn-secondary" type="button">Ask Seller a Question</button></div>
          <button className="mp-link-btn" type="button">Download buyer checklist</button>
        </div>
      </section>
      <section className="mp-detail-grid">
        <article><h2>Seller notes</h2><p>Daily work truck. Starts, drives, and has normal wear for age. Seller says the truck was used for commuting and light hauling.</p></article>
        <article><h2>Known issues</h2><ul><li>Check engine light appears occasionally.</li><li>Driver seat fabric is torn.</li><li>Rear bumper has dents.</li></ul></article>
        <article><h2>Repair history</h2><ul><li>Front brakes replaced recently.</li><li>Oil changed within the last 1,000 miles.</li><li>Battery replaced last year.</li></ul></article>
        <article><h2>Seller-controlled disclaimer</h2><p>Vehicle information is provided by the seller. Buyers should inspect the vehicle, verify ownership and title status, and confirm condition before paying.</p></article>
      </section>
      <Disclaimer compact />
    </MarketplaceLayout>
  );
}

function SellPage() {
  return (
    <MarketplaceLayout>
      <Hero eyebrow="Sell Your Vehicle" title="Give buyers more confidence before they call." body="Add photos, symptoms, repair history, known issues, and Mechanic's Eye evidence options. You stay in control of price, communication, and final sale decisions." primaryLabel="Start Seller Intake" primaryHref="/marketplace/sell/intake" secondaryLabel="Weekend Offer Event" secondaryHref="/marketplace/offer-event" />
      <section className="mp-package-grid">{packages.map((pkg) => <PackageCard key={pkg.title} pkg={pkg} />)}</section>
      <section className="mp-cta"><div><h2>Mechanic's Eye gives you the tools.</h2><p>Sellers are responsible for transaction details, title transfer, payment, pickup or shipping, taxes, disclosures, and state requirements.</p></div><div className="mp-actions"><a className="mp-btn mp-btn-primary" href="/marketplace/sell/intake">Start Seller Intake</a><a className="mp-btn mp-btn-secondary" href="/marketplace/terms">Read Marketplace Terms</a></div></section>
      <Disclaimer />
    </MarketplaceLayout>
  );
}

function SellerIntakePage() {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    window.location.href = "/marketplace/sell/submitted";
  };

  return (
    <MarketplaceLayout>
      <section className="mp-page-heading"><div className="mp-eyebrow">Seller intake</div><h1>Start a marketplace listing request</h1><p>This frontend form captures the first version of the seller workflow. Backend submission, payments, dashboards, and admin review can be connected later.</p></section>
      <form className="mp-intake-form" onSubmit={submit}>
        <fieldset><legend>Seller information</legend><div className="mp-form-grid"><label>Seller name<input name="sellerName" required /></label><label>Seller email<input name="sellerEmail" type="email" required /></label><label>Seller phone<input name="sellerPhone" type="tel" required /></label><label>City<input name="city" required /></label><label>State<input name="state" maxLength={2} required /></label><label>ZIP<input name="zip" inputMode="numeric" required /></label></div></fieldset>
        <fieldset><legend>Vehicle information</legend><div className="mp-form-grid"><label>Vehicle year<input name="year" inputMode="numeric" required /></label><label>Make<input name="make" required /></label><label>Model<input name="model" required /></label><label>Trim<input name="trim" /></label><label>Mileage<input name="mileage" inputMode="numeric" required /></label><label>Asking price<input name="askingPrice" inputMode="decimal" required /></label><label>Title status<select name="titleStatus" required><option value="">Choose one</option><option>Clean title</option><option>Salvage title</option><option>Rebuilt title</option><option>Lienholder involved</option><option>Other or unsure</option></select></label><label>Runs and drives<select name="runsDrives" required><option value="">Choose one</option><option>Runs and drives</option><option>Runs but needs work</option><option>Does not currently run</option><option>Unknown</option></select></label></div><label>Known issues<textarea name="knownIssues" rows={5} required /></label><label>Recent repairs<textarea name="recentRepairs" rows={4} /></label><label>Upload photos<input name="photos" type="file" accept="image/*" multiple /></label></fieldset>
        <fieldset><legend>Listing type</legend><div className="mp-radio-grid">{["Standard Listing", "Best Offer Listing", "Weekend Offer Event"].map((type) => <label key={type}><input name="listingType" type="radio" value={type} required /><span>{type}</span></label>)}</div></fieldset>
        <fieldset><legend>Seller acknowledgments</legend><div className="mp-ack-list">{["I am the owner or authorized to list this vehicle.", "I understand Mechanic's Eye is only a listing platform.", "I am responsible for title transfer, payment, shipping/pickup, taxes, and legal requirements.", "I understand Mechanic's Eye does not guarantee buyer payment or vehicle condition."].map((ack) => <label key={ack}><input type="checkbox" required /><span>{ack}</span></label>)}</div></fieldset>
        <button className="mp-btn mp-btn-primary" type="submit">Submit Listing Request</button>
      </form>
      <Disclaimer compact />
    </MarketplaceLayout>
  );
}

function SubmittedPage() {
  return (
    <MarketplaceLayout>
      <section className="mp-submitted"><div className="mp-eyebrow">Listing request received</div><h1>Your seller intake is review-ready.</h1><p>The next MVP step is to connect this form to backend storage, payment links, admin review, and seller follow-up. For now, this confirmation proves the public seller flow has a clear destination.</p><div className="mp-next-steps"><h2>Next steps</h2><ol><li>Mechanic's Eye reviews the listing request.</li><li>The seller confirms package choice and listing details.</li><li>The seller handles title, payment, pickup or shipping, and state paperwork.</li></ol></div><div className="mp-actions"><a className="mp-btn mp-btn-primary" href="/marketplace">Return to Marketplace</a><a className="mp-btn mp-btn-secondary" href="/marketplace/sell">View Listing Packages</a></div></section>
    </MarketplaceLayout>
  );
}

function OfferEventPage() {
  return (
    <MarketplaceLayout>
      <Hero eyebrow="Weekend Offer Event" title="A timed offer window where sellers stay in control." body="List during the week, collect buyer interest from Friday through Monday, then decide whether any offer makes sense for you." primaryLabel="List a Vehicle" primaryHref="/marketplace/sell/intake" secondaryLabel="Browse Event Vehicles" secondaryHref="/marketplace/browse" />
      <section className="mp-card"><h2>Sample event schedule</h2><div className="mp-timeline-grid"><div><strong>Monday-Thursday</strong><span>Listings open and sellers prepare vehicle details.</span></div><div><strong>Friday-Monday</strong><span>Event runs and buyers submit interest or offers.</span></div><div><strong>After event</strong><span>Sellers review buyer interest and ask follow-up questions.</span></div><div><strong>Seller decision</strong><span>Seller chooses whether to accept any offer or keep the listing active.</span></div></div></section>
      <section className="mp-cta"><div><h2>Best offer listing, not a dealership sale</h2><p>Mechanic's Eye provides the listing tools and event structure. Seller and buyer handle payment, title transfer, pickup or shipping, taxes, and required paperwork.</p></div><div className="mp-actions"><a className="mp-btn mp-btn-primary" href="/marketplace/sell/intake">List a Vehicle</a><a className="mp-btn mp-btn-secondary" href="/marketplace/browse">Browse Event Vehicles</a></div></section>
      <Disclaimer />
    </MarketplaceLayout>
  );
}

function TermsPage() {
  const terms = ["Mechanic's Eye is a listing and software platform only.", "Mechanic's Eye is not the seller.", "Mechanic's Eye does not own, possess, title, finance, transport, or sell vehicles.", "Mechanic's Eye does not guarantee vehicle condition, buyer payment, seller ownership, title status, or transaction outcome.", "Buyers must inspect vehicles and verify title and ownership before paying.", "Sellers must follow their state laws for title transfer, disclosures, taxes, and registration.", "Mechanic's Eye does not provide legal advice.", "Marketplace features may vary by state.", "The final transaction is between buyer and seller."];
  return (
    <MarketplaceLayout>
      <section className="mp-terms"><div className="mp-eyebrow">Marketplace terms and safety</div><h1>Plain-language marketplace disclaimer</h1><p>These terms are written for the MVP public site so buyers and sellers understand the role Mechanic's Eye plays in a private-party vehicle listing.</p><ul>{terms.map((term) => <li key={term}>{term}</li>)}</ul><div className="mp-actions"><a className="mp-btn mp-btn-primary" href="/marketplace/sell">Sell Your Vehicle</a><a className="mp-btn mp-btn-secondary" href="/marketplace/browse">Browse Vehicles</a></div></section>
    </MarketplaceLayout>
  );
}

export default function Marketplace() {
  const path = window.location.pathname.replace(/\/$/, "") || "/marketplace";

  if (path === "/marketplace/browse") return <BrowsePage />;
  if (path === "/marketplace/listing/sample") return <SampleListingPage />;
  if (path === "/marketplace/sell") return <SellPage />;
  if (path === "/marketplace/sell/intake") return <SellerIntakePage />;
  if (path === "/marketplace/sell/submitted") return <SubmittedPage />;
  if (path === "/marketplace/offer-event") return <OfferEventPage />;
  if (path === "/marketplace/terms") return <TermsPage />;

  return <HomePage />;
}
