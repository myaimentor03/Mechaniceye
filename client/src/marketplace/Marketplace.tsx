import { FormEvent, useState } from "react";
import { NeedHelpPanel } from "../components/NeedHelpPanel";
import {
  PUBLIC_REVIEW_PATH,
  PublicHeaderNavigation,
  type PublicNavigationItem,
} from "../components/PublicHeaderNavigation";
import { getFrontendRoutePath, navigateFrontend } from "../frontendRouting";

const MARKETPLACE_SELLER_INTAKE_ENDPOINT = "https://mechaniceye-backend-v2.onrender.com/api/marketplace/seller-intake";
const MARKETPLACE_BUYER_INTEREST_ENDPOINT = "https://mechaniceye-backend-v2.onrender.com/api/marketplace/buyer-interest";

const MARKETPLACE_PUBLIC_NAVIGATION: readonly PublicNavigationItem[] = Object.freeze([
  { label: "Drivable Check", href: "/drivable-check" },
  { label: "ClearSale", href: "/clearsale" },
  { label: "Buyer Check", href: "/buyer-check" },
  { label: "Start ClearSale", href: "/clearsale" },
  { label: "Mechanic Match", href: "/mechanic-match" },
  { label: "Mechanic's Eye Review", href: PUBLIC_REVIEW_PATH },
  { label: "Guides", href: "/marketplace/guides" },
  { label: "Need Help?", href: "/help" },
  { label: "Weekend Offer Event", href: "/marketplace/offer-event" },
  { label: "Terms", href: "/marketplace/terms" },
]);

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
    title: "Mechanic's Eye Review",
    price: "Diagnostic/evidence package",
    body: "Mechanic's Eye can help organize diagnostic evidence for ClearSale without guaranteeing condition.",
    features: ["Evidence review", "Repair history structure", "Symptom notes", "No certification claim"],
  },
  {
    title: "Weekend Offer Event Entry",
    price: "Event entry fee",
    body: "Collect buyer interest during a Friday-Monday timed offer window.",
    features: ["Timed offer window", "Seller chooses next step", "Best offer language", "No sale guarantee"],
  },
];

const guideLinks = [
  {
    title: "Seller Checklist",
    href: "/marketplace/guides/seller-checklist",
    body: "What to gather before you ask ClearSale to help present your vehicle.",
  },
  {
    title: "Buyer Checklist",
    href: "/marketplace/guides/buyer-checklist",
    body: "What buyers should check before contacting a seller or paying for a vehicle.",
  },
  {
    title: "Title Transfer",
    href: "/marketplace/guides/title-transfer",
    body: "General title-transfer reminders and where to verify state rules.",
  },
  {
    title: "Selling Info",
    href: "/marketplace/guides/selling-info",
    body: "How to prepare clear listing details, photos, and condition notes.",
  },
  {
    title: "Safety",
    href: "/marketplace/guides/safety",
    body: "Transaction safety, payment caution, and fraud-prevention basics.",
  },
  {
    title: "Legal Disclaimer",
    href: "/marketplace/guides/legal-disclaimer",
    body: "Plain-language limits for Drivable Marketplace, ClearSale, and Mechanic's Eye.",
  },
];

function getMarketplaceSellerIntakeEndpoint() {
  const isLocalBrowser =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  return isLocalBrowser ? "/api/marketplace/seller-intake" : MARKETPLACE_SELLER_INTAKE_ENDPOINT;
}

function getMarketplaceBuyerInterestEndpoint() {
  const isLocalBrowser =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  return isLocalBrowser ? "/api/marketplace/buyer-interest" : MARKETPLACE_BUYER_INTEREST_ENDPOINT;
}

function Hero({ eyebrow = "ClearSale", title, body, primaryLabel, primaryHref, secondaryLabel, secondaryHref }: HeroProps) {
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
        <div><strong>Peer-to-peer transaction</strong><span>Drivable by Mechanic's Eye gives you tools. You handle the transaction.</span></div>
      </div>
    </section>
  );
}

function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? "mp-disclaimer mp-disclaimer-compact" : "mp-disclaimer"}>
      <h2>ClearSale disclaimer</h2>
      <p>
        ClearSale is a peer-to-peer vehicle listing and software platform from Drivable by Mechanic's Eye.
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
          <a className="mp-btn mp-btn-small" href="/marketplace/buyer-interest">Buyer Interest</a>
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
      <a className="mp-btn mp-btn-secondary" href="/marketplace/sell/intake">Start ClearSale Intake</a>
    </article>
  );
}

