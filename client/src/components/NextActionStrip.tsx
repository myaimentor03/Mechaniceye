type NextActionStripProps = {
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  note?: string;
  additionalLinks?: readonly {
    label: string;
    href: string;
  }[];
};

export function NextActionStrip({
  primaryLabel = "Start over",
  primaryHref = "/start",
  secondaryLabel = "Ask for help",
  secondaryHref = "/help",
  note = "Choose the next step that fits what you are trying to decide.",
  additionalLinks = []
}: NextActionStripProps) {
  return (
    <nav className="nas-strip" aria-label="Drivable next actions">
      <p>{note}</p>
      <div className="nas-actions">
        <a className="nas-button nas-primary" href={primaryHref}>{primaryLabel}</a>
        <a className="nas-button" href="/report-preview">View sample report</a>
        <a className="nas-button" href="/evidence-checklist">See evidence checklist</a>
        {additionalLinks.map((link) => (
          <a className="nas-button" href={link.href} key={link.href}>{link.label}</a>
        ))}
        <a className="nas-button nas-secondary" href={secondaryHref}>{secondaryLabel}</a>
      </div>
    </nav>
  );
}
