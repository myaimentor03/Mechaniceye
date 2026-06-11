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

const STATUS_MEANINGS: Record<
  (typeof LEGEND_STATUS_IDS)[number],
  { customer: string; internal: string }
> = {
  needs_more_info: {
    customer: "Drivable needs a few more details before giving useful guidance.",
    internal: "Keep the case open and request the missing evidence."
  },
  needs_human_review: {
    customer: "A person is checking the guidance and its safety limits.",
    internal: "Do not send. A qualified reviewer must assess risk and wording."
  },
  customer_ready_draft: {
    customer: "The response is written clearly, but final approval is still pending.",
    internal: "Customer-safe wording is ready for the final send decision."
  },
  approved_to_send: {
    customer: "The reviewed guidance is ready for delivery.",
    internal: "The required human review is complete and sending is authorized."
  },
  do_not_send: {
    customer: "Drivable cannot safely provide this response as written.",
    internal: "Block delivery and record the safety, quality, or consent reason."
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
                  <dd>{meaning.customer}</dd>
                </div>
                <div>
                  <dt>Internal action</dt>
                  <dd>{meaning.internal}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