function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mp-shell">
      <header className="mp-topbar">
        <PublicHeaderNavigation
          ariaLabel="ClearSale navigation"
          brand={<a className="mp-brand" href="/clearsale">Drivable <span>ClearSale</span></a>}
          items={MARKETPLACE_PUBLIC_NAVIGATION}
          menuId="clearsale-public-navigation"
          navClassName="mp-nav"
        />
      </header>
      {children}
    </div>
  );
}

function HomePage() {
  return (
    <MarketplaceLayout>
      <Hero title="Sell your vehicle with better information." body="ClearSale helps sellers present vehicles with photos, symptoms, repair history, and clear condition notes so buyers can make better decisions. Mechanic's Eye remains the trust layer behind diagnostic review." primaryLabel="Start ClearSale" primaryHref="/clearsale" secondaryLabel="Buyer Check" secondaryHref="/buyer-check" />
      <section className="mp-option-grid">
        <a className="mp-option-card" href="/buyer-check"><span>Buyer Check</span><p>Review evidence, title concerns, seller claims, and walk-away risks.</p></a>
        <a className="mp-option-card" href="/clearsale"><span>ClearSale</span><p>Prepare a clearer as-is listing request while you stay in control of the sale.</p></a>
        <a className="mp-option-card" href="/marketplace/offer-event"><span>Join Weekend Offer Event</span><p>Collect buyer interest during a timed weekend window while you stay in control.</p></a>
      </section>
      <section className="mp-card">
        <h2>Built for real-world private sales</h2>
        <p>This is not a dealership page. Sellers control their listings, buyers contact or submit interest, and both sides handle the final transaction directly.</p>
        <div className="mp-trust-grid"><div>Clear known-issue notes</div><div>Repair history prompts</div><div>Evidence badges</div><div>Buyer safety reminders</div></div>
      </section>
      <section className="mp-cta">
        <div><h2>You stay in control of the sale.</h2><p>ClearSale gives you the listing tools. Mechanic's Eye supports the evidence layer. You handle the transaction.</p></div>
        <div className="mp-actions"><a className="mp-btn mp-btn-primary" href="/marketplace/sell/intake">Start ClearSale Intake</a><a className="mp-btn mp-btn-secondary" href="/marketplace/guides">Read Marketplace Guides</a><a className="mp-btn mp-btn-secondary" href="/marketplace/terms">Read ClearSale Terms</a></div>
      </section>
      <Disclaimer />
    </MarketplaceLayout>
  );
}

function BrowsePage() {
  return (
    <MarketplaceLayout>
      <section className="mp-page-heading"><div className="mp-eyebrow">Buyer Check</div><h1>Seller-controlled vehicle listings</h1><p>Demo listings are shown for the MVP shell. Real listings can connect here later without changing the public ClearSale flow.</p></section>
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
          <div className="mp-eyebrow">Sample ClearSale listing</div><h1>2012 Ford F-150 XLT</h1><strong className="mp-price">$8,900 asking</strong>
          <EvidenceBadge label="Evidence score" score="72/100" />
          <dl className="mp-spec-grid"><div><dt>Mileage</dt><dd>168,400 mi</dd></div><div><dt>Location</dt><dd>Bakersfield, CA</dd></div><div><dt>Title</dt><dd>Clean title</dd></div><div><dt>Runs/Drives</dt><dd>Runs and drives</dd></div></dl>
          <div className="mp-actions"><a className="mp-btn mp-btn-primary" href="/marketplace/buyer-interest">Submit Buyer Interest</a><a className="mp-btn mp-btn-secondary" href="/marketplace/guides/buyer-checklist">Buyer Checklist</a></div>
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
      <Hero eyebrow="ClearSale" title="Give buyers more confidence before they call." body="Add photos, symptoms, repair history, known issues, and Mechanic's Eye evidence options. ClearSale is a flat-fee listing path to sell your vehicle as-is while you stay in control of price, communication, and final sale decisions." primaryLabel="Start ClearSale Intake" primaryHref="/marketplace/sell/intake" secondaryLabel="Weekend Offer Event" secondaryHref="/marketplace/offer-event" />
      <section className="mp-package-grid">{packages.map((pkg) => <PackageCard key={pkg.title} pkg={pkg} />)}</section>
      <section className="mp-cta"><div><h2>ClearSale gives you the listing tools.</h2><p>Sellers are responsible for transaction details, title transfer, payment, pickup or shipping, taxes, disclosures, and state requirements.</p></div><div className="mp-actions"><a className="mp-btn mp-btn-primary" href="/marketplace/sell/intake">Start ClearSale Intake</a><a className="mp-btn mp-btn-secondary" href="/marketplace/guides/seller-checklist">Seller Checklist</a><a className="mp-btn mp-btn-secondary" href="/marketplace/terms">Read ClearSale Terms</a></div></section>
      <Disclaimer />
    </MarketplaceLayout>
  );
}

