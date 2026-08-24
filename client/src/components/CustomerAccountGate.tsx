import { useState } from "react";

export type DrivableCustomer = { id: string; email: string };

export function CustomerAccountGate({ onAuthenticated }: { onAuthenticated: (user: DrivableCustomer) => void }) {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) return form.reportValidity();
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(data.get("email") || ""),
          password: String(data.get("password") || ""),
          inviteCode: mode === "register" ? String(data.get("inviteCode") || "") : undefined,
        }),
      });
      const result = await response.json().catch(() => ({ ok: false, error: "Account request failed." }));
      if (!response.ok || !result.user) throw new Error(result.error || "Account request failed.");
      onAuthenticated(result.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Account request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="step-card account-gate" aria-labelledby="account-gate-title">
      <div className="eyebrow">Private beta account</div>
      <h2 id="account-gate-title">{mode === "register" ? "Create your Drivable account" : "Sign in to continue"}</h2>
      <p>Your account keeps vehicle submissions tied to you. Drivable never stores your password in readable form.</p>
      {error && <div className="alert-card warning" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="field-grid">
          {mode === "register" && <div className="field"><label>Beta Invite Code</label><input name="inviteCode" autoComplete="off" required /></div>}
          <div className="field"><label>Email</label><input name="email" type="email" autoComplete="email" required /></div>
          <div className="field"><label>Password</label><input name="password" type="password" minLength={12} maxLength={128} autoComplete={mode === "register" ? "new-password" : "current-password"} required /></div>
        </div>
        <p className="helper-text">Use at least 12 characters. Do not reuse your banking or email password.</p>
        <div className="step-actions">
          <button className="primary-btn" disabled={busy}>{busy ? "Please wait..." : mode === "register" ? "Create account" : "Sign in"}</button>
          <button className="secondary-btn" type="button" onClick={() => { setMode(mode === "register" ? "login" : "register"); setError(""); }}>
            {mode === "register" ? "I already have an account" : "Create a new account"}
          </button>
        </div>
      </form>
    </section>
  );
}
