import {
  DRIVABLE_REPORT_STATUSES,
  type DrivableReportStatus
} from "../../../shared/drivableReportStatus";

const LEGEND_STATUS_IDS: readonly DrivableReportStatus[] = [
  "needs_more_info",
  "needs_human_review",
  "customer_ready_draft",
  "approved_to_send",
  "do_not_send"
];

const STATUS_MEANINGS: Partial<Record<string, { customer: string; internal: string }>> = {
  intake_received: {
    customer: "Request received.",
    internal: "Intake has been received and is waiting for review."
  },
  needs_more_info: {
    customer: "More information needed.",
    internal: "More customer information is needed before the response can be prepared."
  },
  ai_draft_ready: {
    customer: "Draft is being prepared.",
    internal: "AI draft is ready for internal review."
  },
  needs_human_review: {
    customer: "Under review.",
    internal: "Human review is required before this can be sent."
  },
  customer_ready_draft: {
    customer: "Draft ready.",
    internal: "Customer-ready draft has been prepared."
  },
  approved_to_send: {
    customer: "Approved.",
    internal: "Response has been approved to send."
  },
  sent_to_customer: {
    customer: "Response sent.",
    internal: "Response has been sent to the customer."
  },
  do_not_send: {
    customer: "Not sent.",
    internal: "This response should not be sent."
  },
  archived: {
    customer: "Archived.",
    internal: "Case has been archived."
  }
};

export function StatusLegend() {
  const statuses = DRIVABLE_REPORT_STATUSES.filter((status) =>
    LEGEND_STATUS_IDS.includes(status.id)
  );

  return (
    <section className="sl-section" aria-labelledby="status-legend-title">
      <header className="sl-header">
        <div>
          <p className="sl-eyebrow">Workflow status legend</p>
          <h2 id="status-legend-title">What the main review statuses mean</h2>
        </div>
        <p>Customer meaning and internal action stay distinct.</p>
      </header>

      <div className="sl-grid">
        {statuses.map((status) => {
          const meaning = STATUS_MEANINGS[status.id as keyof typeof STATUS_MEANINGS];

          return (
            <article className={`sl-card sl-${status.id.replaceAll("_", "-")}`} key={status.id}>
              <code>{status.id}</code>
              <h3>{status.label}</h3>
              <p>{status.description}</p>
              <dl>
                <div>
                  <dt>Customer meaning</dt>
                  <dd>{meaning?.customer ?? "Status update."}</dd>
                </div>
                <div>
                  <dt>Internal action</dt>
                  <dd>{meaning?.internal ?? "No internal description is available for this status."}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