function SellerIntakePage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const value = (name: string) => String(formData.get(name) || "").trim();
    const payload = {
      intakeType: "marketplace-seller",
      source: "drivable-marketplace-seller-intake",
      submittedAt: new Date().toISOString(),
      appBrand: "Drivable by Mechanic’s Eye",
      marketplaceBrand: "Drivable Marketplace",
      sellerName: value("sellerName"),
      sellerEmail: value("sellerEmail"),
      sellerPhone: value("sellerPhone"),
      city: value("city"),
      state: value("state"),
      zip: value("zip"),
      vehicleYear: value("vehicleYear"),
      make: value("make"),
      model: value("model"),
      trim: value("trim"),
      mileage: value("mileage"),
      askingPrice: value("askingPrice"),
      titleStatus: value("titleStatus"),
      runsAndDrives: value("runsAndDrives"),
      knownIssues: value("knownIssues"),
      recentRepairs: value("recentRepairs"),
      vin: value("vin"),
      exteriorColor: value("exteriorColor"),
      transmission: value("transmission"),
      fuelType: value("fuelType"),
      hasKeys: value("hasKeys"),
      lienStatus: value("lienStatus"),
      bestContactMethod: value("bestContactMethod"),
      buyerTestDriveAllowed: value("buyerTestDriveAllowed"),
      buyerMechanicAllowed: value("buyerMechanicAllowed"),
      sellerNotes: value("sellerNotes"),
      listingType: value("listingType"),
      acknowledgments: {
        ownerAuthorized: formData.get("ackOwnerAuthorized") === "on",
        platformOnly: formData.get("ackPlatformOnly") === "on",
        sellerResponsibilities: formData.get("ackSellerResponsibilities") === "on",
        noGuarantee: formData.get("ackNoGuarantee") === "on",
      },
    };

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const response = await fetch(getMarketplaceSellerIntakeEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({ ok: false, error: "Seller intake failed." }));

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Seller intake failed. Please check the form and try again.");
      }

      navigateFrontend("/marketplace/sell/submitted");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Seller intake failed. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <MarketplaceLayout>
      <section className="mp-page-heading"><div className="mp-eyebrow">ClearSale intake</div><h1>Start a ClearSale listing request</h1><p>Submit your seller and vehicle details for ClearSale review. Mechanic's Eye uses this information to prepare the listing request handoff.</p></section>
      <section className="mp-card"><h2>Before you submit</h2><p>Use the seller checklist if you need a quick gut check on title, lien, mileage, known issues, photos, and state-specific paperwork questions. ClearSale is a listing platform, not a legal or title service.</p><div className="mp-actions"><a className="mp-btn mp-btn-secondary" href="/marketplace/guides/seller-checklist">Seller Checklist</a><a className="mp-btn mp-btn-secondary" href="/marketplace/guides/selling-info">Prepare Listing Info</a></div></section>
      <NeedHelpPanel topic="Help listing a vehicle" compact />
      <form className="mp-intake-form" onSubmit={submit}>
        <fieldset><legend>Seller information</legend><div className="mp-form-grid"><label>Seller name<input name="sellerName" required /></label><label>Seller email<input name="sellerEmail" type="email" required /></label><label>Seller phone<input name="sellerPhone" type="tel" required /></label><label>City<input name="city" required /></label><label>State<input name="state" maxLength={2} required /></label><label>ZIP<input name="zip" inputMode="numeric" required /></label></div></fieldset>
        <fieldset><legend>Vehicle information</legend><div className="mp-form-grid"><label>Vehicle year<input name="vehicleYear" inputMode="numeric" required /></label><label>Make<input name="make" required /></label><label>Model<input name="model" required /></label><label>Trim<input name="trim" /></label><label>VIN<input name="vin" /></label><label>Exterior color<input name="exteriorColor" /></label><label>Mileage<input name="mileage" inputMode="numeric" required /></label><label>Asking price<input name="askingPrice" inputMode="decimal" required /></label><label>Title status<select name="titleStatus" required><option value="">Choose one</option><option>Clean title</option><option>Salvage title</option><option>Rebuilt title</option><option>Lienholder involved</option><option>Other or unsure</option></select></label><label>Runs and drives<select name="runsAndDrives" required><option value="">Choose one</option><option>Runs and drives</option><option>Runs but needs work</option><option>Does not currently run</option><option>Unknown</option></select></label><label>Transmission<select name="transmission"><option value="">Choose one</option><option>Automatic</option><option>Manual</option><option>CVT</option><option>Other or unsure</option></select></label><label>Fuel type<select name="fuelType"><option value="">Choose one</option><option>Gas</option><option>Diesel</option><option>Hybrid</option><option>Electric</option><option>Other or unsure</option></select></label><label>Has keys?<select name="hasKeys"><option value="">Choose one</option><option>Yes</option><option>No</option><option>One key only</option></select></label><label>Lien status<select name="lienStatus"><option value="">Choose one</option><option>No lien</option><option>Lienholder involved</option><option>Unsure</option></select></label><label>Best contact method<select name="bestContactMethod"><option value="">Choose one</option><option>Phone</option><option>Email</option><option>Text</option></select></label><label>Buyer test drive allowed?<select name="buyerTestDriveAllowed"><option value="">Choose one</option><option>Yes</option><option>No</option><option>Case by case</option></select></label><label>Buyer mechanic allowed?<select name="buyerMechanicAllowed"><option value="">Choose one</option><option>Yes</option><option>No</option><option>Case by case</option></select></label></div><label>Known issues<textarea name="knownIssues" rows={5} required /></label><label>Recent repairs<textarea name="recentRepairs" rows={4} /></label><label>Seller notes<textarea name="sellerNotes" rows={4} /></label><label>Upload photos<input name="photos" type="file" accept="image/*" multiple /></label></fieldset>
        <fieldset><legend>Listing type</legend><div className="mp-radio-grid">{["Standard Listing", "Best Offer Listing", "Weekend Offer Event"].map((type) => <label key={type}><input name="listingType" type="radio" value={type} required /><span>{type}</span></label>)}</div></fieldset>
        <fieldset><legend>Seller acknowledgments</legend><div className="mp-ack-list"><label><input name="ackOwnerAuthorized" type="checkbox" required /><span>I am the owner or otherwise have authority to list this vehicle.</span></label><label><input name="ackPlatformOnly" type="checkbox" required /><span>I understand ClearSale is a platform only and is not the buyer, seller, dealer, broker, title agent, transporter, or legal advisor.</span></label><label><input name="ackSellerResponsibilities" type="checkbox" required /><span>I understand buyers and sellers remain responsible for payment, vehicle inspection, title transfer, pickup or transport, taxes, registration, disclosures, and legal requirements.</span></label><label><input name="ackNoGuarantee" type="checkbox" required /><span>I understand ClearSale does not guarantee a sale, buyer interest, vehicle condition, title status, transfer completion, or legal outcome.</span></label></div></fieldset>
        {submitError && <div className="mp-form-error" role="alert">{submitError}</div>}
        <button className="mp-btn mp-btn-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? "Submitting..." : "Submit Listing Request"}</button>
      </form>
      <Disclaimer compact />
    </MarketplaceLayout>
  );
}

function BuyerInterestPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const value = (name: string) => String(formData.get(name) || "").trim();
    const payload = {
      intakeType: "marketplace-buyer-interest",
      source: "drivable-marketplace-buyer-interest",
      submittedAt: new Date().toISOString(),
      appBrand: "Drivable by Mechanic’s Eye",
      marketplaceBrand: "Drivable Marketplace",
      buyerName: value("buyerName"),
      buyerEmail: value("buyerEmail"),
      buyerPhone: value("buyerPhone"),
      preferredContactMethod: value("preferredContactMethod"),
      listingTitle: value("listingTitle"),
      listingUrl: window.location.origin + "/marketplace/listing/sample",
      buyerLocation: value("buyerLocation"),
      message: value("message"),
      timeline: value("timeline"),
      acknowledgments: {
        platformOnly: formData.get("ackPlatformOnly") === "on",
        buyerResponsibilities: formData.get("ackBuyerResponsibilities") === "on",
        noGuarantee: formData.get("ackNoGuarantee") === "on",
      },
    };

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const response = await fetch(getMarketplaceBuyerInterestEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({ ok: false, error: "Buyer interest failed." }));

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Buyer interest failed. Please check the form and try again.");
      }

      setSubmitted(true);
      form.reset();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Buyer interest failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MarketplaceLayout>
      <section className="mp-page-heading"><div className="mp-eyebrow">Buyer Check</div><h1>Submit buyer interest</h1><p>Send interest in a ClearSale listing. This does not reserve the vehicle, approve a sale, verify the seller, verify title, or handle payment.</p></section>
      {submitted && <section className="mp-card"><h2>Interest received</h2><p>Your buyer interest was received for review and handoff. ClearSale does not guarantee seller response, buyer payment, vehicle condition, title status, transfer completion, or legal outcome.</p></section>}
      <form className="mp-intake-form" onSubmit={submit}>
        <fieldset><legend>Buyer information</legend><div className="mp-form-grid"><label>Buyer name<input name="buyerName" required /></label><label>Buyer email<input name="buyerEmail" type="email" required /></label><label>Buyer phone<input name="buyerPhone" type="tel" required /></label><label>Preferred contact method<select name="preferredContactMethod" required><option value="">Choose one</option><option>Phone</option><option>Email</option><option>Text</option></select></label><label>Buyer location<input name="buyerLocation" placeholder="City, state" /></label><label>Timeline<select name="timeline"><option value="">Choose one</option><option>Today or tomorrow</option><option>This week</option><option>Still researching</option></select></label></div></fieldset>
        <fieldset><legend>Listing interest</legend><div className="mp-form-grid"><label>Listing<input name="listingTitle" defaultValue="2012 Ford F-150 XLT" required /></label></div><label>Message to seller or admin<textarea name="message" rows={5} placeholder="Questions, viewing availability, inspection plans, or other notes." required /></label></fieldset>
        <fieldset><legend>Buyer acknowledgments</legend><div className="mp-ack-list"><label><input name="ackPlatformOnly" type="checkbox" required /><span>I understand ClearSale is a listing platform only and is not the buyer, seller, dealer, broker, title agent, transporter, payment processor, or legal advisor.</span></label><label><input name="ackBuyerResponsibilities" type="checkbox" required /><span>I remain responsible for inspecting the vehicle, verifying VIN/title/seller authority, payment safety, taxes, registration, title transfer, and state-specific requirements.</span></label><label><input name="ackNoGuarantee" type="checkbox" required /><span>I understand ClearSale does not guarantee seller response, buyer payment, vehicle condition, title status, transfer completion, or legal outcome.</span></label></div></fieldset>
        {submitError && <div className="mp-form-error" role="alert">{submitError}</div>}
        <button className="mp-btn mp-btn-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? "Submitting..." : "Submit Buyer Interest"}</button>
      </form>
      <Disclaimer compact />
    </MarketplaceLayout>
  );
}

