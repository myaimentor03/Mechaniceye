import { useEffect, useState } from "react";
import { CustomerAccountGate, type DrivableCustomer } from "./CustomerAccountGate";
import { AppHeader } from "./app-header";
import { EvidenceVerificationPanel } from "./EvidenceVerificationPanel";

type CustomerCase = {
  id: string;
  vehicleInfo: string;
  status: string;
  createdAt: string;
};

type ViewState = "checking" | "signed-out" | "loading" | "ready" | "error";

type CustomerCaseDetails = CustomerCase & {
  description?: string;
  timing?: string;
};

function readableDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date unavailable" : parsed.toLocaleString();
}

export function CustomerCaseHistoryPage() {
  const [cases, setCases] = useState<CustomerCase[]>([]);
  const [state, setState] = useState<ViewState>("checking");
  const [notice, setNotice] = useState("");

  async function loadCases(isActive: () => boolean = () => true) {
    setState("loading");
    setNotice("");
    try {
      const response = await fetch("/api/customer/cases", { credentials: "include", cache: "no-store" });
      if (!isActive()) return;
      if (response.status === 401) {
        setState("signed-out");
        setNotice("Your session may have expired. Sign in to view saved cases.");
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!isActive()) return;
      if (!response.ok || !Array.isArray(body.cases)) {
        throw new Error(body.error || "Your saved cases are temporarily unavailable. Try again shortly.");
      }
      setCases(body.cases);
      setState("ready");
    } catch (error) {
      if (!isActive()) return;
      setNotice(error instanceof Error ? error.message : "Your saved cases are temporarily unavailable. Try again shortly.");
      setState("error");
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error("Account status could not be checked.");
        if (!active) return;
        if (body.user) {
          await loadCases(() => active);
        } else {
          setState("signed-out");
        }
      })
      .catch((error) => {
        if (!active) return;
        setNotice(error instanceof Error ? error.message : "Account status could not be checked.");
        setState("error");
      });
    return () => { active = false; };
  }, []);

  function onAuthenticated(customer: DrivableCustomer) {
    void customer;
    void loadCases();
  }

  return (
    <>
      <AppHeader />
      <main className="simple-page">
        <section className="step-card" aria-labelledby="customer-case-history-title">
        <div className="eyebrow">Your account</div>
        <h1 id="customer-case-history-title">Your saved Drivable cases</h1>
        <p>Only cases saved to the account you signed in with are shown here. Marketplace and Mechanic Match requests are not included in this list.</p>
        {state === "checking" && <p role="status">Checking your account…</p>}
        {state === "loading" && <p role="status">Loading your saved cases…</p>}
        {state === "signed-out" && (
          <>
            {notice && <div className="alert-card warning" role="status">{notice}</div>}
            <CustomerAccountGate initialMode="login" onAuthenticated={onAuthenticated} />
          </>
        )}
        {state === "error" && (
          <div className="alert-card warning" role="alert">
            <p>{notice}</p>
            <button className="secondary-btn" type="button" onClick={() => void loadCases()}>Try again</button>
          </div>
        )}
        {state === "ready" && cases.length === 0 && (
          <div className="alert-card" role="status">
            <p>No diagnosis cases are saved to this account yet.</p>
            <a className="primary-btn" href="/">Start a Drivable Check</a>
          </div>
        )}
        {state === "ready" && cases.length > 0 && (
          <div aria-label="Saved cases" className="guided-grid">
            {cases.map((item) => (
              <article key={item.id} className="info-card">
                <h2>{item.vehicleInfo}</h2>
                <p>Status: {item.status}</p>
                <p>Submitted: {readableDate(item.createdAt)}</p>
                <a href={`/my-cases/${encodeURIComponent(item.id)}`}>Open case</a>
              </article>
            ))}
          </div>
        )}
        <p><a href="/">Return to Drivable</a></p>
        </section>
      </main>
    </>
  );
}

export function CustomerCaseDetailPage({ caseId }: { caseId: string }) {
  const [caseDetails, setCaseDetails] = useState<CustomerCaseDetails | null>(null);
  const [state, setState] = useState<ViewState>("loading");
  const [notice, setNotice] = useState("");

  async function loadCase(isActive: () => boolean = () => true) {
    setState("loading");
    setNotice("");
    if (!caseId) {
      setNotice("This saved-case link is invalid.");
      setState("error");
      return;
    }
    try {
      const response = await fetch(`/api/diagnoses/${encodeURIComponent(caseId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!isActive()) return;
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setCaseDetails(null);
        setState("signed-out");
        setNotice("Your session may have expired. Sign in to open this case.");
        return;
      }
      if (!response.ok || body.id !== caseId) {
        throw new Error(body.error || body.message || "This saved case could not be opened.");
      }
      setCaseDetails(body);
      setState("ready");
    } catch (error) {
      if (!isActive()) return;
      setNotice(error instanceof Error ? error.message : "This saved case could not be opened.");
      setState("error");
    }
  }

  useEffect(() => {
    let active = true;
    void loadCase(() => active);
    return () => { active = false; };
  }, [caseId]);

  function onAuthenticated(_customer: DrivableCustomer) {
    void loadCase();
  }

  return (
    <>
      <AppHeader />
      <main className="simple-page">
        <section className="step-card" aria-labelledby="customer-case-detail-title">
          <div className="eyebrow">Your saved case</div>
          <h1 id="customer-case-detail-title">{caseDetails?.vehicleInfo || "Case details"}</h1>
          {state === "loading" && <p role="status">Loading this case…</p>}
          {state === "signed-out" && (
            <>
              {notice && <div className="alert-card warning" role="status">{notice}</div>}
              <CustomerAccountGate initialMode="login" onAuthenticated={onAuthenticated} />
            </>
          )}
          {state === "error" && (
            <div className="alert-card warning" role="alert">
              <p>{notice}</p>
              <button className="secondary-btn" type="button" onClick={() => void loadCase()}>Try again</button>
            </div>
          )}
          {state === "ready" && caseDetails && (
            <>
              <div className="info-card">
                <p><strong>Status:</strong> {caseDetails.status || "received"}</p>
                <p><strong>Submitted:</strong> {readableDate(caseDetails.createdAt)}</p>
                <p><strong>Case ID:</strong> {caseDetails.id}</p>
                {caseDetails.description && <p><strong>What you reported:</strong> {caseDetails.description}</p>}
                {caseDetails.timing && <p><strong>When it happens:</strong> {caseDetails.timing}</p>}
              </div>
              <div className="alert-card" role="note">
                This page shows your submitted case and stored evidence status. It is not a diagnosis, safety clearance, or confirmation that a human review is complete.
              </div>
              <EvidenceVerificationPanel caseId={caseDetails.id} />
              <div className="step-actions">
                <a className="secondary-btn" href={`/help?topic=${encodeURIComponent("Help understanding a car issue")}&relatedCaseId=${encodeURIComponent(caseDetails.id)}`}>Get help with this case</a>
              </div>
            </>
          )}
          <p><a href="/my-cases">Back to your saved cases</a></p>
        </section>
      </main>
    </>
  );
}
