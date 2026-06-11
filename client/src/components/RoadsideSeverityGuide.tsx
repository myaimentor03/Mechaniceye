import {
  ROADSIDE_RISK_LEVELS,
  type RoadsideRiskLevel
} from "../../../shared/drivableRoadsideDecision";
import { NextActionStrip } from "./NextActionStrip";

const RISK_GUIDANCE: Record<RoadsideRiskLevel, {
  label: string;
  plainEnglish: string;
  nextMove: string;
  examples: readonly string[];
}> = {
  low: {
    label: "Low",
    plainEnglish: "Something may need attention, but there are no obvious critical warning signs from the information provided.",
    nextMove: "Gather evidence if safe and schedule inspection if symptoms continue.",
    examples: ["Mild intermittent noise", "No warning lights", "Vehicle drives normally"]
  },
  moderate: {
    label: "Moderate",
    plainEnglish: "The issue could become unsafe or expensive if ignored.",
    nextMove: "Avoid unnecessary driving, collect evidence if safe, and consider inspection.",
    examples: ["Vibration", "Intermittent ABS or check-engine light", "Mild overheating history", "Recurring noise"]
  },
  high: {
    label: "High",
    plainEnglish: "Driving far may be risky.",
    nextMove: "Move only to a nearby safe place if the vehicle still controls normally, or seek in-person help.",
    examples: ["Worsening brake vibration", "Steering pull", "Repeated overheating", "Severe vibration", "Power loss"]
  },
  critical: {
    label: "Critical",
    plainEnglish: "Stop driving and get to safety.",
    nextMove: "Tow, emergency help, or immediate in-person inspection may be needed.",
    examples: ["Soft brake pedal", "Steering loss", "Smoke or fire smell", "Fuel leak", "Oil-pressure warning", "Wheel/tire failure"]
  }
};

const STOP_NOW_IF = [
  "Brake pedal goes soft",
  "Steering control changes",
  "Vehicle overheats",
  "Smoke or fire smell appears",
  "Fuel smell or leak appears",
  "Severe shaking starts",
  "Oil-pressure warning appears",
  "Tire or wheel problem appears",
  "Warning lights multiply",
  "Vehicle loses power in traffic"
] as const;

export function RoadsideSeverityGuide() {
  return (
    <main className="rsg-page">
      <section className="rsg-shell">
        <header className="rsg-hero">
          <p className="rsg-eyebrow">Safety-first roadside guide</p>
          <h1>Roadside Risk Levels</h1>
          <p>
            Use the level to understand urgency, not as proof that the vehicle is safe.
          </p>
        </header>

        <div className="rsg-level-grid">
          {ROADSIDE_RISK_LEVELS.map((risk) => {
            const guidance = RISK_GUIDANCE[risk];
            return (
              <article className={`rsg-level-card rsg-level-${risk}`} key={risk}>
                <span className="rsg-badge">{guidance.label}</span>
                <h2>{guidance.plainEnglish}</h2>
                <div>
                  <h3>Typical next move</h3>
                  <p>{guidance.nextMove}</p>
                </div>
                <div>
                  <h3>Examples</h3>
                  <ul>
                    {guidance.examples.map((example) => <li key={example}>{example}</li>)}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>

        <section className="rsg-stop-now">
          <p className="rsg-eyebrow">Stop now if</p>
          <h2>Any of these changes can move the situation into critical risk.</h2>
          <ul>
            {STOP_NOW_IF.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>

        <aside className="rsg-warning">
          Drivable provides informational, confidence-rated guidance based on the information
          provided. It is not emergency dispatch, a diagnosis, or a safety clearance.
        </aside>

        <NextActionStrip
          primaryLabel="View roadside guidance"
          primaryHref="/roadside-preview"
          additionalLinks={[
            { label: "See decision paths", href: "/decision-path-preview" }
          ]}
          note="If critical signs are present, stop and seek qualified in-person help."
        />
      </section>
    </main>
  );
}