function SubmittedPage() {
  return (
    <MarketplaceLayout>
      <section className="mp-submitted"><div className="mp-eyebrow">ClearSale request received</div><h1>Your request has been received for review.</h1><p>Your listing request is not automatically approved and is not guaranteed to sell. ClearSale does not handle title, payment, transport, taxes, registration, or legal compliance.</p><div className="mp-next-steps"><h2>Next steps</h2><ol><li>Mechanic's Eye reviews the submitted seller and vehicle details.</li><li>The seller remains responsible for accurate information, disclosures, and state-specific requirements.</li><li>The buyer and seller handle any transaction, title transfer, payment, pickup or shipping, taxes, registration, and legal obligations directly.</li></ol></div><div className="mp-actions"><a className="mp-btn mp-btn-primary" href="/clearsale">Return to ClearSale</a><a className="mp-btn mp-btn-secondary" href="/marketplace/sell">View Listing Packages</a></div></section>
    </MarketplaceLayout>
  );
}

function OfferEventPage() {
  return (
    <MarketplaceLayout>
      <Hero eyebrow="ClearSale Weekend Offer Event" title="A timed offer window where sellers stay in control." body="List during the week, collect buyer interest from Friday through Monday, then decide whether any offer makes sense for you." primaryLabel="List a Vehicle" primaryHref="/marketplace/sell/intake" secondaryLabel="Buyer Check" secondaryHref="/buyer-check" />
      <section className="mp-card"><h2>Sample event schedule</h2><div className="mp-timeline-grid"><div><strong>Monday-Thursday</strong><span>Listings open and sellers prepare vehicle details.</span></div><div><strong>Friday-Monday</strong><span>Event runs and buyers submit interest or offers.</span></div><div><strong>After event</strong><span>Sellers review buyer interest and ask follow-up questions.</span></div><div><strong>Seller decision</strong><span>Seller chooses whether to accept any offer or keep the listing active.</span></div></div></section>
      <section className="mp-cta"><div><h2>Best offer listing, not a dealership sale</h2><p>ClearSale provides the listing tools and event structure. Seller and buyer handle payment, title transfer, pickup or shipping, taxes, and required paperwork.</p></div><div className="mp-actions"><a className="mp-btn mp-btn-primary" href="/marketplace/sell/intake">List a Vehicle</a><a className="mp-btn mp-btn-secondary" href="/buyer-check">Buyer Check</a></div></section>
      <Disclaimer />
    </MarketplaceLayout>
  );
}

