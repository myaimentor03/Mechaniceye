import { useMemo, useState } from "react";
import "./app.css";

const API_BASE = "https://mechaniceye-backend-v2.onrender.com";
const YEARS = Array.from({ length: 2026 - 1980 + 1 }, (_, i) => String(2026 - i));

const VEHICLE_DATA: Record<string, Record<string, { models: Record<string, string[]> }>> = {
  "2010": {
    Ford: { models: { Edge: ["3.5L", "I Don't Know"], Escape: ["2.5L", "3.0L V6", "I Don't Know"] } },
    Toyota: { models: { Tacoma: ["2.7L", "4.0L V6", "I Don't Know"], Camry: ["2.5L", "3.5L V6", "I Don't Know"] } },
    Honda: { models: { Accord: ["2.4L", "3.5L V6", "I Don't Know"], CRV: ["2.4L", "I Don't Know"] } }
  },
  "2014": {
    Ford: { models: { Escape: ["1.6L", "2.0L", "2.5L", "I Don't Know"], Edge: ["2.0L", "3.5L", "I Don't Know"] } },
    Toyota: { models: { Tacoma: ["2.7L", "4.0L V6", "I Don't Know"], Camry: ["2.5L", "3.5L V6", "I Don't Know"] } },
    Honda: { models: { Accord: ["2.4L", "3.5L V6", "I Don't Know"], CRV: ["2.4L", "I Don't Know"] } }
  },
  "2020": {
    Ford: { models: { F150: ["2.7L EcoBoost", "3.5L EcoBoost", "5.0L V8", "I Don't Know"], Escape: ["1.5L", "2.0L", "Hybrid", "I Don't Know"] } },
    Toyota: { models: { Tacoma: ["2.7L", "3.5L V6", "I Don't Know"], Camry: ["2.5L", "3.5L V6", "Hybrid", "I Don't Know"] } },
    Honda: { models: { Accord: ["1.5L Turbo", "2.0L Turbo", "Hybrid", "I Don't Know"], CRV: ["1.5L Turbo", "I Don't Know"] } }
  },
  "2024": {
    Ford: { models: { F150: ["2.7L EcoBoost", "3.5L EcoBoost", "5.0L V8", "I Don't Know"], Escape: ["1.5L", "2.0L", "Hybrid", "I Don't Know"] } },
    Toyota: { models: { Tacoma: ["2.4L Turbo", "I Don't Know"], Camry: ["2.5L", "3.5L V6", "Hybrid", "I Don't Know"] } },
    Honda: { models: { Accord: ["1.5L Turbo", "2.0L Hybrid", "I Don't Know"], CRV: ["1.5L Turbo", "Hybrid", "I Don't Know"] } }
  }
};

const FALLBACK_MAKES = ["Ford", "Toyota", "Honda", "I Don't Know"];
const FALLBACK_MODELS = ["I Don't Know"];
const FALLBACK_ENGINES = ["I Don't Know"];

