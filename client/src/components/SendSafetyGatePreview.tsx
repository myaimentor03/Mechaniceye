import {
  DRIVABLE_REPORT_STATUSES,
  isCustomerSendAllowed,
  type DrivableReportStatus
} from "../../../shared/drivableReportStatus";
import { NextActionStrip } from "./NextActionStrip";

const PREVIEW_STATUSES: readonly DrivableReportStatus[] = [
  "intake_received",
  "needs_more_info",
  "ai_draft_ready",
  "needs_human_review",
  "customer_ready_draft",
  "approved_to_send",
  "sent_to_customer",
  "do_not_send"
];

const STATUS_REASONS: Record<DrivableReportStatus, string> = {
  intake_received: "The intake has not been evaluated or prepared as a customer response.",
  needs_more_info: "Required details or evidence are still missing.",
  ai_draft_ready: "AI-generated wording remains internal until a human reviews it.",
  needs_human_review: "A qualified reviewer must check risk, uncertainty, and customer-facing language.",
  customer_ready_draft: "The draft may be polished, but it has not received final send approval.",
  approved_to_send: "Required review is complete and the response is explicitly approved for delivery.",
  sent_to_customer: "The response was already delivered; this status does not authorize another send.",
  do_not_send: "The response is blocked from customer delivery.",
  archived: "Archived reports are inactive and cannot be sent."
};

export function SendSafetyGatePreview() {
  const statuses = DRIVABLE_REPORT_STATUSES.filter((status) =>
    PREVIEW_STATUSES.includes(status.id)
  );

  return (
    <main className="ssg-page">
      <div className="ssg-shell">
        <header className="ssg-header">
          <div>
            <p className="ssg-eyebrow">Drivable Internal Control Preview</p>
            <h1>Send Safety Gate</h1>
            <p>
              A read-only view of whether each report status permits a customer response.
              This preview does not send, queue, or approve anything.
            </p>
          </div>
          <span className="ssg-preview-badge">Internal preview</span>
        </header>

        <section className="ssg-internal-warning" aria-label="Internal send warning">
          <strong>Human approval is the send boundary.</strong>
          <p>
            Only approved_to_send may be sent to a customer. High-risk diagnosis, roadside,
            title, structural, or high-cost repair guidance requires human approval before sending.
          </p>
        </section>

        <section className="ssg-status-section">
          <div className="ssg-section-heading">
            <div>
              <p className="ssg-eyebrow">Status Rules</p>
              <h2>Customer send permission by report status</h2>
            </div>
            <p>{statuses.length} workflow statuses shown</p>
          </div>

          <div className="ssg-status-grid">
            {statuses.map((status) => {
              const sendAllowed = isCustomerSendAllowed(status.id);

              return (
                <article
                  className={`ssg-status-card ${sendAllowed ? "ssg-status-allowed" : "ssg-status-blocked"}`}
                  key={status.id}
                >
                  <div className="ssg-status-topline">
                    <code>{status.id}</code>
                    <span className={`ssg-send-badge ${sendAllowed ? "allowed" : "blocked"}`}>
                      {sendAllowed ? "Send allowed: Yes" : "Send allowed: No"}
                    </span>
                  </div>
                  <h3>{status.label}</h3>
                  <p>{status.description}</p>
                  <div className="ssg-reason">
                    <span>Reason</span>
                    <p>{STATUS_REASONS[status.id]}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="ssg-roadside-warning">
          <div>
            <p className="ssg-eyebrow">High-Risk Roadside Example</p>
            <h2>Critical signals override draft readiness</h2>
          </div>
          <p>
            Even if a draft exists, roadside safety guidance should not auto-send when critical
            risk signals are present.
          </p>
        </aside>
      </div>

      <NextActionStrip
        primaryLabel="Review internal packet"
        primaryHref="/internal-review-preview"
        note="Use the internal review path before any customer-facing delivery decision."
      />
    </main>
  );
}