function TermsPage() {
  const terms = ["Mechanic's Eye is a listing and software platform only.", "Mechanic's Eye is not the seller.", "Mechanic's Eye does not own, possess, title, finance, transport, or sell vehicles.", "Mechanic's Eye does not guarantee vehicle condition, buyer payment, seller ownership, title status, or transaction outcome.", "Buyers must inspect vehicles and verify title and ownership before paying.", "Sellers must follow their state laws for title transfer, disclosures, taxes, and registration.", "Mechanic's Eye does not provide legal advice.", "Marketplace features may vary by state.", "The final transaction is between buyer and seller."];
  return (
    <MarketplaceLayout>
      <section className="mp-terms"><div className="mp-eyebrow">ClearSale terms and safety</div><h1>Plain-language marketplace disclaimer</h1><p>These terms are written for the MVP public site so buyers and sellers understand the role Mechanic's Eye plays in a private-party vehicle listing.</p><ul>{terms.map((term) => <li key={term}>{term}</li>)}</ul><div className="mp-actions"><a className="mp-btn mp-btn-primary" href="/clearsale">Start ClearSale</a><a className="mp-btn mp-btn-secondary" href="/buyer-check">Buyer Check</a><a className="mp-btn mp-btn-secondary" href="/marketplace/guides">Marketplace Guides</a></div></section>
    </MarketplaceLayout>
  );
}

function GuideCard({ title, href, body }: { title: string; href: string; body: string }) {
  return (
    <a className="mp-option-card" href={href}>
      <span>{title}</span>
      <p>{body}</p>
    </a>
  );
}

function GuidePage({
  eyebrow,
  title,
  intro,
  items,
  note,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  items: string[];
  note?: string;
}) {
  return (
    <MarketplaceLayout>
      <section className="mp-page-heading"><div className="mp-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{intro}</p></section>
      <section className="mp-detail-grid">
        <article>
          <h2>Checklist</h2>
          <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
        <article>
          <h2>Platform reminder</h2>
          <p>{note || "This guide is practical information only. Drivable Marketplace, ClearSale, and Mechanic's Eye do not provide legal advice, verify ownership or title, handle state paperwork, or guarantee sale results."}</p>
        </article>
      </section>
      <section className="mp-cta"><div><h2>Keep moving carefully.</h2><p>Use official state sources, inspect the vehicle, and make your own transaction decisions before money or title changes hands.</p></div><div className="mp-actions"><a className="mp-btn mp-btn-primary" href="/marketplace/guides">All Guides</a><a className="mp-btn mp-btn-secondary" href="/marketplace/terms">Read Terms</a></div></section>
      <Disclaimer compact />
    </MarketplaceLayout>
  );
}

function GuidesHomePage() {
  return (
    <MarketplaceLayout>
      <section className="mp-page-heading"><div className="mp-eyebrow">Drivable Marketplace guides</div><h1>ClearSale and Buyer Check guidance</h1><p>Practical checklists for private-party vehicle listings. These pages help you get organized, but they are not legal advice and they do not replace official state motor vehicle guidance.</p></section>
      <section className="mp-option-grid">{guideLinks.map((guide) => <GuideCard key={guide.href} {...guide} />)}</section>
      <section className="mp-card"><h2>What Drivable does and does not do</h2><p>Drivable by Mechanic's Eye provides listing software, ClearSale seller intake, Buyer Check support, and Mechanic's Eye Review organization. It does not verify ownership or title, handle state paperwork, process the vehicle transaction, guarantee buyer payment, guarantee vehicle condition, or guarantee any legal outcome.</p></section>
      <Disclaimer compact />
    </MarketplaceLayout>
  );
}

