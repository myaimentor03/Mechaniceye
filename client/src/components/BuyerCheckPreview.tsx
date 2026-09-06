import { FormEvent, useState } from "react";
import { NextActionStrip } from "./NextActionStrip";

const BUYER_VEHICLE_KNOWLEDGE_ENDPOINT = "/api/buyer-risk/vehicle-knowledge";

const REVIEW_AREAS = [
  "Seller evidence checklist",
  "Warning signs and inconsistent claims",
  "Title and vehicle-story concerns",
  "Questions to ask the seller",
  "Signals that it may be time to walk away"
] as const;

type BuyerVehicleKnowledgeResult = {
  found: boolean;
  message?: string;
  vehicle?: { year?: number; make?: string; model?: string };
  source?: string;
  confidence?: string;
  summary?: string;
  vinRequiredForApplicability?: boolean;
  recallCount?: number | null;
  complaintCount?: number | null;
  riskTags?: string[];
  buyerQuestions?: string[];
  sellerEvidenceRequests?: string[];
  inspectionPrompts?: string[];
  fallbackPrompts?: string[];
  disclaimer?: string;
};

function getBuyerVehicleKnowledgeEndpoint() {
  const isLocalBrowser =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  return isLocalBrowser ? "/api/buyer-risk/vehicle-knowledge" : BUYER_VEHICLE_KNOWLEDGE_ENDPOINT;
}

function formatRiskTag(tag: string) {
  return tag.replace(/_/g, " ");
}

