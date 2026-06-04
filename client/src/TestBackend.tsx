import { useMemo, useState } from "react";
import "./app.css";
import Marketplace from "./marketplace/Marketplace";
import { YEARS, VEHICLE_DATA, FALLBACK_MAKES, FALLBACK_MODELS, FALLBACK_ENGINES, TRANSMISSION_OPTIONS, DRIVETRAIN_OPTIONS } from "./data/vehicleData";

const PUBLIC_API_ENDPOINT = "https://mechaniceye-backend-v2.onrender.com/api/diagnoses";
const SUBMISSION_TIMEOUT_MS = 20000;
const CATEGORIES = [
  "No start / hard start",
  "Engine running rough",
  "Noise / rattle / knock / squeal",
  "Warning light / code",
  "Leak / smell / smoke",
  "Overheating",
  "Transmission / shifting",
  "Brakes / steering / suspension",
  "Electrical / battery / charging",
  "Vibration / shaking",
  "Other / not sure"
];

const TIMING_OPTIONS = [
  "Cold Start",
  "Warm Engine",
  "Idle",
  "Acceleration",
  "Braking",
  "Turning",
  "Highway Speed",
  "Over Bumps",
  "Constantly",
  "Intermittently",
  "After Rain",
  "Under Load"
];

const URGENCY_OPTIONS = ["Safe to Drive", "Drive Short Distance Only", "Not Safe to Drive", "Will Not Start"];

function FileNames({ files }: { files: File[] }) {
  if (!files.length) return <div className="upload-note">No files selected yet.</div>;
  return (
    <div className="file-list">
      {files.map((file, index) => (
        <div key={`${file.name}-${index}`} className="file-pill">{file.name}</div>
      ))}
    </div>
  );
}

function EvidenceBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "recommended" | "best" }) {
  return <span className={`evidence-badge ${tone}`}>{children}</span>;
}

function EvidenceCard({
  title,
  helper,
  children,
  badges
}: {
  title: string;
  helper: string;
  children: React.ReactNode;
  badges: React.ReactNode;
}) {
  return (
    <div className="upload-card evidence-card">
      <div className="evidence-card-header">
        <h4>{title}</h4>
        <div className="evidence-badges">{badges}</div>
      </div>
      <p>{helper}</p>
      {children}
    </div>
  );
}

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="legal-block">
      <h3>{title}</h3>
      <div className="legal-copy">{children}</div>
    </div>
  );
}

