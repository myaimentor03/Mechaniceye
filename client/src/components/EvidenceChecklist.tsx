import { NextActionStrip } from "./NextActionStrip";

const EVIDENCE_GROUPS = [
  {
    title: "Basic vehicle info",
    items: [
      "Year, make, model, mileage",
      "VIN if available",
      "Current warning lights"
    ]
  },
  {
    title: "Photos",
    items: [
      "Dash warning lights",
      "Tires/wheels",
      "Leaks under the vehicle",
      "Damaged areas",
      "Engine bay if relevant"
    ]
  },
  {
    title: "Videos",
    items: [
      "Cold start video",
      "Short walk-around",
      "Symptom video if safe",
      "Braking/vibration video only if safe"
    ]
  },
  {
    title: "Scan/code info",
    items: [
      "OBD code screenshot",
      "Scanner report photo",
      "Freeze-frame info if available"
    ]
  },
  {
    title: "Symptom details",
    items: [
      "When it happens",
      "Speed/load/temperature",
      "Noise/vibration/smell",
      "Recent repairs or events"
    ]
  }
] as const;

export function EvidenceChecklist() {
  return (
    <main className="ec-page">
      <section className="ec-shell">
        <header className="ec-header">
          <p className="ec-eyebrow">Gather what you safely can</p>
          <h1>Drivable Evidence Checklist</h1>
          <p>
            You do not need every item. Clear details and a few useful photos or videos can help
            Drivable explain possible causes, missing evidence, and confidence-rated next steps.
          </p>
        </header>

        <div className="ec-grid">
          {EVIDENCE_GROUPS.map((group) => (
            <section className="ec-card" key={group.title}>
              <h2>{group.title}</h2>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>
                    <span aria-hidden="true">OK</span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <aside className="ec-safety">
          <strong>Skip anything unsafe.</strong>
          <p>
            Do not drive, crawl under, touch hot parts, open pressurized systems, or record while
            driving just to gather evidence. Skip anything unsafe.
          </p>
        </aside>

        <NextActionStrip
          primaryLabel="Choose what you need"
          primaryHref="/start"
          note="Ready to continue? Pick the path that matches your vehicle decision."
        />
      </section>
    </main>
  );
}
