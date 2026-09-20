import { useEffect, useState } from "react";
import { navigateFrontend } from "../frontendRouting";

type DecisionPacket = {
  outcome: string;
  decisionPath?: string;
  confidenceLevel: string;
  confidenceScore: number;
  riskLevel: string;
  safetyTriggered: boolean;
  vehicleInfo: string;
  summary: string;
  evidenceSummary: {
    photos: number;
    audio: number;
    video: number;
    vibration: number;
    text: number;
    persistedCount: number;
  };
  matchedSymptoms: {
    label: string;
    confidence: number;
    possibleRiskLevel: string;
    safetyNote: string | null;
  }[];
  guidance: {
    title: string;
    description: string;
    immediateSteps: string[];
    whatToShare: string[];
    warnings: string[];
    followUp: string[];
  };
  evidenceBelongsToCase: boolean;
  reusableForFixSell: boolean;
};

type JourneyCaseResponse = {
  id: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  vehicleInfo: string;
  description: string;
  timing?: string;
  urgency?: string;
  canDrive?: string;
  safetyTriggered: boolean;
  safetyFlags: { triggerId: string; label: string; matchedPhrase?: string }[];
  confidenceScore: number;
  confidenceLevel: string;
  riskLevel: string;
  outcome?: string;
  decisionPath?: string;
  humanReviewRequested: boolean;
  escalationReason?: string;
  nextAction?: string;
  nextActionPrompt?: string;
  evidenceCount: number;
  evidenceTypes: string[];
  evidence?: {
    id: string;
    kind: string;
    addedAt: string;
    description?: string;
    originalName?: string;
    mimeType?: string;
    byteSize?: number;
    storageKey?: string;
    attachmentId?: string;
    status?: string;
  }[];
  evidencePersistence?: { persistedCount: number; textOnlyCount: number };
  matchedSymptomCategories: {
    symptomCategoryId: string;
    label: string;
    confidence: number;
    matchedPhrases: string[];
    possibleRiskLevel: string;
    safetyNote: string | null;
    humanReviewRecommended: boolean;
    recommendedInitialPath: string | null;
    commonEvidenceNeeded: string | null;
  }[];
  plannedEvidence: {
    evidenceId: string;
    label: string;
    description: string | null;
    evidenceType: string | null;
    safeCaptureInstructions: string | null;
    unsafeCaptureWarning: string | null;
    priority: string;
    customerPromptText: string | null;
    relevanceScore: number;
  }[];
  currentEvidencePrompt?: string;
  decisionPacket?: DecisionPacket;
};

const STORAGE_KEY = "drivable.journey.caseId";