function SellerChecklistPage() {
  return (
    <GuidePage
      eyebrow="ClearSale seller checklist"
      title="Before you list your vehicle"
      intro="A seller-ready list for getting your vehicle information in order before submitting a flat-fee ClearSale listing request."
      items={[
        "Confirm that you own the vehicle or have clear authority to list it.",
        "Locate the physical or electronic title before you make promises to a buyer.",
        "Check lien or lender status and understand whether a payoff or lender release is involved.",
        "Gather mileage and odometer information as accurately as you can.",
        "Photograph the vehicle honestly, including damage, wear, tires, interior, dashboard, and warning lights.",
        "Document known issues in plain language, including intermittent problems.",
        "Collect repair history, receipts, recent parts, and maintenance notes where available.",
        "Decide an asking price and be ready to explain your reasoning.",
        "Prepare a bill of sale if your state requires it or if it is recommended for your records.",
        "Follow state-specific title, release-of-interest, report-of-sale, tax, and registration rules using official sources.",
      ]}
    />
  );
}

function BuyerChecklistPage() {
  return (
    <GuidePage
      eyebrow="Buyer Check"
      title="Before you buy from a private seller"
      intro="Use this as a working checklist before you inspect, pay, or agree to take a vehicle home."
      items={[
        "Inspect the vehicle in person when possible, including lights, tires, interior, underbody, engine bay, and test-drive behavior.",
        "Verify the VIN on the vehicle and compare it against title, listing, and any history report you choose to use.",
        "Verify title status and watch for salvage, rebuilt, lienholder, missing-title, or owner-name mismatch concerns.",
        "Check the seller's identity and authority to sell without assuming Drivable or ClearSale has verified it.",
        "Review known issues, warning lights, repairs, leaks, smells, noises, and condition notes.",
        "Consider an independent mechanic inspection before payment.",
        "Confirm payment method carefully and understand whether funds are reversible, counterfeit-prone, or delayed.",
        "Avoid unsafe transaction locations and avoid going alone when a meeting feels questionable.",
        "Understand taxes, registration, title, insurance, emissions, and state requirements before you buy.",
      ]}
    />
  );
}

function TitleTransferGuidePage() {
  return (
    <MarketplaceLayout>
      <section className="mp-page-heading"><div className="mp-eyebrow">Title transfer guidance</div><h1>Check the official state rules before title changes hands</h1><p>Title, odometer, lien, release-of-interest, report-of-sale, tax, registration, and plate rules vary by state. This page is general information only, not legal advice.</p></section>
      <section className="mp-detail-grid">
        <article><h2>General reminders</h2><ul><li>Seller and buyer must verify requirements with the official DMV, DOL, or motor vehicle agency for their state.</li><li>Do not rely only on a listing page, text message, social post, or verbal promise.</li><li>Check for lienholder involvement before payment or transfer.</li><li>Understand whether your state expects a bill of sale, odometer disclosure, release of interest, emissions step, report of sale, or registration action.</li><li>Keep copies of documents allowed by your state and avoid sharing sensitive personal information beyond what the official process requires.</li></ul></article>
        <article><h2>Washington sample starting point</h2><p>For a Washington private-party sale, start with the Washington State Department of Licensing as the official source for vehicle title transfer and seller report-of-sale information. Rules and forms can change, so sellers and buyers should verify directly with the DOL before acting.</p><p>ClearSale does not file Washington paperwork, verify ownership, release liens, collect taxes, register vehicles, or complete title transfer for either party.</p></article>
      </section>
      <section className="mp-cta"><div><h2>Use official sources first.</h2><p>If the official state guidance and a marketplace guide disagree, trust the official state source or ask a qualified professional.</p></div><div className="mp-actions"><a className="mp-btn mp-btn-primary" href="/marketplace/guides">All Guides</a><a className="mp-btn mp-btn-secondary" href="/marketplace/guides/legal-disclaimer">Legal Disclaimer</a></div></section>
      <Disclaimer compact />
    </MarketplaceLayout>
  );
}

function SellingInfoGuidePage() {
  return (
    <GuidePage
      eyebrow="ClearSale listing info"
      title="Prepare the information buyers actually need"
      intro="Clear, honest listing information helps buyers decide whether to contact you and helps Mechanic's Eye Review organize the condition story."
      items={[
        "Vehicle basics: year, make, model, trim, engine, drivetrain, and transmission where known.",
        "Mileage or odometer reading, plus any uncertainty about accuracy.",
        "Title status, including clean, rebuilt, salvage, lienholder involved, missing, or unsure.",
        "Runs and drives status, including no-start, rough running, overheating, slipping, brake, steering, or electrical concerns.",
        "Known problems, intermittent issues, leaks, smells, noises, damage, and warning lights.",
        "Recent repairs, maintenance, parts replaced, shop notes, and receipts if available.",
        "Photos, video, and sound evidence that show the real condition instead of hiding it.",
        "Price reasoning, including recent repairs, known issues, mileage, comparable listings, and urgency.",
        "Seller notes about contact preference, viewing availability, included parts, keys, and anything a buyer should know upfront.",
      ]}
    />
  );
}

