import { useMemo, useState } from "react";
import "./app.css";
import { YEARS, VEHICLE_DATA, FALLBACK_MAKES, FALLBACK_MODELS, FALLBACK_ENGINES, TRANSMISSION_OPTIONS, DRIVETRAIN_OPTIONS } from "./data/vehicleData";

const API_BASE = "https://mechaniceye-backend-v2.onrender.com";
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

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="legal-block">
      <h3>{title}</h3>
      <div className="legal-copy">{children}</div>
    </div>
  );
}

export default function TestBackend() {
  const [page, setPage] = useState<"home" | "intake" | "sell" | "help" | "disclaimer" | "terms" | "privacy">("home");
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
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (!category || !description || !urgency) {
      setError("Please complete the problem category, description, and urgency.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    const payload = {
      description: buildDescriptionBlock(),
      vehicleInfo: `${year} ${make} ${model} | Engine: ${engine || "N/A"} | Mileage: ${mileage || "N/A"} | Transmission: ${transmission || "N/A"} | Drivetrain: ${drivetrain || "N/A"}`,
      timing: timingSelections.length ? `${timingSelections.join(", ")}${otherTiming ? ` | Other: ${otherTiming}` : ""}` : otherTiming || ""
    };

    const endpoints = [
      `${API_BASE}/api/diagnoses`,
      "/api/diagnoses"
    ];

    let lastError = "";

    try {
      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

          if (!res.ok) {
            const text = await res.text();
            lastError = `${endpoint} returned HTTP ${res.status}: ${text}`;
            continue;
          }

          const data = await res.json();
          setResult(data);
          setError("");
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        } catch (err: any) {
          lastError = `${endpoint} failed: ${err.message || String(err)}`;
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
          <div className="hero-brand">Mechanic&apos;s Eye</div>
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
              <div className="offer-topline">Vehicle Diagnosis</div>
              <div className="offer-title">Find Out What&apos;s Wrong</div>
              <div className="offer-copy">Capture symptoms, timing, sounds, photos, video, and more before spending money on guesswork.</div>
              <div className="offer-action">Start My Diagnosis</div>
            </button>

            <button className="offer-card offer-card-primary" onClick={() => setPage("sell")}>
              <div className="offer-topline">Sell-As-Is Option</div>
              <div className="offer-title">Don&apos;t Want to Fix It?</div>
              <div className="offer-copy">See whether your vehicle may be a fit for an as-is sale instead of pouring more time and money into it.</div>
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

                  <div className="notice-strip">
                    By submitting, you understand that Mechanic&apos;s Eye provides informational guidance only and is not a substitute for hands-on inspection, emergency advice, or in-person safety judgment.
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

  function SellPage() {
    return (
      <div className="simple-page">
        <div className="hero-card">
          <div className="eyebrow">Sell Your Vehicle As-Is</div>
          <h1>Don&apos;t want the hassle of fixing it, diagnosing it, or dealing with flaky buyers?</h1>
          <p>
            If your vehicle is no longer worth repairing, or you simply do not want to deal with the time,
            cost, and uncertainty, submit the details below. If it looks like a fit, we may be able to
            connect it with interested buyers in your area.
          </p>
        </div>

        <div className="step-card">
          <h2>Vehicle Review Request</h2>
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
          <h1>Rules for using the Mechanic&apos;s Eye platform.</h1>
          <p>Plain-English protection, because pretending people read mystery legal sludge has never improved civilization.</p>
        </div>

        <div className="legal-card">
          <LegalSection title="Acceptance of Terms">
            <p>By using this website, submitting information, or interacting with Mechanic&apos;s Eye services, you agree to these terms.</p>
          </LegalSection>

          <LegalSection title="Informational Use Only">
            <p>Mechanic&apos;s Eye is intended to provide informational vehicle guidance and intake support. It is not a licensed inspection station, emergency service, or guarantee of repair accuracy.</p>
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
            <p>Submitting a vehicle for as-is review does not create an obligation to buy, make an offer, or connect you with a buyer. Any possible interest depends on condition, location, marketability, and lawful ownership.</p>
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
            <p>Submitted information may be used to review vehicle issues, organize intake requests, evaluate sell-as-is leads, improve the service workflow, communicate with you, and support future platform operations.</p>
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
        <div className="brand">Mechanic&apos;s Eye</div>
        <div className="nav">
          <button onClick={() => setPage("home")}>Home</button>
          <button onClick={() => setPage("intake")}>Diagnosis</button>
          <button onClick={() => setPage("sell")}>Sell As-Is</button>
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