export function GuidedJourney() {
  const [auth, setAuth] = useState<{ ok: boolean; user: { email: string; id: string } | null } | null>(null);
  const [caseData, setCaseData] = useState<JourneyCaseResponse | null>(null);
  const [myCases, setMyCases] = useState<JourneyCaseResponse[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [evidenceKind, setEvidenceKind] = useState("text");
  const [evidenceDesc, setEvidenceDesc] = useState("");
  const [photoFiles, setPhotoFiles] = useState<FileList | null>(null);
  const [audioFiles, setAudioFiles] = useState<FileList | null>(null);
  const [videoFiles, setVideoFiles] = useState<FileList | null>(null);
  const [vibrationFiles, setVibrationFiles] = useState<FileList | null>(null);

  // intake form state
  const [vehicleInfo, setVehicleInfo] = useState("");
  const [description, setDescription] = useState("");
  const [timing, setTiming] = useState("");
  const [urgency, setUrgency] = useState("Safe to Drive");
  const [canDrive, setCanDrive] = useState("Yes");

  async function fetchAuth() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      const data = await res.json();
      setAuth(data);
    } catch {
      setAuth({ ok: true, user: null });
    }
  }

  async function fetchCase(caseId: string) {
    const res = await fetch(`/api/journey/${caseId}/status`, { credentials: "include" });
    if (!res.ok) throw new Error("Case not found or not yours.");
    const data = await res.json();
    setCaseData(data);
    window.localStorage.setItem(STORAGE_KEY, data.id);
  }

  async function fetchMyCases() {
    try {
      const res = await fetch("/api/journey/my-cases", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok && Array.isArray(data.cases)) setMyCases(data.cases);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchAuth();
  }, []);

  useEffect(() => {
    if (!auth?.user) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      fetchCase(stored).catch(() => fetchMyCases());
    } else {
      fetchMyCases();
    }
  }, [auth]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/journey/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleInfo, description, timing, urgency, canDrive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start journey.");
      setCaseData(data);
      window.localStorage.setItem(STORAGE_KEY, data.id);
      if (data.state === "intake") {
        try {
          const adv = await fetch(`/api/journey/${data.id}/advance`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transition: "submit_intake" }),
          });
          const advData = await adv.json();
          if (adv.ok) setCaseData(advData);
        } catch { /* will remain in intake; user can retry */ }
      }
      await fetchMyCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Start failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdvance(transition: string) {
    if (!caseData) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/journey/${caseData.id}/advance`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transition }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Cannot ${transition} right now.`);
      setCaseData(data);
      await fetchMyCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Advance failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddEvidence(e: React.FormEvent) {
    e.preventDefault();
    if (!caseData) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/journey/${caseData.id}/evidence`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: evidenceKind, description: evidenceDesc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Evidence not accepted.");
      setCaseData(data);
      setEvidenceDesc("");
      await fetchMyCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evidence failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePhotoUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!caseData || !photoFiles || photoFiles.length === 0) {
      setError("Select at least one photo (jpeg/png/webp/heic, max 12 MB each, up to 8).");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const form = new FormData();
      for (let i = 0; i < photoFiles.length; i++) {
        form.append("photos", photoFiles[i]);
      }
      const res = await fetch(`/api/journey/${caseData.id}/evidence/photo`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Photo evidence not accepted.");
      setCaseData(data);
      setPhotoFiles(null);
      // reset file input
      const el = document.getElementById("journey-photo-input") as HTMLInputElement | null;
      if (el) el.value = "";
      await fetchMyCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAudioUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!caseData || !audioFiles || audioFiles.length === 0) {
      setError("Select at least one audio clip (mp3/wav/m4a/ogg/webm, max 12 MB each, up to 4).");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const form = new FormData();
      for (let i = 0; i < audioFiles.length; i++) {
        form.append("audio", audioFiles[i]);
      }
      const res = await fetch(`/api/journey/${caseData.id}/evidence/audio`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Audio evidence not accepted.");
      setCaseData(data);
      setAudioFiles(null);
      const el = document.getElementById("journey-audio-input") as HTMLInputElement | null;
      if (el) el.value = "";
      await fetchMyCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audio upload failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVideoUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!caseData || !videoFiles || videoFiles.length === 0) {
      setError("Select at least one video clip (mp4/mov/webm/avi, max 50 MB each, up to 2).");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const form = new FormData();
      for (let i = 0; i < videoFiles.length; i++) {
        form.append("video", videoFiles[i]);
      }
      const res = await fetch(`/api/journey/${caseData.id}/evidence/video`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Video evidence not accepted.");
      setCaseData(data);
      setVideoFiles(null);
      const el = document.getElementById("journey-video-input") as HTMLInputElement | null;
      if (el) el.value = "";
      await fetchMyCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video upload failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVibrationUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!caseData || !vibrationFiles || vibrationFiles.length === 0) {
      setError("Select at least one vibration recording (JSON with x/y/z samples, max 2 MB each, up to 2).");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const form = new FormData();
      for (let i = 0; i < vibrationFiles.length; i++) {
        form.append("vibration", vibrationFiles[i]);
      }
      const res = await fetch(`/api/journey/${caseData.id}/evidence/vibration`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Vibration evidence not accepted.");
      setCaseData(data);
      setVibrationFiles(null);
      const el = document.getElementById("journey-vibration-input") as HTMLInputElement | null;
      if (el) el.value = "";
      await fetchMyCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vibration upload failed.");
    } finally {
      setLoading(false);
    }
  }

  function confidenceLabel(level: string) {
    switch (level) {
      case "high": return "High — enough detail for a useful next step";
      case "moderate": return "Moderate — good detail, some uncertainty remains";
      case "low": return "Low — we need a little more to be helpful";
      case "insufficient_information": return "Not enough information yet";
      default: return level;
    }
  }

  function outcomeCopy(outcome?: string) {
    switch (outcome) {
      case "fix": return "FIX — get it inspected/repaired by a qualified shop. Drivable can route you to a Mechanic Match next.";
      case "sell": return "SELL — selling as-is may be better than continuing to repair. ClearSale can help create an honest listing.";
      case "monitor": return "MONITOR — watch the issue and note changes; follow the warning signs below.";
      case "stop_driving": return "STOP DRIVING — do not drive this vehicle until it has been inspected in person. If unsafe, seek towing or emergency help.";
      default: return outcome || "—";
    }
  }

  if (!auth) return <div className="app-shell"><div className="step-card">Loading journey…</div></div>;

  if (!auth.user) {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="brand">Drivable Guided Journey</div>
          <div className="nav"><button onClick={() => navigateFrontend("/")}>Public App</button></div>
        </div>
        <div className="content-shell">
          <div className="hero-card">
            <div className="eyebrow">Sign in required</div>
            <h1>Sign in to start your guided journey.</h1>
            <p>Your vehicle case stays private and is tied to your account so you can resume it anytime. Create an account or sign in, then return to <code>/?route=/journey</code>.</p>
            <div className="hero-actions">
              <button className="primary-btn" onClick={() => navigateFrontend("/")}>Go to Home</button>
            </div>
          </div>
          <CustomerStatusNotice />
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="brand">Drivable Guided Journey</div>
          <div className="nav">
            <button onClick={() => navigateFrontend("/")}>Public App</button>
            <button onClick={() => navigateFrontend("/mechanic-match")}>Mechanic Match</button>
            <button onClick={() => navigateFrontend("/clearsale")}>ClearSale</button>
          </div>
        </div>
        <div className="content-shell">
          <div className="hero-card">
            <div className="eyebrow">Problem → Evidence → Condition → FIX / SELL / MONITOR / STOP DRIVING</div>
            <h1>Tell us about your vehicle in plain language.</h1>
            <p>You are not a mechanic. We will guide you one step at a time, truthfully telling you what we know, what we do not know, and what would help.</p>
          </div>

          {error && <div className="alert-card warning">{error}</div>}

          <form className="step-card" onSubmit={handleStart}>
            <div className="step-header">
              <div>
                <div className="eyebrow">Step 1 — Intake</div>
                <h2>One understandable next action</h2>
                <p>Share the vehicle and what is happening. We save evidence to your case so all future steps build on truth.</p>
              </div>
            </div>
            <div className="field-grid">
              <div className="field"><label>Vehicle (year make model)</label><input value={vehicleInfo} onChange={(e) => setVehicleInfo(e.target.value)} placeholder="2018 Honda Civic" required /></div>
              <div className="field"><label>When does it happen? (optional)</label><select value={timing} onChange={(e) => setTiming(e.target.value)}><option value="">Choose timing</option><option>Cold Start</option><option>Warm Engine</option><option>Idle</option><option>Acceleration</option><option>Braking</option><option>Turning</option><option>Constantly</option><option>Intermittently</option></select></div>
              <div className="field"><label>How urgent does it feel?</label><select value={urgency} onChange={(e) => setUrgency(e.target.value)}><option>Safe to Drive</option><option>Drive Short Distance Only</option><option>Not Safe to Drive</option><option>Will Not Start</option></select></div>
              <div className="field"><label>Can you drive it?</label><select value={canDrive} onChange={(e) => setCanDrive(e.target.value)}><option>Yes</option><option>Short distance only</option><option>No</option><option>Not sure</option></select></div>
            </div>
            <div className="section-block">
              <h3>What is happening? <span className="required-marker">Required</span></h3>
              <textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Example: Grinding noise when braking at low speeds, started last week" required />
              <div className="notice-strip">We check your description for safety signals (brake failure, steering loss, overheating, fuel leak, smoke/fire, etc.). If a STOP DRIVING pattern is found, we escalate immediately and do not route you to a normal fix flow.</div>
            </div>
            <div className="step-actions">
              <button className="primary-btn" type="submit" disabled={loading}>{loading ? "Starting…" : "Start my guided journey"}</button>
              {myCases.length > 0 && <span className="helper-text">{myCases.length} previous case(s) on this account — starting a new one keeps history.</span>}
            </div>
          </form>

          {myCases.length > 0 && (
            <div className="step-card">
              <h3>Resume a recent case</h3>
              <div className="pill-grid">
                {myCases.slice(0, 6).map((c) => (
                  <button key={c.id} className="pill" onClick={() => fetchCase(c.id)}>{c.vehicleInfo} — {c.state} — {c.id.slice(0, 12)}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Active case view — single next action UX
  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">Drivable Guided Journey</div>
        <div className="nav">
          <button onClick={() => { window.localStorage.removeItem(STORAGE_KEY); setCaseData(null); fetchMyCases(); }}>Start new</button>
          <button onClick={() => navigateFrontend("/mechanic-match")}>Mechanic Match</button>
          <button onClick={() => navigateFrontend("/clearsale")}>ClearSale</button>
          <button onClick={() => navigateFrontend("/")}>Public App</button>
        </div>
      </div>

      <div className="content-shell">
        {caseData.safetyTriggered && (
          <div className="alert-card warning" style={{ borderColor: "rgba(255,100,100,0.6)", background: "rgba(90,25,30,0.4)" }}>
            <h3>⚠️ Safety: STOP DRIVING may be required</h3>
            <p>We detected a safety signal. {caseData.safetyFlags.map((f) => `${f.label}${f.matchedPhrase ? ` (${f.matchedPhrase})` : ""}`).join(", ")} — Do not drive until a qualified person inspects it. If you are in an unsafe location, seek emergency help.</p>
            {caseData.escalationReason && <p><strong>Reason:</strong> {caseData.escalationReason}</p>}
          </div>
        )}

        {error && <div className="alert-card warning">{error}</div>}

        <div className="hero-card">
          <div className="eyebrow">Case {caseData.id} — {caseData.state}</div>
          <h1>{caseData.nextActionPrompt || "Your next step"}</h1>
          <p>
            Vehicle: <strong>{caseData.vehicleInfo}</strong> · Confidence: <strong>{caseData.confidenceScore}%</strong> ({confidenceLabel(caseData.confidenceLevel)}) · Risk: <strong>{caseData.riskLevel}</strong> · Evidence: {caseData.evidenceCount} item(s) {caseData.evidenceTypes.length ? `(${caseData.evidenceTypes.join(", ")})` : ""}
          </p>
          {caseData.outcome && <p><strong>Outcome:</strong> {outcomeCopy(caseData.outcome)} {caseData.decisionPath && <em>({caseData.decisionPath})</em>}</p>}
        </div>

        {caseData.decisionPacket && (
          <div className="step-card" style={caseData.decisionPacket.outcome === "stop_driving"
            ? { borderColor: "rgba(255,100,100,0.6)", background: "rgba(90,25,30,0.4)" }
            : { borderColor: "rgba(100,200,255,0.4)", background: "rgba(15,45,75,0.35)" }}>
            <div className="step-header">
              <div>
                <div className="eyebrow">
                  Your plan — {caseData.decisionPacket.outcome.replace(/_/g, " ").toUpperCase()}
                  {" "}· confidence {caseData.decisionPacket.confidenceScore}% ({caseData.decisionPacket.confidenceLevel})
                  {" "}· risk {caseData.decisionPacket.riskLevel}
                </div>
                <h2>{caseData.decisionPacket.guidance.title}</h2>
                <p>{caseData.decisionPacket.guidance.description}</p>
              </div>
            </div>
            <div className="section-block">
              <h3>What to do next</h3>
              <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>
                {caseData.decisionPacket.guidance.immediateSteps.map((step, i) => (
                  <li key={i} style={{ marginBottom: "4px" }}>{step}</li>
                ))}
              </ol>
            </div>
            <div className="section-block">
              <h3>What to share with a shop or buyer</h3>
              <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                {caseData.decisionPacket.guidance.whatToShare.map((item, i) => (
                  <li key={i} style={{ marginBottom: "4px" }}>{item}</li>
                ))}
              </ul>
              <p className="helper-text">
                Evidence on this case: {caseData.decisionPacket.evidenceSummary.photos} photo(s),{" "}
                {caseData.decisionPacket.evidenceSummary.audio} audio,{" "}
                {caseData.decisionPacket.evidenceSummary.video} video,{" "}
                {caseData.decisionPacket.evidenceSummary.vibration} vibration,{" "}
                {caseData.decisionPacket.evidenceSummary.text} note(s) —{" "}
                {caseData.decisionPacket.evidenceSummary.persistedCount} persisted.{" "}
                Evidence belongs to your vehicle case and can be reused for Mechanic Match or ClearSale.
              </p>
            </div>
            {caseData.decisionPacket.matchedSymptoms.length > 0 && (
              <div className="section-block">
                <h3>What we noticed</h3>
                <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                  {caseData.decisionPacket.matchedSymptoms.map((s, i) => (
                    <li key={i} style={{ marginBottom: "4px" }}>
                      <strong>{s.label}</strong> ({Math.round(s.confidence * 100)}% match, {s.possibleRiskLevel} risk)
                      {s.safetyNote ? ` — ${s.safetyNote}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="notice-strip">
              <strong>Important:</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: "1.25rem" }}>
                {caseData.decisionPacket.guidance.warnings.map((w, i) => (
                  <li key={i} style={{ marginBottom: "4px" }}>{w}</li>
                ))}
              </ul>
            </div>
            <div className="section-block">
              <h3>Follow up</h3>
              <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                {caseData.decisionPacket.guidance.followUp.map((f, i) => (
                  <li key={i} style={{ marginBottom: "4px" }}>{f}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {caseData.matchedSymptomCategories.length > 0 && (
          <div className="step-card" style={{ borderColor: "rgba(100,180,255,0.4)", background: "rgba(20,50,80,0.3)" }}>
            <div className="step-header">
              <div>
                <div className="eyebrow">Detected Issue Pattern</div>
                <h2>{caseData.matchedSymptomCategories.length === 1
                  ? caseData.matchedSymptomCategories[0].label
                  : `Possible issues: ${caseData.matchedSymptomCategories.slice(0, 3).map((m) => m.label).join(", ")}`
                }</h2>
                <p>
                  {caseData.matchedSymptomCategories[0]?.humanReviewRecommended
                    ? "This pattern may benefit from human review for extra safety."
                    : "We matched your description to known symptom patterns to guide evidence collection."
                  }
                </p>
              </div>
            </div>
            {caseData.matchedSymptomCategories[0]?.commonEvidenceNeeded && (
              <div className="notice-strip">
                <strong>Suggested evidence:</strong> {caseData.matchedSymptomCategories[0].commonEvidenceNeeded}
              </div>
            )}
          </div>
        )}

        {caseData.plannedEvidence.length > 0 && (caseData.state === "triage" || caseData.state === "evidence_requested") && (
          <div className="step-card" style={{ borderColor: "rgba(100,220,150,0.4)", background: "rgba(20,60,40,0.3)" }}>
            <div className="step-header">
              <div>
                <div className="eyebrow">Suggested Evidence — One at a Time</div>
                <h2>Choose the easiest thing to capture safely</h2>
                <p>{caseData.currentEvidencePrompt || "Pick one of these evidence items to help us understand your issue better."}</p>
              </div>
            </div>
            <div className="pill-grid">
              {caseData.plannedEvidence.map((ev) => (
                <div key={ev.evidenceId} className="pill" style={{ textAlign: "left", width: "100%", maxWidth: "400px", whiteSpace: "normal" }}>
                  <strong>{ev.label}</strong>
                  {ev.safeCaptureInstructions && <span style={{ display: "block", fontSize: "0.85em", opacity: 0.8, marginTop: "4px" }}>{ev.safeCaptureInstructions}</span>}
                  {ev.unsafeCaptureWarning && <span style={{ display: "block", fontSize: "0.8em", color: "rgba(255,150,100,0.9)", marginTop: "2px" }}>⚠ {ev.unsafeCaptureWarning}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="step-card">
          <div className="step-header">
            <div>
              <div className="eyebrow">Your ONE next action</div>
              <h2>{caseData.nextAction ? caseData.nextAction.replace(/_/g, " ") : "Case resolved"}</h2>
              <p>{caseData.nextActionPrompt}</p>
            </div>
            <div className="progress-wrap">
              <span className={`progress-dot ${caseData.state !== "resolved" ? "active" : ""}`}>{caseData.state}</span>
            </div>
          </div>

          {/* State-specific single action */}
          <div className="step-actions">
            {caseData.state === "triage" && !caseData.safetyTriggered && <button className="primary-btn" disabled={loading} onClick={() => handleAdvance("request_evidence")}>Help me share evidence</button>}
            {caseData.state === "triage" && caseData.safetyTriggered && <button className="primary-btn" disabled={loading} onClick={() => handleAdvance("resolve_stop_driving")}>Acknowledge STOP DRIVING</button>}
            {caseData.state === "evidence_requested" && <button className="primary-btn" disabled={loading} onClick={() => handleAdvance("finish_evidence")}>I am done adding evidence</button>}
            {caseData.state === "evidence_received" && <button className="primary-btn" disabled={loading} onClick={() => handleAdvance("evaluate")}>Review my evidence</button>}
            {caseData.state === "evaluating" && <button className="primary-btn" disabled={loading} onClick={() => handleAdvance("ready_diagnosis")}>Show my results</button>}
            {caseData.state === "intake" && <button className="primary-btn" disabled={loading} onClick={() => handleAdvance("submit_intake")}>Continue to next step</button>}
            {caseData.state === "diagnosis_ready" && caseData.outcome !== "stop_driving" && <button className="primary-btn" disabled={loading} onClick={() => handleAdvance("resolve")}>Finish — show FIX / SELL / MONITOR plan</button>}
            {caseData.state === "diagnosis_ready" && caseData.outcome === "stop_driving" && <button className="primary-btn" disabled={loading} onClick={() => handleAdvance("resolve_stop_driving")}>Finish — STOP DRIVING plan</button>}
            {caseData.state === "diagnosis_ready" && <button className="secondary-btn" disabled={loading} onClick={() => handleAdvance("request_human_review")}>Ask for human review instead</button>}
            {caseData.state === "escalation_required" && <button className="primary-btn" disabled={loading} onClick={() => handleAdvance("request_human_review")}>Flag for human review (safety valve)</button>}
            {caseData.state === "escalation_required" && <button className="secondary-btn" disabled={loading} onClick={() => handleAdvance("resolve_stop_driving")}>Resolve as STOP DRIVING</button>}
            {caseData.state === "human_review" && <button className="primary-btn" disabled={loading} onClick={() => handleAdvance("resolve")}>Mark human review complete</button>}
            {caseData.state === "resolved" && (
              <>
                <span className="helper-text">Resolved. Outcome: {outcomeCopy(caseData.outcome)}</span>
                <button className="secondary-btn" disabled={loading} onClick={() => handleAdvance("add_followup_evidence")}>Add follow-up evidence</button>
              </>
            )}
          </div>

          {(caseData.state === "intake" || caseData.state === "triage" || caseData.state === "evidence_requested" || caseData.state === "evidence_received" || caseData.state === "resolved") && (
            <>
              <form onSubmit={handleAddEvidence} className="top-gap">
                <div className="field-grid">
                  <div className="field"><label>Evidence type</label><select value={evidenceKind} onChange={(e) => setEvidenceKind(e.target.value)}><option value="text">Text detail</option><option value="photo">Photo (describe — or upload below)</option><option value="audio">Audio (describe — or upload below)</option><option value="video">Video (describe)</option><option value="vibration">Vibration (describe)</option></select></div>
                  <div className="field"><label>Describe this evidence</label><input value={evidenceDesc} onChange={(e) => setEvidenceDesc(e.target.value)} placeholder="Example: photo of dashboard warning light" /></div>
                </div>
                <div className="step-actions"><button className="secondary-btn" type="submit" disabled={loading}>Add this evidence (text)</button><span className="helper-text">One at a time, safely. You can add multiple items before finishing.</span></div>
              </form>
              <form onSubmit={handlePhotoUpload} className="top-gap" style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "12px", marginTop: "12px" }}>
                <div className="field-grid">
                  <div className="field"><label>Photo evidence (reliable capture)</label><input id="journey-photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(e) => setPhotoFiles(e.target.files)} /></div>
                  <div className="field"><span className="helper-text">Validated: jpeg/png/webp/heic, max 12 MB each, up to 8. Stored durably with your vehicle case — reusable for Mechanic Match / ClearSale. Evidence belongs to the case, not just this screen.</span></div>
                </div>
                <div className="step-actions"><button className="secondary-btn" type="submit" disabled={loading || !photoFiles || photoFiles.length === 0}>Upload photo evidence</button><span className="helper-text">{photoFiles ? `${photoFiles.length} selected` : "No file selected"} — persisted to {caseData.evidencePersistence ? `${caseData.evidencePersistence.persistedCount} persisted` : "case"}</span></div>
              </form>
              <form onSubmit={handleAudioUpload} className="top-gap" style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "12px", marginTop: "12px" }}>
                <div className="field-grid">
                  <div className="field"><label>Audio evidence (reliable capture)</label><input id="journey-audio-input" type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/ogg,audio/webm" multiple onChange={(e) => setAudioFiles(e.target.files)} /></div>
                  <div className="field"><span className="helper-text">Validated: mp3/wav/m4a/ogg/webm, max 12 MB each, up to 4. Stored durably with your vehicle case — reusable for Mechanic Match / ClearSale. Stored, not auto-diagnosed.</span></div>
                </div>
                <div className="step-actions"><button className="secondary-btn" type="submit" disabled={loading || !audioFiles || audioFiles.length === 0}>Upload audio evidence</button><span className="helper-text">{audioFiles ? `${audioFiles.length} selected` : "No file selected"}</span></div>
              </form>
              <form onSubmit={handleVideoUpload} className="top-gap" style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "12px", marginTop: "12px" }}>
                <div className="field-grid">
                  <div className="field"><label>Video evidence (reliable capture)</label><input id="journey-video-input" type="file" accept="video/mp4,video/quicktime,video/webm,video/x-msvideo" multiple onChange={(e) => setVideoFiles(e.target.files)} /></div>
                  <div className="field"><span className="helper-text">Validated: mp4/mov/webm/avi, max 50 MB each, up to 2. Stored durably with your vehicle case — reusable for Mechanic Match / ClearSale. Stored, not auto-diagnosed (truthful boundary).</span></div>
                </div>
                <div className="step-actions"><button className="secondary-btn" type="submit" disabled={loading || !videoFiles || videoFiles.length === 0}>Upload video evidence</button><span className="helper-text">{videoFiles ? `${videoFiles.length} selected` : "No file selected"}</span></div>
              </form>
              <form onSubmit={handleVibrationUpload} className="top-gap" style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "12px", marginTop: "12px" }}>
                <div className="field-grid">
                  <div className="field"><label>Vibration evidence (motion-sensor JSON)</label><input id="journey-vibration-input" type="file" accept="application/json,.json" multiple onChange={(e) => setVibrationFiles(e.target.files)} /></div>
                  <div className="field"><span className="helper-text">Validated: JSON with {"{samples: [{x,y,z,t}, ...]}"}, 2–20k samples, max 2 MB each, up to 2. Stored durably with your vehicle case — reusable for Mechanic Match / ClearSale. Stored, not auto-diagnosed (truthful boundary). Never synthesize — only real sensor data.</span></div>
                </div>
                <div className="step-actions"><button className="secondary-btn" type="submit" disabled={loading || !vibrationFiles || vibrationFiles.length === 0}>Upload vibration evidence</button><span className="helper-text">{vibrationFiles ? `${vibrationFiles.length} selected` : "No file selected"} — captured on device, persisted to case</span></div>
              </form>
              {caseData.evidence && caseData.evidence.length > 0 && (
                <div className="step-card" style={{ marginTop: "12px", background: "rgba(255,255,255,0.04)" }}>
                  <h3>Evidence on this case ({caseData.evidenceCount})</h3>
                  <div className="pill-grid">
                    {caseData.evidence.map((ev) => (
                      <div key={ev.id} className="pill" style={{ textAlign: "left", maxWidth: "360px", whiteSpace: "normal" }}>
                        <strong>{ev.kind}</strong> — {ev.description || ev.originalName || ev.id} {ev.status === "persisted" ? "✓ persisted" : "(text)"}
                        {ev.attachmentId && <span style={{ display: "block", fontSize: "0.8em", opacity: 0.7 }}>{ev.mimeType} · {ev.byteSize ? `${Math.round(ev.byteSize / 1024)} KB` : ""} {ev.attachmentId ? <a href={`/api/journey/${caseData.id}/evidence/${ev.attachmentId}`} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>view</a> : null}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {(caseData.state === "escalation_required" || caseData.state === "human_review") && (
            <div className="notice-strip">Human review is a safety valve, not the default. Your case is flagged; a reviewer can help ensure safety before final FIX / SELL / MONITOR / STOP DRIVING guidance.</div>
          )}

          {caseData.state === "resolved" && caseData.outcome === "fix" && (
            <div className="notice-strip">Next: <button className="secondary-btn" onClick={() => navigateFrontend("/mechanic-match")}>Go to Mechanic Match</button> to route qualified help for this issue. Evidence stays with this vehicle case.</div>
          )}
          {caseData.state === "resolved" && caseData.outcome === "sell" && (
            <div className="notice-strip">Next: <button className="secondary-btn" onClick={() => navigateFrontend("/clearsale")}>Go to ClearSale</button> for an honest, evidence-backed as-is listing. Evidence from this journey can back the listing.</div>
          )}
          {caseData.state === "resolved" && caseData.outcome === "monitor" && (
            <div className="notice-strip">Monitor plan: note if the symptom changes frequency, gets louder, triggers a warning light, or affects drivability — then re-evaluate or escalate.</div>
          )}
          {caseData.state === "resolved" && caseData.outcome === "stop_driving" && (
            <div className="warning-box">Do not drive. Seek in-person inspection, towing, or roadside assistance. Re-open or start a new journey after inspection for next steps.</div>
          )}
        </div>

        <div className="info-card">
          <h3>Case details</h3>
          <p><strong>Description:</strong> {caseData.description}</p>
          {caseData.timing && <p><strong>Timing:</strong> {caseData.timing}</p>}
          {caseData.urgency && <p><strong>Urgency:</strong> {caseData.urgency}</p>}
          {caseData.canDrive && <p><strong>Can drive:</strong> {caseData.canDrive}</p>}
          <p><strong>Created:</strong> {new Date(caseData.createdAt).toLocaleString()} · <strong>Updated:</strong> {new Date(caseData.updatedAt).toLocaleString()}</p>
        </div>

        {myCases.length > 1 && (
          <div className="step-card">
            <h3>Your other cases</h3>
            <div className="pill-grid">
              {myCases.filter((c) => c.id !== caseData.id).slice(0, 6).map((c) => (
                <button key={c.id} className="pill" onClick={() => fetchCase(c.id)}>{c.vehicleInfo} — {c.state}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerStatusNotice() {
  return (
    <div className="step-card">
      <h3>How accounts work</h3>
      <p>Drivable beta accounts are private per email and session. Your journey evidence belongs to your vehicle case and persists so you can resume from any device after sign-in.</p>
    </div>
  );
}