function InternalReviewDesk() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  async function submitInternalReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const value = (name: string) => String(formData.get(name) || "").trim();
    const payload = {
      caseId: value("caseId"),
      customerName: value("customerName"),
      customerEmail: value("customerEmail"),
      vehicleYear: value("vehicleYear"),
      make: value("make"),
      model: value("model"),
      symptomsSummary: value("symptomsSummary"),
      responseType: value("responseType"),
      confidenceScore: value("confidenceScore"),
      confidenceBand: value("confidenceBand"),
      messageBody: value("messageBody"),
      followUpNeeded: value("followUpNeeded"),
      adminNotes: value("adminNotes")
    };

    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess(false);

    try {
      const response = await fetch("/api/internal-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({ ok: false, error: "Internal review failed." }));

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Internal review failed.");
      }

      setSubmitSuccess(true);
      form.reset();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Internal review failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">Drivable Internal Review</div>
        <div className="nav">
          <button onClick={() => { window.location.href = "/"; }}>Public App</button>
          <button onClick={() => { window.location.href = "/marketplace"; }}>ClearSale</button>
        </div>
      </div>

      <div className="content-shell">
        <div className="simple-page">
          <div className="hero-card">
            <div className="eyebrow">Glenn / Admin</div>
            <h1>Internal Review Desk</h1>
            <p>
              Draft a diagnosis response, question, safety warning, or decline/refund review for Make/Gmail handling.
              This V1 desk does not auto-send customer diagnosis messages.
            </p>
          </div>

          {submitSuccess && (
            <div className="alert-card success">
              <h3>Internal review submitted.</h3>
              <p>Check Make/Gmail draft before sending.</p>
            </div>
          )}

          {submitError && <div className="alert-card warning">{submitError}</div>}

          <form className="step-card" onSubmit={submitInternalReview}>
            <div className="step-header">
              <div>
                <div className="eyebrow">Review Packet</div>
                <h2>Case response details</h2>
                <p>Keep the response clear, cautious, and ready for a human final check before it goes to the customer.</p>
              </div>
            </div>

            <div className="field-grid">
              <div className="field"><label>Case ID</label><input name="caseId" required /></div>
              <div className="field"><label>Customer Name</label><input name="customerName" /></div>
              <div className="field"><label>Customer Email</label><input name="customerEmail" type="email" required /></div>
              <div className="field"><label>Vehicle Year</label><input name="vehicleYear" inputMode="numeric" /></div>
              <div className="field"><label>Make</label><input name="make" /></div>
              <div className="field"><label>Model</label><input name="model" /></div>
              <div className="field">
                <label>Response Type</label>
                <select name="responseType" required>
                  <option value="">Choose response type</option>
                  <option value="QUESTION">QUESTION</option>
                  <option value="DIAGNOSIS">DIAGNOSIS</option>
                  <option value="SAFETY_WARNING">SAFETY_WARNING</option>
                  <option value="DECLINE_OR_REFUND_REVIEW">DECLINE_OR_REFUND_REVIEW</option>
                </select>
              </div>
              <div className="field"><label>Confidence Score</label><input name="confidenceScore" inputMode="decimal" placeholder="Example: 72" /></div>
              <div className="field">
                <label>Confidence Band</label>
                <select name="confidenceBand">
                  <option value="">Choose band</option>
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="UNKNOWN">UNKNOWN</option>
                </select>
              </div>
              <div className="field">
                <label>Follow Up Needed</label>
                <select name="followUpNeeded">
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
            </div>

            <div className="section-block">
              <h3>Symptoms Summary</h3>
              <textarea name="symptomsSummary" rows={4} placeholder="Short summary of what the customer submitted." />
            </div>

            <div className="section-block">
              <h3>Diagnosis / Message Body <span className="required-marker">Required</span></h3>
              <textarea name="messageBody" rows={9} required placeholder="Draft the customer-facing message for Make/Gmail review. Do not guarantee safety, accuracy, repair outcome, or legal result." />
            </div>

            <div className="section-block">
              <h3>Admin Notes</h3>
              <textarea name="adminNotes" rows={5} placeholder="Internal notes for Glenn/admin only." />
            </div>

            <div className="notice-strip">
              V1 creates the internal review handoff only. Check the Make route and Gmail draft before sending anything to the customer.
            </div>

            <div className="step-actions">
              <button className="secondary-btn" type="button" onClick={() => { window.location.href = "/"; }}>Back to App</button>
              <button className="primary-btn" type="submit" disabled={isSubmitting}>{isSubmitting ? "Submitting..." : "Submit Internal Review"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function TestBackend() {
  if (window.location.pathname.startsWith("/marketplace")) {
    return <Marketplace />;
  }

  if (window.location.pathname.replace(/\/$/, "") === "/internal-review") {
    return <InternalReviewDesk />;
  }

  const [page, setPage] = useState<"home" | "intake" | "sell" | "help" | "disclaimer" | "terms" | "privacy">("home");
  const [step, setStep] = useState<1 | 2>(1);

  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
const [model, setModel] = useState("");
const [engine, setEngine] = useState("");
const [manualMake, setManualMake] = useState("");
const [manualModel, setManualModel] = useState("");
const [manualEngine, setManualEngine] = useState("");
  const [mileage, setMileage] = useState("");
  const [transmission, setTransmission] = useState("");
  const [drivetrain, setDrivetrain] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  const [problemCategory, setProblemCategory] = useState("");
  const [description, setDescription] = useState("");
  const [recentRepairs, setRecentRepairs] = useState("");
  const [otherTiming, setOtherTiming] = useState("");
  const [timingSelections, setTimingSelections] = useState<string[]>([]);
  const [urgency, setUrgency] = useState("");

  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [vibrationFiles, setVibrationFiles] = useState<File[]>([]);

  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const availableMakes = useMemo(() => {
  if (!year || !VEHICLE_DATA[year]) return FALLBACK_MAKES;
  return [...Object.keys(VEHICLE_DATA[year]), "Other Make", "I Don't Know"];
}, [year]);

  const availableModels = useMemo(() => {
  if (!year || !make || make === "I Don't Know" || make === "Other Make") return FALLBACK_MODELS;
  return VEHICLE_DATA[year]?.[make]
    ? [...Object.keys(VEHICLE_DATA[year][make].models), "Other Model", "I Don't Know"]
    : FALLBACK_MODELS;
}, [year, make]);

  const availableEngines = useMemo(() => {
  if (!year || !make || !model || make === "I Don't Know" || model === "I Don't Know" || make === "Other Make" || model === "Other Model") return FALLBACK_ENGINES;
  return VEHICLE_DATA[year]?.[make]?.models[model] || FALLBACK_ENGINES;
}, [year, make, model]);

  const bestEvidence = useMemo(() => {
    const value = problemCategory.toLowerCase();

    return {
      photos: value.includes("leak") || value.includes("smell") || value.includes("smoke") || value.includes("warning") || value.includes("electrical"),
      video: value.includes("engine") || value.includes("brake") || value.includes("steering") || value.includes("suspension") || value.includes("leak") || value.includes("smoke") || value.includes("overheating"),
      audio: value.includes("noise") || value.includes("rattle") || value.includes("knock") || value.includes("squeal") || value.includes("vibration") || value.includes("engine") || value.includes("brake") || value.includes("start"),
      vibration: value.includes("vibration") || value.includes("brake") || value.includes("steering") || value.includes("suspension") || value.includes("transmission"),
      written: Boolean(problemCategory)
    };
  }, [problemCategory]);

  function toggleValue(value: string, values: string[], setValues: (v: string[]) => void) {
    setValues(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  function resetVehicleDependents() {
  setMake("");
  setModel("");
  setEngine("");
  setManualMake("");
  setManualModel("");
  setManualEngine("");
}

  function buildDescriptionBlock() {
    return [
      `Problem Category: ${problemCategory || "Not provided"}`,
      `Vehicle: ${year} ${make === "Other Make" ? manualMake : make} ${model === "Other Model" ? manualModel : model}`,
      `Engine: ${(engine === "Other Engine" || engine === "Unknown Engine") ? (manualEngine || engine) : (engine || "Not provided")}`,
      `Mileage: ${mileage || "Not provided"}`,
      `Transmission: ${transmission || "Not provided"}`,
      `Drivetrain: ${drivetrain || "Not provided"}`,
      `Customer Email: ${customerEmail || "Not provided"}`,
      `Urgency / Driveability: ${urgency || "Not provided"}`,
      `When it happens: ${timingSelections.length ? timingSelections.join(", ") : "Not provided"}`,
      `Other timing details: ${otherTiming || "Not provided"}`,
      `Recent repairs: ${recentRepairs || "Not provided"}`,
      "",
      "Customer symptom description:",
      description || "Not provided",
      "",
      "Selected evidence files:",
      `Photos: ${photoFiles.length ? photoFiles.map((f) => f.name).join(", ") : "None"}`,
      `Audio: ${audioFiles.length ? audioFiles.map((f) => f.name).join(", ") : "None"}`,
      `Video: ${videoFiles.length ? videoFiles.map((f) => f.name).join(", ") : "None"}`,
      `Vibration / Motion: ${vibrationFiles.length ? vibrationFiles.map((f) => f.name).join(", ") : "None"}`,
      "",
      "Note: file delivery is not wired yet in this version."
    ].join("\n");
  }

  async function submitDiagnosis(e: React.FormEvent) {
    e.preventDefault();


    if (!problemCategory || !description || !urgency) {
      setError("Please complete the problem category, description, and urgency.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const resolvedMake = make === "Other Make" ? manualMake.trim() : make;
    const resolvedModel = model === "Other Model" ? manualModel.trim() : model;
    const resolvedEngine =
      !engine || engine === "Other Engine" || engine === "Unknown Engine"
        ? (manualEngine.trim() || engine)
        : engine;

    const usedManualVehicleEntry =
      make === "Other Make" ||
      model === "Other Model" ||
      engine === "Other Engine" ||
      engine === "Unknown Engine";

    const unsupportedVehicle =
      make === "Other Make" ||
      model === "Other Model";

    if (!year || !resolvedMake || !resolvedModel) {
      setError("Please select or enter the vehicle year, make, and model.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    const photoFileNames = photoFiles.map((file) => file.name);
    const audioFileNames = audioFiles.map((file) => file.name);
    const videoFileNames = videoFiles.map((file) => file.name);
    const vibrationFileNames = vibrationFiles.map((file) => file.name);

    const payload = {
      problemCategory,
      description: buildDescriptionBlock(),
      vehicleInfo: `${year} ${resolvedMake} ${resolvedModel} | Engine: ${resolvedEngine || "N/A"} | Mileage: ${mileage || "N/A"} | Transmission: ${transmission || "N/A"} | Drivetrain: ${drivetrain || "N/A"}`,
      unsupportedVehicle,
      manualVehicleEntryUsed: usedManualVehicleEntry,
      rawVehicleSelection: {
        year,
        make,
        model,
        engine,
        manualMake,
        manualModel,
        manualEngine,
      },
      photoEvidenceStatus: photoFileNames.length ? "Provided" : "None",
      audioEvidenceStatus: audioFileNames.length ? "Provided" : "None",
      videoEvidenceStatus: videoFileNames.length ? "Provided" : "None",
      vibrationEvidenceStatus: vibrationFileNames.length ? "Provided" : "None",
      photoFileNames,
      audioFileNames,
      videoFileNames,
      vibrationFileNames,
      timing: timingSelections.length ? `${timingSelections.join(", ")}${otherTiming ? ` | Other: ${otherTiming}` : ""}` : otherTiming || ""
    };

    const isLocalBrowser =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    const endpoints = [
      isLocalBrowser ? "/api/diagnoses" : PUBLIC_API_ENDPOINT
    ];

    let lastError = "";

    try {
      for (const endpoint of endpoints) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), SUBMISSION_TIMEOUT_MS);

        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          if (!res.ok) {
            const text = await res.text();
            lastError = `${endpoint} returned HTTP ${res.status}: ${text}`;
            continue;
          }

          const responseText = await res.text();

          if (!responseText.trim()) {
            throw new Error(`${endpoint} returned an empty response.`);
          }

          const data = JSON.parse(responseText);

          setResult(data);
          setError("");
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        } catch (err: any) {
          const message =
            err?.name === "AbortError"
              ? `Request timed out after ${SUBMISSION_TIMEOUT_MS / 1000} seconds. Please try again.`
              : err.message || String(err);

          lastError = `${endpoint} failed: ${message}`;
        } finally {
          window.clearTimeout(timeoutId);
        }
      }

      throw new Error(lastError || "Submission failed.");
    } catch (err: any) {
      setError(err.message || "Submission failed.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setLoading(false);
    }
  }
  function HomePage() {
    return (
      <div className="home-wrap">
        <div className="home-hero">
          <div className="hero-brand">Drivable by Mechanic&apos;s Eye</div>
          <h1 className="hero-title">Know what to do before you spend money on repairs.</h1>
          <p className="hero-subtitle">
            A sharper way to understand vehicle problems, decide whether to fix them, and choose your next move without walking in blind.
          </p>
        </div>

        <div className="offer-section">
          <div className="offer-intro">
            <div className="eyebrow">Choose Your Next Step</div>
            <h2>Two clear ways forward</h2>
            <p>
              Whether you want answers or you want out, start with the path that fits your situation best.
            </p>
          </div>

          <div className="offer-grid">
            <button className="offer-card offer-card-primary" onClick={() => setPage("intake")}>
              <div className="offer-topline">Drivable Check</div>
              <div className="offer-title">Find Out What&apos;s Wrong</div>
              <div className="offer-copy">Capture symptoms, timing, sounds, photos, video, and more before spending money on guesswork.</div>
              <div className="offer-action">Start Drivable Check</div>
            </button>

            <button className="offer-card offer-card-primary" onClick={() => { window.location.href = "/marketplace/sell"; }}>
              <div className="offer-topline">ClearSale</div>
              <div className="offer-title">Don&apos;t Want to Fix It?</div>
              <div className="offer-copy">See whether your vehicle may be a fit to sell as-is instead of pouring more time and money into it.</div>
              <div className="offer-action">See My Options</div>
            </button>
          </div>
        </div>

        <div className="feature-grid">
          <div className="feature-card"><h3>Structured Intake</h3><p>Year, make, model, timing, urgency, and symptom story gathered in a useful format.</p></div>
          <div className="feature-card"><h3>Evidence Support</h3><p>Photos, audio, video, and vibration inputs that make the platform feel ahead of the curve.</p></div>
          <div className="feature-card"><h3>Practical Direction</h3><p>Designed to help you understand likely causes and prepare for the next real-world step.</p></div>
        </div>

        <div className="feature-card">
          <h3>Important Safety Note</h3>
          <p>
            Mechanic&apos;s Eye is designed to improve clarity and decision-making. It does not replace in-person inspection, manufacturer procedures, or immediate roadside safety judgment when a vehicle feels dangerous to drive.
          </p>
        </div>
      </div>
    );
  }

  function IntakePage() {
    return (
      <div className="page-grid">
        <div className="main-column">
          <div className="hero-card">
            <div className="eyebrow">Drivable Check</div>
            <h1>Organize the problem before you pay for the guess.</h1>
            <p>
              Guided First Check helps you submit the basics first: vehicle details, what is happening, when it happens, urgency, and any safe evidence you can capture.
              It helps Mechanic&apos;s Eye review the case without promising safety, diagnosis accuracy, repair outcome, or replacing an in-person mechanic.
            </p>
            <div className="hero-actions">
              <button className="primary-btn" type="button" onClick={() => setStep(1)}>Start Drivable Check</button>
              <button className="secondary-btn" type="button" onClick={() => { window.location.href = "/marketplace/sell"; }}>Start ClearSale</button>
            </div>
          </div>

          <div className="guided-grid">
            <div className="info-card">
              <div className="eyebrow">Guided First Check</div>
              <h3>What makes a good submission?</h3>
              <ul>
                <li>Year, make, and model.</li>
                <li>Warning lights, dashboard messages, or codes.</li>
                <li>When it happens: startup, idle, braking, turning, highway speed, or after rain.</li>
                <li>Sound, video, or photos if safe to collect.</li>
                <li>What changed recently: repairs, parts, weather, fluids, jump start, or accident.</li>
                <li>What has already been checked.</li>
              </ul>
            </div>

            <div className="warning-box">
              Safety first: do not drive, record, crawl under, open hot parts, or test anything if the vehicle feels unsafe.
              If there is smoke, fire risk, fuel leak, low oil pressure, overheating, brake failure, severe steering issue, or major knocking, stop and get in-person help.
            </div>
          </div>

          {error && <div className="alert-card warning">{error}</div>}

          {result && (
            <div className="alert-card success">
              <h3>Submission Received</h3>
              <p><strong>Status:</strong> {result.status}</p>
              <p><strong>Request ID:</strong> {result.id}</p>
              <p>This request reached the live backend. Next step is wiring email and file delivery.</p>
            </div>
          )}

          <form onSubmit={submitDiagnosis}>
            <div className="step-card">
              <div className="step-header">
                <div>
                  <div className="eyebrow">Guided First Check - Step {step} of 2</div>
                  <h2>{step === 1 ? "Select Your Vehicle" : "Describe the Issue"}</h2>
                  <p>{step === 1 ? "Start with year, make, model, mileage, and follow-up email. Use I Don’t Know where needed." : "Capture symptoms, timing, urgency, warning lights, recent changes, and safe evidence."}</p>
                </div>
                <div className="progress-wrap">
                  <div className={`progress-dot ${step >= 1 ? "active" : ""}`}>Vehicle</div>
                  <div className={`progress-dot ${step >= 2 ? "active" : ""}`}>Symptoms</div>
                </div>
              </div>

              {step === 1 && (
                <>
                  <div className="field-grid">
                    <div className="field">
                      <label>Year</label>
                      <select value={year} onChange={(e) => { setYear(e.target.value); resetVehicleDependents(); }}>
                        <option value="">Select year</option>
                        {YEARS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </div>

                    <div className="field">
                      <label>Make</label>
                      <select value={make} onChange={(e) => { setMake(e.target.value); setModel(""); setEngine(""); }}>
                        <option value="">Select make</option>
                        {availableMakes.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      {make === "Other Make" && (
                        <>
                          <label>Manual Make</label>
                          <input value={manualMake} onChange={(e) => setManualMake(e.target.value)} placeholder="Type vehicle make" />
                        </>
                      )}
                    </div>

                    <div className="field">
                      <label>Model</label>
                      <select value={model} onChange={(e) => { setModel(e.target.value); setEngine(""); }}>
                        <option value="">Select model</option>
                        {availableModels.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      {model === "Other Model" && (
                        <>
                          <label>Manual Model</label>
                          <input value={manualModel} onChange={(e) => setManualModel(e.target.value)} placeholder="Type vehicle model" />
                        </>
                      )}
                    </div>

                    <div className="field">
                      <label>Engine</label>
                      <select value={engine} onChange={(e) => setEngine(e.target.value)}>
                        <option value="">Select engine</option>
                        {availableEngines.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      {(engine === "Other Engine" || engine === "Unknown Engine" || make === "Other Make" || model === "Other Model") && (
                        <>
                          <label>Manual Engine</label>
                          <input value={manualEngine} onChange={(e) => setManualEngine(e.target.value)} placeholder="Type engine if known" />
                        </>
                      )}
                    </div>

                    <div className="field">
                      <label>Mileage</label>
                      <input value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="Optional" />
                    </div>

                    <div className="field">
                      <label>Transmission</label>
                      <select value={transmission} onChange={(e) => setTransmission(e.target.value)}>
                        <option value="">Select transmission</option>
                        {TRANSMISSION_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </div>

                    <div className="field">
                      <label>Drivetrain / Drive Type</label>
                      <select value={drivetrain} onChange={(e) => setDrivetrain(e.target.value)}>
                        <option value="">Select drivetrain</option>
                        {DRIVETRAIN_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </div>

                    <div className="field">
                      <label>Email for Follow-Up</label>
                      <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Optional for now" />
                    </div>
                  </div>

                  <div className="step-actions">
                    <div className="helper-text">Missing key details may delay your review. Fill in what you know and use the next step for timing, warning lights, and evidence.</div>
                    <button type="button" className="primary-btn" onClick={() => setStep(2)}>Continue to Symptoms</button>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="section-block">
                    <h3>Problem Category <span className="required-marker">Required</span></h3>
                    <p className="section-intro">Pick the closest category. This helps route the review and decide what evidence matters most.</p>
                    <div className="pill-grid">
                      {CATEGORIES.map((item) => (
                        <button key={item} type="button" className={`pill ${problemCategory === item ? "selected" : ""}`} onClick={() => setProblemCategory(item)}>
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="section-block">
                    <h3>When Does It Happen?</h3>
                    <p className="section-intro">Timing is often the difference between a useful review and more follow-up questions.</p>
                    <div className="pill-grid">
                      {TIMING_OPTIONS.map((item) => (
                        <button key={item} type="button" className={`pill ${timingSelections.includes(item) ? "selected" : ""}`} onClick={() => toggleValue(item, timingSelections, setTimingSelections)}>
                          {item}
                        </button>
                      ))}
                    </div>
                    <input className="top-gap" value={otherTiming} onChange={(e) => setOtherTiming(e.target.value)} placeholder="Other timing details" />
                  </div>

                  <div className="section-block">
                    <h3>Recent Repairs or Replaced Parts</h3>
                    <textarea
                      rows={4}
                      value={recentRepairs}
                      onChange={(e) => setRecentRepairs(e.target.value)}
                      placeholder="Optional. Include recent repairs, part replacements, or anything that changed before the issue started."
                    />
                  </div>

                  <div className="section-block">
                    <h3>Urgency / Driveability</h3>
                    <p className="section-intro">This does not determine whether the vehicle is safe. Use your own judgment and get in-person help if anything feels dangerous.</p>
                    <div className="pill-grid">
                      {URGENCY_OPTIONS.map((item) => (
                        <button key={item} type="button" className={`pill ${urgency === item ? "selected" : ""}`} onClick={() => setUrgency(item)}>
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="section-block evidence-section">
                    <div className="section-heading-row">
                      <div>
                        <h3>Diagnostic Evidence</h3>
                        <p className="section-intro">
                          Upload the same kind of evidence a mechanic would ask for: photos, video, sound, vibration/motion context, and a clear symptom description.
                        </p>
                      </div>
                    </div>

                    <div className="notice-strip evidence-reassurance">
                      You do not need every evidence type. Send what you safely can. More evidence usually improves the review.
                    </div>

                    <div className="upload-grid">
                      <EvidenceCard
                        title="Written Symptoms"
                        helper="Tell us what happens, when it happens, what changed recently, warning lights, smells, leaks, smoke, and what you already checked."
                        badges={
                          <>
                            <EvidenceBadge tone="recommended">Recommended</EvidenceBadge>
                            {bestEvidence.written && <EvidenceBadge tone="best">Best evidence for this symptom</EvidenceBadge>}
                          </>
                        }
                      >
                        <textarea
                          rows={7}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Describe what the vehicle is doing, when it started, whether it is getting worse, what it sounds or feels like, and any recent work that was done."
                        />
                      </EvidenceCard>

                      <EvidenceCard
                        title="Photos"
                        helper="Upload warning lights, leaks, damaged parts, dashboard messages, fluid color, or visible movement."
                        badges={
                          <>
                            <EvidenceBadge>Optional</EvidenceBadge>
                            {bestEvidence.photos && <EvidenceBadge tone="best">Best evidence for this symptom</EvidenceBadge>}
                          </>
                        }
                      >
                        <input type="file" multiple accept="image/*" onChange={(e) => setPhotoFiles(Array.from(e.target.files || []))} />
                        <FileNames files={photoFiles} />
                      </EvidenceCard>

                      <EvidenceCard
                        title="Video"
                        helper="Best for cold starts, idle problems, smoke, exhaust behavior, shaking, belt/pulley movement, and driving symptoms. MP4 preferred, under 45 seconds."
                        badges={
                          <>
                            <EvidenceBadge>Optional</EvidenceBadge>
                            {bestEvidence.video && <EvidenceBadge tone="best">Best evidence for this symptom</EvidenceBadge>}
                          </>
                        }
                      >
                        <input type="file" multiple accept="video/*" onChange={(e) => setVideoFiles(Array.from(e.target.files || []))} />
                        <FileNames files={videoFiles} />
                      </EvidenceCard>

                      <EvidenceCard
                        title="Sound / Audio"
                        helper="Best for knocks, ticks, squeals, grinding, rattles, misfires, and start-up noises. Record with radio/fans off when safe."
                        badges={
                          <>
                            <EvidenceBadge>Optional</EvidenceBadge>
                            {bestEvidence.audio && <EvidenceBadge tone="best">Best evidence for this symptom</EvidenceBadge>}
                          </>
                        }
                      >
                        <input type="file" multiple accept="audio/*" onChange={(e) => setAudioFiles(Array.from(e.target.files || []))} />
                        <FileNames files={audioFiles} />
                      </EvidenceCard>

                      <EvidenceCard
                        title="Vibration / Motion"
                        helper="Use video/audio plus context. Tell us where you feel it, when it happens, speed/RPM, braking/turning/accelerating, and severity."
                        badges={
                          <>
                            <EvidenceBadge>Optional</EvidenceBadge>
                            {bestEvidence.vibration && <EvidenceBadge tone="best">Best evidence for this symptom</EvidenceBadge>}
                          </>
                        }
                      >
                        <input type="file" multiple accept="video/*,audio/*" onChange={(e) => setVibrationFiles(Array.from(e.target.files || []))} />
                        <FileNames files={vibrationFiles} />
                      </EvidenceCard>
                    </div>
                  </div>

                  <div className="notice-strip">
                    By submitting, you understand that Mechanic&apos;s Eye provides informational guidance only and is not a substitute for hands-on inspection, emergency advice, or in-person safety judgment.
                  </div>

                  <div className="notice-strip capacity-notice">
                    Missing key details may delay your review. Reviews are handled in the order received. Priority options may be reviewed sooner. If review volume is high, some cases may require more time or more information before review.
                  </div>

                  <div className="step-actions">
                    <button type="button" className="secondary-btn" onClick={() => setStep(1)}>Back to Vehicle</button>
                    <button type="submit" className="primary-btn" disabled={loading}>{loading ? "Submitting..." : "Submit Drivable Check"}</button>
                  </div>
                </>
              )}
            </div>
          </form>
        </div>

        <div className="side-column">
          <div className="info-card">
            <div className="eyebrow">Why it matters</div>
            <h3>Reduce diagnostic guesswork</h3>
            <ul>
              <li>Organize symptoms before you approve repairs.</li>
              <li>Capture evidence in one place.</li>
              <li>Prepare for a more focused shop conversation.</li>
              <li>Build a better repair decision path.</li>
            </ul>
          </div>

          <div className="info-card">
            <div className="eyebrow">Other paths</div>
            <h3>Not worth fixing?</h3>
            <p>You may be able to sell the vehicle as-is instead of sinking more money into it.</p>
            <button className="primary-btn full-btn" type="button" onClick={() => { window.location.href = "/marketplace/sell"; }}>Explore ClearSale</button>
          </div>

          <div className="warning-box">
            If the vehicle is overheating, has low oil pressure, major brake issues, severe knocking, or feels unsafe, stop and get in-person help.
          </div>
        </div>
      </div>
    );
  }

  function SellPage() {
    return (
      <div className="simple-page">
        <div className="hero-card">
          <div className="eyebrow">ClearSale</div>
          <h1>Don&apos;t want the hassle of fixing it, diagnosing it, or dealing with flaky buyers?</h1>
          <p>
            If your vehicle is no longer worth repairing, or you simply do not want to deal with the time,
            cost, and uncertainty, submit the details below. If it looks like a fit, we may be able to
            connect it with interested buyers in your area.
          </p>
        </div>

        <div className="step-card">
          <h2>ClearSale Review Request</h2>
          <p className="helper-text">
            Submitting your vehicle does not guarantee a purchase offer. It helps us review whether there may
            be a fit with buyers in your area.
          </p>

          <div className="field-grid">
            <div className="field">
              <label>Year</label>
              <input placeholder="Vehicle year" />
            </div>

            <div className="field">
              <label>Make</label>
              <input placeholder="Vehicle make" />
            </div>

            <div className="field">
              <label>Model</label>
              <input placeholder="Vehicle model" />
            </div>

            <div className="field">
              <label>Approximate Mileage</label>
              <input placeholder="Approximate mileage" />
            </div>

            <div className="field">
              <label>Current Condition</label>
              <input placeholder="Runs / does not run / rough / damaged" />
            </div>

            <div className="field">
              <label>Does It Run?</label>
              <input placeholder="Yes / No / Sometimes" />
            </div>

            <div className="field">
              <label>Title Status</label>
              <input placeholder="Clean / rebuilt / lost / not sure" />
            </div>

            <div className="field">
              <label>Main Problem or Reason for Selling</label>
              <input placeholder="What is wrong with it or why are you selling it?" />
            </div>

            <div className="field">
              <label>City</label>
              <input placeholder="City" />
            </div>

            <div className="field">
              <label>State</label>
              <input placeholder="State" />
            </div>

            <div className="field">
              <label>ZIP Code</label>
              <input placeholder="ZIP Code" />
            </div>

            <div className="field">
              <label>Best Contact Name</label>
              <input placeholder="Your name" />
            </div>

            <div className="field">
              <label>Best Contact Email</label>
              <input placeholder="Your email" />
            </div>

            <div className="field">
              <label>Best Contact Phone</label>
              <input placeholder="Your phone number" />
            </div>

            <div className="field">
              <label>Upload Photos</label>
              <input type="file" multiple accept="image/*" />
            </div>
          </div>

          <div className="notice-strip">
            Submission does not guarantee an offer or purchase. Vehicle review depends on condition, marketability, location, and whether the seller has the legal right to sell the vehicle.
          </div>

          <div className="step-actions">
            <button className="secondary-btn" type="button" onClick={() => setPage("home")}>Back</button>
            <button className="primary-btn" type="button">Submit Vehicle for Review</button>
          </div>
        </div>
      </div>
    );
  }

  function HelpPage() {
    return (
      <div className="simple-page">
        <div className="hero-card">
          <div className="eyebrow">Help / FAQ</div>
          <h1>Use what you know. Skip what you don&apos;t.</h1>
          <p>Drivable by Mechanic&apos;s Eye is supposed to reduce confusion, not add more of it.</p>
        </div>
        <div className="faq-grid">
          <div className="faq-card"><h3>What if I don’t know my engine?</h3><p>Use the I Don&apos;t Know option where available and keep going.</p></div>
          <div className="faq-card"><h3>What uploads help most?</h3><p>Photos, sounds, videos, and vibration clues all help paint a better diagnostic picture.</p></div>
          <div className="faq-card"><h3>Can this replace a hands-on inspection?</h3><p>No. It improves clarity and direction, but some problems still require real testing.</p></div>
        </div>
      </div>
    );
  }

  function DisclaimerPage() {
    return (
      <div className="simple-page">
        <div className="hero-card">
          <div className="eyebrow">Disclaimer</div>
          <h1>Informational guidance, not a substitute for physical inspection.</h1>
          <p>Use caution. Safety-critical vehicle problems still require real-world judgment and in-person help.</p>
        </div>

        <div className="legal-card">
          <LegalSection title="General Use">
            <p>Mechanic&apos;s Eye provides informational guidance based on the details submitted by the user. It does not replace hands-on inspection, professional testing, manufacturer procedures, or in-person diagnosis.</p>
          </LegalSection>
          <LegalSection title="Safety Warning">
            <p>If a vehicle has severe brake problems, overheating, low oil pressure, active smoke, fuel leaks, fire risk, major steering failure, or feels unsafe to drive, stop and seek qualified in-person help.</p>
          </LegalSection>
          <LegalSection title="No Guaranteed Outcome">
            <p>Suggestions, likely causes, or next-step guidance may be incomplete or incorrect if the submitted information is incomplete, inaccurate, or missing key test data.</p>
          </LegalSection>
          <LegalSection title="User Responsibility">
            <p>The user remains responsible for decisions related to driving, repair authorization, parts purchases, towing, inspections, and vehicle sale activity.</p>
          </LegalSection>
        </div>
      </div>
    );
  }

  function TermsPage() {
    return (
      <div className="simple-page">
        <div className="hero-card">
          <div className="eyebrow">Terms & Conditions</div>
          <h1>Rules for using Drivable by Mechanic&apos;s Eye.</h1>
          <p>Plain-English protection, because pretending people read mystery legal sludge has never improved civilization.</p>
        </div>

        <div className="legal-card">
          <LegalSection title="Acceptance of Terms">
            <p>By using this website, submitting information, or interacting with Drivable by Mechanic&apos;s Eye services, you agree to these terms.</p>
          </LegalSection>

          <LegalSection title="Informational Use Only">
            <p>Drivable by Mechanic&apos;s Eye is intended to provide informational vehicle guidance and intake support, backed by Mechanic&apos;s Eye as the diagnostic authority. It is not a licensed inspection station, emergency service, or guarantee of repair accuracy.</p>
          </LegalSection>

          <LegalSection title="User-Submitted Information">
            <p>You are responsible for the accuracy of the information, files, photos, videos, and descriptions you submit. Inaccurate or incomplete information may affect the usefulness of any response or review.</p>
          </LegalSection>

          <LegalSection title="Acceptable Use">
            <p>You agree not to submit unlawful, harmful, infringing, abusive, fraudulent, or unrelated material. You should only upload content you have the right to share.</p>
          </LegalSection>

          <LegalSection title="No Guarantee of Availability or Outcome">
            <p>We do not guarantee uninterrupted access, permanent storage of uploads, a specific diagnosis result, a specific repair outcome, or a purchase offer for any vehicle submitted through the platform.</p>
          </LegalSection>

          <LegalSection title="Vehicle Sale Leads">
            <p>Submitting a vehicle through ClearSale to sell your vehicle as-is does not create an obligation to buy, make an offer, or connect you with a buyer. Any possible interest depends on condition, location, marketability, and lawful ownership.</p>
          </LegalSection>

          <LegalSection title="Limitation of Liability">
            <p>To the fullest extent allowed by law, Mechanic&apos;s Eye is not liable for losses, damages, repair costs, towing costs, downtime, missed opportunities, vehicle failures, or other consequences arising from reliance on submitted guidance or platform content.</p>
          </LegalSection>

          <LegalSection title="Changes to the Platform or Terms">
            <p>We may update, revise, limit, or discontinue parts of the website, services, workflows, or these terms at any time.</p>
          </LegalSection>
        </div>
      </div>
    );
  }

  function PrivacyPage() {
    return (
      <div className="simple-page">
        <div className="hero-card">
          <div className="eyebrow">Privacy Policy</div>
          <h1>What information may be collected and how it may be used.</h1>
          <p>Because once people upload names, locations, media, and vehicle details, pretending privacy is optional becomes a terrible idea.</p>
        </div>

        <div className="legal-card">
          <LegalSection title="Information You May Submit">
            <p>This may include your name, email, phone number, location, vehicle details, symptom descriptions, and media such as photos, audio, video, or other evidence.</p>
          </LegalSection>

          <LegalSection title="How Information May Be Used">
            <p>Submitted information may be used to review vehicle issues, organize intake requests, evaluate ClearSale leads, improve the service workflow, communicate with you, and support future platform operations.</p>
          </LegalSection>

          <LegalSection title="Third-Party Services">
            <p>Some submissions, payments, media handling, hosting, or workflow automation may be processed using third-party platforms or service providers as the system evolves.</p>
          </LegalSection>

          <LegalSection title="Payment Handling">
            <p>If payments are used, they may be handled by third-party payment providers. Mechanic&apos;s Eye should not be treated as the direct vault for full payment card information unless explicitly stated.</p>
          </LegalSection>

          <LegalSection title="Media and Uploads">
            <p>Do not upload sensitive personal documents or unrelated material unless specifically requested. Uploaded media may be reviewed to support diagnosis, lead routing, or platform operations.</p>
          </LegalSection>

          <LegalSection title="Data Retention and Protection">
            <p>We may retain submission records for operational, support, or business purposes. While reasonable efforts may be made to handle information responsibly, no online system should be treated as perfectly immune from risk.</p>
          </LegalSection>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">Drivable by Mechanic&apos;s Eye</div>
        <div className="nav">
          <button onClick={() => setPage("home")}>Home</button>
          <button onClick={() => setPage("intake")}>Drivable Check</button>
          <button onClick={() => { window.location.href = "/marketplace/sell"; }}>ClearSale</button>
          <button onClick={() => { window.location.href = "/marketplace/browse"; }}>Buyer Check</button>
          <button onClick={() => setPage("help")}>Mechanic Match</button>
          <button onClick={() => setPage("disclaimer")}>Mechanic&apos;s Eye Review</button>
          <button onClick={() => setPage("help")}>Help</button>
          <button onClick={() => setPage("disclaimer")}>Disclaimer</button>
          <button onClick={() => setPage("terms")}>Terms</button>
          <button onClick={() => setPage("privacy")}>Privacy</button>
        </div>
      </div>

      <div className="content-shell">
        {page === "home" && HomePage()}
        {page === "intake" && IntakePage()}
        {page === "sell" && SellPage()}
        {page === "help" && HelpPage()}
        {page === "disclaimer" && DisclaimerPage()}
        {page === "terms" && TermsPage()}
        {page === "privacy" && PrivacyPage()}
      </div>
    </div>
  );
}