function SafetyGuidePage() {
  return (
    <GuidePage
      eyebrow="Transaction safety"
      title="Keep the sale boring, public, and careful"
      intro="Private vehicle sales involve strangers, money, paperwork, and moving vehicles. Slow down when anything feels rushed or strange."
      items={[
        "Meet in safe, public places when possible and consider locations designed for safe exchanges.",
        "Verify funds carefully before signing title, releasing keys, or letting the vehicle leave.",
        "Avoid shipping, overpayment, fake escrow, fake cashier check, payment app, and remote pickup scams.",
        "Avoid pressure tactics, rushed deposits, sob stories, threats, and buyers or sellers who dodge basic questions.",
        "Do not overshare sensitive personal information, account details, document photos, or address information beyond what the official process requires.",
        "Use official state guidance for title, registration, taxes, plates, and report-of-sale steps.",
        "Consider bringing another adult, telling someone where you are going, and avoiding isolated test drives.",
      ]}
    />
  );
}

function LegalDisclaimerGuidePage() {
  return (
    <MarketplaceLayout>
      <section className="mp-page-heading"><div className="mp-eyebrow">Plain-language disclaimer</div><h1>Drivable Marketplace and ClearSale are listing software only</h1><p>This page explains the boundaries in normal language. It is not legal advice.</p></section>
      <section className="mp-terms"><ul><li>Drivable Marketplace, ClearSale, Buyer Check, Mechanic Match, and Mechanic's Eye Review provide software, listing organization, informational guidance, and review support only.</li><li>Mechanic's Eye is not the seller, buyer, dealer, broker, title agent, transporter, financing company, insurer, tax advisor, or legal advisor.</li><li>We do not verify ownership, seller authority, title status, liens, mileage, vehicle condition, buyer funds, or legal compliance.</li><li>We do not handle payment, title transfer, state paperwork, registration, taxes, plates, transport, pickup, inspections, or disputes.</li><li>We do not guarantee a sale, buyer interest, buyer payment, vehicle condition, title transfer, registration approval, tax outcome, dispute outcome, or legal outcome.</li><li>Sellers and buyers remain responsible for accurate information, physical inspection, official state requirements, payment decisions, and transaction safety.</li><li>Guides are general educational information. For state-specific requirements, use official DMV, DOL, or motor vehicle agency sources or consult a qualified professional.</li></ul><div className="mp-actions"><a className="mp-btn mp-btn-primary" href="/marketplace/guides">All Guides</a><a className="mp-btn mp-btn-secondary" href="/marketplace/terms">Marketplace Terms</a></div></section>
    </MarketplaceLayout>
  );
}

export default function Marketplace() {
  const path = getFrontendRoutePath();

  if (path === "/marketplace/browse") return <BrowsePage />;
  if (path === "/marketplace/listing/sample") return <SampleListingPage />;
  if (path === "/marketplace/buyer-interest") return <BuyerInterestPage />;
  if (path === "/marketplace/sell") return <SellPage />;
  if (path === "/marketplace/sell/intake") return <SellerIntakePage />;
  if (path === "/marketplace/sell/submitted") return <SubmittedPage />;
  if (path === "/marketplace/offer-event") return <OfferEventPage />;
  if (path === "/marketplace/terms") return <TermsPage />;
  if (path === "/marketplace/guides") return <GuidesHomePage />;
  if (path === "/marketplace/guides/seller-checklist") return <SellerChecklistPage />;
  if (path === "/marketplace/guides/buyer-checklist") return <BuyerChecklistPage />;
  if (path === "/marketplace/guides/title-transfer") return <TitleTransferGuidePage />;
  if (path === "/marketplace/guides/selling-info") return <SellingInfoGuidePage />;
  if (path === "/marketplace/guides/safety") return <SafetyGuidePage />;
  if (path === "/marketplace/guides/legal-disclaimer") return <LegalDisclaimerGuidePage />;

  return <HomePage />;
}