const CATEGORIES = [
  "Engine / Performance",
  "Transmission / Drivetrain",
  "Brakes",
  "Steering / Suspension",
  "Electrical",
  "Heating / AC",
  "Starting / Charging",
  "Noise / Vibration",
  "Leak / Smell / Smoke",
  "Warning Lights / Codes",
  "Other"
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

const TRANSMISSION_OPTIONS = ["Automatic", "Manual", "CVT", "Dual-Clutch", "I Don't Know"];
const DRIVETRAIN_OPTIONS = [
  "Front-Wheel Drive (FWD)",
  "Rear-Wheel Drive (RWD)",
  "All-Wheel Drive (AWD)",
  "Four-Wheel Drive (4WD)",
  "I Don't Know"
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

export default function TestBackend() {
  const [page, setPage] = useState<"home" | "intake" | "sell" | "help" | "disclaimer">("home");
  const [step, setStep] = useState<1 | 2>(1);

  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [engine, setEngine] = useState("");
  const [mileage, setMileage] = useState("");
  const [transmission, setTransmission] = useState("");
  const [drivetrain, setDrivetrain] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  const [category, setCategory] = useState("");
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
    return [...Object.keys(VEHICLE_DATA[year]), "I Don't Know"];
  }, [year]);

  const availableModels = useMemo(() => {
    if (!year || !make || make === "I Don't Know") return FALLBACK_MODELS;
    return VEHICLE_DATA[year]?.[make] ? [...Object.keys(VEHICLE_DATA[year][make].models), "I Don't Know"] : FALLBACK_MODELS;
  }, [year, make]);

  const availableEngines = useMemo(() => {
    if (!year || !make || !model || make === "I Don't Know" || model === "I Don't Know") return FALLBACK_ENGINES;
    return VEHICLE_DATA[year]?.[make]?.models[model] || FALLBACK_ENGINES;
  }, [year, make, model]);

  function toggleValue(value: string, values: string[], setValues: (v: string[]) => void) {
    setValues(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  function resetVehicleDependents() {
    setMake("");
    setModel("");
    setEngine("");
  }

  function buildDescriptionBlock() {
    return [
      `Problem Category: ${category || "Not provided"}`,
      `Vehicle: ${year} ${make} ${model}`,
      `Engine: ${engine || "Not provided"}`,
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

    if (!year || !make || !model) {
      setError("Please select the vehicle year, make, and model.");
      return;
    }

    if (!category || !description || !urgency) {
      setError("Please complete the problem category, description, and urgency.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/diagnoses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: buildDescriptionBlock(),
          vehicleInfo: `${year} ${make} ${model} | Engine: ${engine || "N/A"} | Mileage: ${mileage || "N/A"} | Transmission: ${transmission || "N/A"} | Drivetrain: ${drivetrain || "N/A"}`,
          timing: timingSelections.length ? `${timingSelections.join(", ")}${otherTiming ? ` | Other: ${otherTiming}` : ""}` : otherTiming || ""
        })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const data = await res.json();
      setResult(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      setError(err.message || "Submission failed.");
    } finally {
      setLoading(false);
    }
  }

  function IntakePage() {
    return (
      <div className="page-grid">
        <div className="main-column">
          <div className="hero-card">
            <div className="eyebrow">Mechanic&apos;s Eye</div>
            <h1>Organize the problem before you pay for the guess.</h1>
            <p>
              A sharper intake flow for vehicle issues. Capture symptoms, timing, evidence, and vehicle details in a way that actually helps.
            </p>
            <div className="hero-actions">
              <button className="primary-btn" type="button" onClick={() => setStep(1)}>Start Diagnosis Intake</button>
              <button className="secondary-btn" type="button" onClick={() => setPage("sell")}>Sell Your Vehicle As-Is</button>
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
                  <div className="eyebrow">Step {step} of 2</div>
                  <h2>{step === 1 ? "Select Your Vehicle" : "Describe the Issue"}</h2>
                  <p>{step === 1 ? "Use I Don’t Know where needed. We’re building clarity, not punishing people for not being mechanics." : "Capture the issue, the timing, the urgency, and the evidence."}</p>
                </div>
                <div className="progress-wrap">
                  <div className={`progress-dot ${step >= 1 ? "active" : ""}`}></div>
                  <div className={`progress-dot ${step >= 2 ? "active" : ""}`}></div>
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
                    </div>

                    <div className="field">
                      <label>Model</label>
                      <select value={model} onChange={(e) => { setModel(e.target.value); setEngine(""); }}>
                        <option value="">Select model</option>
                        {availableModels.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </div>

                    <div className="field">
                      <label>Engine</label>
                      <select value={engine} onChange={(e) => setEngine(e.target.value)}>
                        <option value="">Select engine</option>
                        {availableEngines.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
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
                    <div className="helper-text">Don’t know every detail? Fill in what you can and keep moving.</div>
                    <button type="button" className="primary-btn" onClick={() => setStep(2)}>Continue to Symptoms</button>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="section-block">
                    <h3>Problem Category</h3>
                    <div className="pill-grid">
                      {CATEGORIES.map((item) => (
                        <button key={item} type="button" className={`pill ${category === item ? "selected" : ""}`} onClick={() => setCategory(item)}>
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="section-block">
                    <h3>Describe the Problem</h3>
                    <textarea
                      rows={7}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe what the vehicle is doing, when it started, whether it is getting worse, what it sounds or feels like, and any recent work that was done."
                    />
                  </div>

                  <div className="section-block">
                    <h3>When Does It Happen?</h3>
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
                    <div className="pill-grid">
                      {URGENCY_OPTIONS.map((item) => (
                        <button key={item} type="button" className={`pill ${urgency === item ? "selected" : ""}`} onClick={() => setUrgency(item)}>
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="section-block">
                    <h3>Evidence Uploads</h3>
                    <div className="upload-grid">
                      <div className="upload-card">
                        <h4>Photos</h4>
                        <p>Warning lights, leaks, damage, visible issues.</p>
                        <input type="file" multiple accept="image/*" onChange={(e) => setPhotoFiles(Array.from(e.target.files || []))} />
                        <FileNames files={photoFiles} />
                      </div>

                      <div className="upload-card">
                        <h4>Audio</h4>
                        <p>Knocking, squealing, grinding, rattling, hissing.</p>
                        <input type="file" multiple accept="audio/*" onChange={(e) => setAudioFiles(Array.from(e.target.files || []))} />
                        <FileNames files={audioFiles} />
                      </div>

                      <div className="upload-card">
                        <h4>Video</h4>
                        <p>Startup, idle, smoke, wobble, visible symptoms.</p>
                        <input type="file" multiple accept="video/*" onChange={(e) => setVideoFiles(Array.from(e.target.files || []))} />
                        <FileNames files={videoFiles} />
                      </div>

                      <div className="upload-card">
                        <h4>Vibration / Motion</h4>
                        <p>Shaking, pulsing, steering wheel or seat vibration.</p>
                        <input type="file" multiple onChange={(e) => setVibrationFiles(Array.from(e.target.files || []))} />
                        <FileNames files={vibrationFiles} />
                      </div>
                    </div>
                  </div>

                  <div className="step-actions">
                    <button type="button" className="secondary-btn" onClick={() => setStep(1)}>Back to Vehicle</button>
                    <button type="submit" className="primary-btn" disabled={loading}>{loading ? "Submitting..." : "Submit for Diagnosis"}</button>
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
            <button className="primary-btn full-btn" type="button" onClick={() => setPage("sell")}>Explore Sell-As-Is</button>
          </div>

          <div className="warning-box">
            If the vehicle is overheating, has low oil pressure, major brake issues, severe knocking, or feels unsafe, stop and get in-person help.
          </div>
        </div>
      </div>
    );
  }

  function HomePage() {
    return (
      <div className="home-wrap">
        <div className="hero-card large">
          <div className="eyebrow">Mechanic&apos;s Eye</div>
          <h1>Smarter vehicle diagnosis starts with a better intake.</h1>
          <p>
            Built to help drivers organize symptoms, capture evidence, and make better repair decisions before spending money blindly.
          </p>
          <div className="hero-actions">
            <button className="primary-btn" onClick={() => setPage("intake")}>Diagnose My Vehicle</button>
            <button className="secondary-btn" onClick={() => setPage("sell")}>Sell My Vehicle As-Is</button>
          </div>
        </div>

        <div className="feature-grid">
          <div className="feature-card"><h3>Structured Intake</h3><p>Year, make, model, timing, urgency, and symptom story gathered in a useful format.</p></div>
          <div className="feature-card"><h3>Evidence Support</h3><p>Photos, audio, video, and vibration inputs that make the platform feel ahead of the curve.</p></div>
          <div className="feature-card"><h3>Practical Direction</h3><p>Designed to help you understand likely causes and prepare for the next real-world step.</p></div>
        </div>
      </div>
    );
  }

  function SellPage() {
    return (
      <div className="simple-page">
        <div className="hero-card">
          <div className="eyebrow">Sell Your Vehicle</div>
          <h1>Don&apos;t want the hassle of fixing it?</h1>
          <p>
            This path can become a serious revenue stream. For now, we’re positioning it visibly and cleanly so the site does more than just diagnosis.
          </p>
        </div>

        <div className="step-card">
          <h2>Sell-As-Is Intake Preview</h2>
          <div className="field-grid">
            <div className="field"><label>Year</label><input placeholder="Vehicle year" /></div>
            <div className="field"><label>Make</label><input placeholder="Vehicle make" /></div>
            <div className="field"><label>Model</label><input placeholder="Vehicle model" /></div>
            <div className="field"><label>Mileage</label><input placeholder="Approximate mileage" /></div>
            <div className="field"><label>Condition</label><input placeholder="Runs / does not run / rough / damaged" /></div>
            <div className="field"><label>Title Status</label><input placeholder="Clean / rebuilt / lost / not sure" /></div>
          </div>
          <div className="step-actions">
            <button className="secondary-btn" type="button" onClick={() => setPage("home")}>Back</button>
            <button className="primary-btn" type="button">Coming Next</button>
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
          <p>Mechanic&apos;s Eye is supposed to reduce confusion, not add more of it.</p>
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
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">Mechanic&apos;s Eye</div>
        <div className="nav">
          <button onClick={() => setPage("home")}>Home</button>
          <button onClick={() => setPage("intake")}>Diagnosis</button>
          <button onClick={() => setPage("sell")}>Sell As-Is</button>
          <button onClick={() => setPage("help")}>Help</button>
          <button onClick={() => setPage("disclaimer")}>Disclaimer</button>
        </div>
      </div>

      <div className="content-shell">
        {page === "home" && <HomePage />}
        {page === "intake" && <IntakePage />}
        {page === "sell" && <SellPage />}
        {page === "help" && <HelpPage />}
        {page === "disclaimer" && <DisclaimerPage />}
      </div>
    </div>
  );
}
