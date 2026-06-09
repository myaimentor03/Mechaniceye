type NeedHelpPanelProps = {
  topic?: string;
  compact?: boolean;
};

export function NeedHelpPanel({ topic, compact = false }: NeedHelpPanelProps) {
  const params = new URLSearchParams();

  if (topic) {
    params.set("topic", topic);
  }

  const href = `/help${params.size ? `?${params.toString()}` : ""}`;

  return (
    <section className={compact ? "support-panel support-panel-compact" : "support-panel"}>
      <div>
        <div className="support-kicker">AI-assisted Drivable Guides</div>
        <h2>Need help?</h2>
        <p>You do not have to figure this out alone. Tell us where you are stuck and a Drivable Guide will help route you.</p>
      </div>
      <a className="support-link" href={href}>Ask a Drivable Guide</a>
    </section>
  );
}