function ResultList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;

  return (
    <div className="buyer-check-result-section">
      <h3>{title}</h3>
      <ul>
        {items.slice(0, 6).map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

export function BuyerCheckPreview() {
  const [vehicleYear, setVehicleYear] = useState("2014");
  const [vehicleMake, setVehicleMake] = useState("Ford");
  const [vehicleModel, setVehicleModel] = useState("Focus");
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [lookupError, setLookupError] = useState("");
  const [vehicleKnowledge, setVehicleKnowledge] = useState<BuyerVehicleKnowledgeResult | null>(null);

  async function handleVehicleKnowledgeLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLookupStatus("loading");
    setLookupError("");
    setVehicleKnowledge(null);

    try {
      const params = new URLSearchParams({
        year: vehicleYear.trim(),
        make: vehicleMake.trim(),
        model: vehicleModel.trim()
      });

      const response = await fetch(getBuyerVehicleKnowledgeEndpoint() + "?" + params.toString());
      const data = await response.json() as BuyerVehicleKnowledgeResult;

      if (!response.ok) {
        throw new Error(data.message || "Vehicle knowledge lookup failed.");
      }

      setVehicleKnowledge(data);
      setLookupStatus("success");
    } catch (error) {
      setLookupStatus("error");
      setLookupError(error instanceof Error ? error.message : "Vehicle knowledge lookup failed.");
    }
  }

  const fallbackPrompts = vehicleKnowledge?.fallbackPrompts || [];

  return (
    <main className="product-landing">
      <section className="product-landing-shell">
        <header className="product-landing-hero">
          <p className="product-landing-eyebrow">Buyer support</p>
          <h1>Buyer Check by Drivable</h1>
          <p>Review risk before chasing a used vehicle.</p>
        </header>

        <section className="product-landing-card product-landing-list">
          <h2>Know what deserves a closer look</h2>
          <p>Buyer Check helps organize a remote first-pass review before you spend time, travel, or money.</p>
          <ul>
            {REVIEW_AREAS.map((area) => <li key={area}>{area}</li>)}
          </ul>
        </section>

        <section className="product-landing-card buyer-check-lookup-card">
          <div>
            <p className="product-landing-eyebrow">NHTSA vehicle context</p>
            <h2>Check year, make, and model risk signals</h2>
            <p>
              Start with official-context recall and complaint data before you message the seller,
              schedule a drive, or waste gas visiting something with obvious red flags.
            </p>
          </div>

          <form className="buyer-check-lookup-form" onSubmit={handleVehicleKnowledgeLookup}>
            <div className="buyer-check-form-grid">
              <label>
                Year
                <input value={vehicleYear} inputMode="numeric" onChange={(event) => setVehicleYear(event.target.value)} required />
              </label>
              <label>
                Make
                <input value={vehicleMake} onChange={(event) => setVehicleMake(event.target.value)} required />
              </label>
              <label>
                Model
                <input value={vehicleModel} onChange={(event) => setVehicleModel(event.target.value)} required />
              </label>
            </div>

            <button className="product-landing-action primary buyer-check-submit" type="submit" disabled={lookupStatus === "loading"}>
              {lookupStatus === "loading" ? "Checking vehicle context..." : "Check vehicle context"}
            </button>
          </form>

          {lookupStatus === "error" && (
            <aside className="product-landing-warning">{lookupError}</aside>
          )}

          {vehicleKnowledge && (
            <section className="buyer-check-result" aria-live="polite">
              {vehicleKnowledge.found ? (
                <>
                  <div className="buyer-check-result-header">
                    <div>
                      <p className="product-landing-eyebrow">{vehicleKnowledge.source || "NHTSA"} context found</p>
                      <h2>{vehicleKnowledge.vehicle?.year} {vehicleKnowledge.vehicle?.make} {vehicleKnowledge.vehicle?.model}</h2>
                    </div>
                    <span>{vehicleKnowledge.confidence || "context"} confidence</span>
                  </div>

                  <p>{vehicleKnowledge.summary}</p>

                  <div className="buyer-check-meta-grid">
                    <div><strong>{vehicleKnowledge.recallCount ?? "Unknown"}</strong><span>Recall records</span></div>
                    <div><strong>{vehicleKnowledge.complaintCount ?? "Unknown"}</strong><span>Complaint records</span></div>
                    <div><strong>{vehicleKnowledge.vinRequiredForApplicability ? "VIN required" : "VIN optional"}</strong><span>Recall applicability</span></div>
                  </div>

                  {!!vehicleKnowledge.riskTags?.length && (
                    <div className="buyer-check-pill-list">
                      {vehicleKnowledge.riskTags.slice(0, 10).map((tag) => (
                        <span key={tag}>{formatRiskTag(tag)}</span>
                      ))}
                    </div>
                  )}

                  <ResultList title="Questions to ask the seller" items={vehicleKnowledge.buyerQuestions} />
                  <ResultList title="Seller evidence to request" items={vehicleKnowledge.sellerEvidenceRequests} />
                  <ResultList title="Inspection prompts" items={vehicleKnowledge.inspectionPrompts} />

                  <aside className="product-landing-warning">
                    {vehicleKnowledge.disclaimer || "NHTSA year/make/model data is context only. VIN-level confirmation is required."}
                  </aside>
                </>
              ) : (
                <>
                  <div className="buyer-check-result-header">
                    <div>
                      <p className="product-landing-eyebrow">No pack found yet</p>
                      <h2>{vehicleKnowledge.vehicle?.year} {vehicleKnowledge.vehicle?.make} {vehicleKnowledge.vehicle?.model}</h2>
                    </div>
                  </div>
                  <p>{vehicleKnowledge.message || "No Drivable vehicle knowledge pack found for this year/make/model yet."}</p>
                  <ResultList title="Use these fallback checks" items={fallbackPrompts} />
                </>
              )}
            </section>
          )}
        </section>

        <nav className="product-landing-actions" aria-label="Buyer Check actions">
          <a className="product-landing-action primary" href="/buyer-risk-preview">Open buyer risk review</a>
          <a className="product-landing-action" href="/evidence-checklist">Evidence checklist</a>
          <a className="product-landing-action" href="/help?scenario=buying_vehicle">Ask for help</a>
        </nav>

        <aside className="product-landing-warning">
          Buyer Check is not a certified inspection, title verification, guarantee of vehicle condition, or legal advice.
        </aside>

        <NextActionStrip
          primaryLabel="Open buyer risk review"
          primaryHref="/buyer-risk-preview"
          secondaryHref="/help?scenario=buying_vehicle"
        />
      </section>
    </main>
  );
}
