import { useMemo, useState } from "react";

const API_BASE = "https://mechaniceye-backend-v2.onrender.com";

const YEARS = Array.from({ length: 2026 - 1980 + 1 }, (_, i) => String(2026 - i));

const VEHICLE_DATA: Record<string, Record<string, { models: Record<string, string[]> }>> = {
  "2024": {
    Ford: {
      models: {
        F150: ["2.7L EcoBoost", "3.5L EcoBoost", "5.0L V8", "I Don't Know"],
        Escape: ["1.5L", "2.0L", "Hybrid", "I Don't Know"],
        Explorer: ["2.3L", "3.0L", "I Don't Know"]
      }
    },
    Toyota: {
      models: {
        Camry: ["2.5L", "3.5L V6", "Hybrid", "I Don't Know"],
        Tacoma: ["2.4L Turbo", "I Don't Know"],
        RAV4: ["2.5L", "Hybrid", "I Don't Know"]
      }
    },
    Honda: {
      models: {
        Accord: ["1.5L Turbo", "2.0L Hybrid", "I Don't Know"],
        CRV: ["1.5L Turbo", "Hybrid", "I Don't Know"],
        Civic: ["2.0L", "1.5L Turbo", "I Don't Know"]
      }
    },
    Chevrolet: {
      models: {
        Silverado: ["2.7L Turbo", "5.3L V8", "6.2L V8", "I Don't Know"],
        Equinox: ["1.5L Turbo", "I Don't Know"],
        Malibu: ["1.5L Turbo", "I Don't Know"]
      }
    },
    Nissan: {
      models: {
        Altima: ["2.5L", "VC-Turbo", "I Don't Know"],
        Rogue: ["1.5L Turbo", "I Don't Know"],
        Sentra: ["2.0L", "I Don't Know"]
      }
    }
  },
  "2020": {
    Ford: {
      models: {
        F150: ["2.7L EcoBoost", "3.5L EcoBoost", "5.0L V8", "I Don't Know"],
        Escape: ["1.5L", "2.0L", "Hybrid", "I Don't Know"],
        Explorer: ["2.3L", "3.0L", "I Don't Know"]
      }
    },
    Toyota: {
      models: {
        Camry: ["2.5L", "3.5L V6", "Hybrid", "I Don't Know"],
        Tacoma: ["2.7L", "3.5L V6", "I Don't Know"],
        RAV4: ["2.5L", "Hybrid", "I Don't Know"]
      }
    },
    Honda: {
      models: {
        Accord: ["1.5L Turbo", "2.0L Turbo", "Hybrid", "I Don't Know"],
        CRV: ["1.5L Turbo", "I Don't Know"],
        Civic: ["2.0L", "1.5L Turbo", "I Don't Know"]
      }
    },
    Chevrolet: {
      models: {
        Silverado: ["4.3L V6", "5.3L V8", "6.2L V8", "I Don't Know"],
        Equinox: ["1.5L Turbo", "2.0L Turbo", "I Don't Know"],
        Malibu: ["1.5L Turbo", "I Don't Know"]
      }
    },
    Nissan: {
      models: {
        Altima: ["2.5L", "2.0L VC-Turbo", "I Don't Know"],
        Rogue: ["2.5L", "I Don't Know"],
        Sentra: ["2.0L", "I Don't Know"]
      }
    }
  },
  "2014": {
    Ford: {
      models: {
        Escape: ["1.6L", "2.0L", "2.5L", "I Don't Know"],
        Edge: ["2.0L", "3.5L", "I Don't Know"],
        Explorer: ["2.0L", "3.5L", "I Don't Know"],
        F150: ["3.5L EcoBoost", "5.0L V8", "6.2L V8", "I Don't Know"]
      }
    },
    Toyota: {
      models: {
        Camry: ["2.5L", "3.5L V6", "Hybrid", "I Don't Know"],
        Tacoma: ["2.7L", "4.0L V6", "I Don't Know"],
        Corolla: ["1.8L", "I Don't Know"],
        RAV4: ["2.5L", "I Don't Know"]
      }
    },
    Honda: {
      models: {
        Accord: ["2.4L", "3.5L V6", "Hybrid", "I Don't Know"],
        CRV: ["2.4L", "I Don't Know"],
        Civic: ["1.8L", "2.4L Si", "I Don't Know"],
        Element: ["2.4L", "I Don't Know"]
      }
    },
    Chevrolet: {
      models: {
        Silverado: ["4.3L V6", "5.3L V8", "6.2L V8", "I Don't Know"],
        Malibu: ["2.5L", "2.0L Turbo", "I Don't Know"],
        Equinox: ["2.4L", "3.6L", "I Don't Know"]
      }
    },
    Nissan: {
      models: {
        Altima: ["2.5L", "3.5L V6", "I Don't Know"],
        Rogue: ["2.5L", "I Don't Know"],
        Sentra: ["1.8L", "I Don't Know"]
      }
    }
  },
  "2010": {
    Ford: {
      models: {
        Edge: ["3.5L", "I Don't Know"],
        Escape: ["2.5L", "3.0L V6", "I Don't Know"],
        F150: ["4.6L V8", "5.4L V8", "I Don't Know"],
        Explorer: ["4.0L", "4.6L V8", "I Don't Know"]
      }
    },
    Toyota: {
      models: {
        Tacoma: ["2.7L", "4.0L V6", "I Don't Know"],
        Camry: ["2.5L", "3.5L V6", "I Don't Know"],
        Corolla: ["1.8L", "I Don't Know"],
        RAV4: ["2.5L", "3.5L V6", "I Don't Know"]
      }
    },
    Honda: {
      models: {
        Accord: ["2.4L", "3.5L V6", "I Don't Know"],
        Civic: ["1.8L", "2.0L Si", "I Don't Know"],
        CRV: ["2.4L", "I Don't Know"],
        Element: ["2.4L", "I Don't Know"]
      }
    },
    Chevrolet: {
      models: {
        Silverado: ["4.3L V6", "4.8L V8", "5.3L V8", "6.2L V8", "I Don't Know"],
        Malibu: ["2.4L", "3.6L V6", "I Don't Know"],
        Equinox: ["2.4L", "3.0L V6", "I Don't Know"]
      }
    },
    Nissan: {
      models: {
        Altima: ["2.5L", "3.5L V6", "I Don't Know"],
        Rogue: ["2.5L", "I Don't Know"],
        Sentra: ["2.0L", "2.5L", "I Don't Know"]
      }
    }
  }
};

const FALLBACK_MAKES = ["Ford", "Toyota", "Honda", "Chevrolet", "Nissan", "I Don't Know"];
const FALLBACK_MODELS = ["I Don't Know"];
const FALLBACK_ENGINES = ["I Don't Know"];

const CATEGORIES = [
  "Engine / Performance",
  "Transmission / Drivetrain",
  "Brakes",
  "Steering / Suspension",
  "Electrical",
  "Heating / AC",
  "Starting / Charging",
  "Noise / Vibration",
  "Leak / Smell / Smoke",
  "Warning Lights / Codes",
  "Other"
];

const TIMING_OPTIONS = [
  "Cold Start",
  "Warm Engine",
  "Idle",
  "Acceleration",
  "Braking",
  "Turning",
  "Highway Speed",
  "Over Bumps",
  "Constantly",
  "Intermittently",
  "After Rain",
  "Under Load"
];

const DRIVETRAIN_OPTIONS = [
  "Front-Wheel Drive (FWD)",
  "Rear-Wheel Drive (RWD)",
  "All-Wheel Drive (AWD)",
  "Four-Wheel Drive (4WD)",
  "I Don't Know"
];

const TRANSMISSION_OPTIONS = [
  "Automatic",
  "Manual",
  "CVT",
  "Dual-Clutch",
  "I Don't Know"
];

const URGENCY_OPTIONS = [
  "Safe to Drive",
  "Drive Short Distance Only",
  "Not Safe to Drive",
  "Will Not Start"
];

const WARNING_LIGHT_OPTIONS = [
  "Check Engine",
  "ABS",
  "Battery",
  "Oil Pressure",
  "Temperature",
  "Traction / Stability",
  "Airbag",
  "TPMS",
  "Other",
  "None / I Don't Know"
];

function FileListSummary({ files }: { files: File[] }) {
  if (!files.length) {
    return <p className="text-sm text-slate-400">No files selected yet.</p>;
  }

  return (
    <ul className="mt-3 space-y-2 text-sm text-slate-300">
      {files.map((file, index) => (
        <li key={`${file.name}-${index}`} className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
          {file.name}
        </li>
      ))}
    </ul>
  );
}

export default function TestBackend() {
  const [view, setView] = useState<"intake" | "help" | "disclaimer">("intake");
  const [step, setStep] = useState<1 | 2>(1);

  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [engine, setEngine] = useState("");
  const [mileage, setMileage] = useState("");
  const [transmission, setTransmission] = useState("");
  const [drivetrain, setDrivetrain] = useState("");

  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [recentRepairs, setRecentRepairs] = useState("");
  const [otherTiming, setOtherTiming] = useState("");
  const [timingSelections, setTimingSelections] = useState<string[]>([]);
  const [warningLights, setWarningLights] = useState<string[]>([]);
  const [otherWarningLight, setOtherWarningLight] = useState("");
  const [urgency, setUrgency] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [vibrationFiles, setVibrationFiles] = useState<File[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  const availableMakes = useMemo(() => {
    if (!year || !VEHICLE_DATA[year]) return FALLBACK_MAKES;
    return [...Object.keys(VEHICLE_DATA[year]), "I Don't Know"];
  }, [year]);

  const availableModels = useMemo(() => {
    if (!year || !make) return FALLBACK_MODELS;
    if (make === "I Don't Know") return FALLBACK_MODELS;
    return VEHICLE_DATA[year]?.[make] ? [...Object.keys(VEHICLE_DATA[year][make].models), "I Don't Know"] : FALLBACK_MODELS;
  }, [year, make]);

  const availableEngines = useMemo(() => {
    if (!year || !make || !model) return FALLBACK_ENGINES;
    if (make === "I Don't Know" || model === "I Don't Know") return FALLBACK_ENGINES;
    return VEHICLE_DATA[year]?.[make]?.models[model]
      ? VEHICLE_DATA[year][make].models[model]
      : FALLBACK_ENGINES;
  }, [year, make, model]);

  function resetMakeModelEngine(nextYear = year) {
    setMake("");
    setModel("");
    setEngine("");
    if (!VEHICLE_DATA[nextYear]) {
      setMake("");
      setModel("");
      setEngine("");
    }
  }

  function toggleArrayValue(value: string, current: string[], setter: (items: string[]) => void) {
    if (current.includes(value)) {
      setter(current.filter((item) => item !== value));
    } else {
      setter([...current, value]);
    }
  }

  function validateStepOne() {
    if (!year || !make || !model) {
      setError("Please select at least the vehicle year, make, and model before continuing.");
      return false;
    }
    setError("");
    return true;
  }

  function buildDescriptionBlock() {
    const uploadNotes = [
      photoFiles.length ? `Photos selected: ${photoFiles.map((f) => f.name).join(", ")}` : "Photos selected: none",
      audioFiles.length ? `Audio selected: ${audioFiles.map((f) => f.name).join(", ")}` : "Audio selected: none",
      videoFiles.length ? `Video selected: ${videoFiles.map((f) => f.name).join(", ")}` : "Video selected: none",
      vibrationFiles.length
        ? `Vibration / motion files selected: ${vibrationFiles.map((f) => f.name).join(", ")}`
        : "Vibration / motion files selected: none"
    ].join("\n");

    const timingText = timingSelections.length ? timingSelections.join(", ") : "None selected";
    const warningText = warningLights.length ? warningLights.join(", ") : "None selected";

    return [
      `Problem Category: ${category || "Not provided"}`,
      `Customer Email: ${customerEmail || "Not provided"}`,
      `Vehicle: ${year} ${make} ${model}`,
      `Engine: ${engine || "Not provided"}`,
      `Mileage: ${mileage || "Not provided"}`,
      `Transmission: ${transmission || "Not provided"}`,
      `Drivetrain: ${drivetrain || "Not provided"}`,
      `Urgency / Driveability: ${urgency || "Not provided"}`,
      `When it happens: ${timingText}`,
      `Other timing details: ${otherTiming || "Not provided"}`,
      `Warning lights: ${warningText}`,
      `Other warning light details: ${otherWarningLight || "Not provided"}`,
      `Recent repairs or replaced parts: ${recentRepairs || "Not provided"}`,
      "",
      "Customer symptom description:",
      description,
      "",
      "Evidence selected in the frontend:",
      uploadNotes,
      "",
      "IMPORTANT: File upload plumbing is not yet wired to the backend in this version. File names are listed here for review."
    ].join("\n");
  }

  async function submitDiagnosis(e: React.FormEvent) {
    e.preventDefault();

    if (!category || !description || !urgency) {
      setError("Please complete the problem category, symptom description, and urgency before submitting.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/diagnoses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          description: buildDescriptionBlock(),
          vehicleInfo: `${year} ${make} ${model} | Engine: ${engine || "N/A"} | Mileage: ${mileage || "N/A"} | Transmission: ${transmission || "N/A"} | Drivetrain: ${drivetrain || "N/A"}`,
          timing: timingSelections.length ? `${timingSelections.join(", ")}${otherTiming ? ` | Other: ${otherTiming}` : ""}` : otherTiming || ""
        })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const data = await res.json();
      setResult(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      setError(err.message || "Submission failed");
    } finally {
      setLoading(false);
    }
  }

  function renderHelpPage() {
    return (
      <div className="space-y-8">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-cyan-950/20">
          <h2 className="text-3xl font-bold text-white">Help & FAQ</h2>
          <p className="mt-3 text-slate-300">
            Mechanic&apos;s Eye is designed to help you organize symptoms, upload useful evidence, and get more focused diagnostic guidance before spending money blindly.
          </p>
        </section>

        <section className="grid gap-4">
          {[
            ["What should I have ready?", "Start with the vehicle year, make, and model. Then describe the issue as clearly as you can. If you know recent repairs, warning lights, or when the problem happens, include that too."],
            ["What uploads are most useful?", "Photos of warning lights, leaks, or damaged areas are helpful. Audio is useful for knocks, squeals, rattles, or grinding. Video helps with movement, smoke, startup issues, and visible vibration. Vibration / motion evidence is especially useful when shaking or pulsing is hard to describe."],
            ["What if I do not know my engine or drivetrain?", "That is fine. Use the available I Don't Know options where provided. The goal is to reduce confusion, not punish people for not being mechanics."],
            ["Can this replace an in-person inspection?", "No. Mechanic's Eye is designed to improve clarity, reduce guesswork, and help you prepare for the next step. Some issues still require in-person testing and inspection."],
            ["What does Mechanic's Eye help me do?", "It helps you explain the issue better, organize evidence, understand likely causes, prepare questions for a shop, and avoid walking in blind."],
            ["Will I eventually be able to get parts and DIY help here?", "Yes. The product direction includes affordable parts guidance, repair education, and better decision support for people who want to understand the job before approving it."]
          ].map(([question, answer]) => (
            <div key={question} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <h3 className="text-lg font-semibold text-cyan-300">{question}</h3>
              <p className="mt-2 text-slate-300">{answer}</p>
            </div>
          ))}
        </section>
      </div>
    );
  }

  function renderDisclaimerPage() {
    return (
      <div className="space-y-8">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-cyan-950/20">
          <h2 className="text-3xl font-bold text-white">Disclaimer</h2>
          <p className="mt-3 text-slate-300">
            Mechanic&apos;s Eye provides informational diagnostic guidance only. It is not a substitute for hands-on inspection, manufacturer procedures, or emergency roadside judgment.
          </p>
        </section>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-slate-300 space-y-4">
          <p>Always use caution when inspecting, driving, lifting, or repairing a vehicle.</p>
          <p>Do not continue driving a vehicle that appears unsafe, is overheating, has low oil pressure, has major brake issues, or shows signs of severe mechanical failure.</p>
          <p>Any recommendations, likely causes, or next-step guidance are based on the information provided and may be incomplete without physical inspection, scan data, or testing.</p>
          <p>You remain responsible for any repair, purchasing, or driving decisions made based on the information provided.</p>
          <p>For emergencies or immediate safety hazards, stop and seek qualified in-person help.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="rounded-3xl border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(2,6,23,0.98))] p-6 shadow-2xl shadow-cyan-950/20">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
                Mechanic&apos;s Eye
              </div>
              <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
                Focused vehicle diagnosis before you spend money blindly.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Built to help people organize symptoms, evidence, and real-world vehicle details into a cleaner diagnostic picture. Upload what you can. Use I Don&apos;t Know where needed. Start with clarity, not guesswork.
              </p>
              <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-300">
                <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1">Text Symptoms</span>
                <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1">Photos</span>
                <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1">Audio</span>
                <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1">Video</span>
                <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1">Vibration / Motion</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:w-[420px]">
              <button
                type="button"
                onClick={() => setView("intake")}
                className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  view === "intake"
                    ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                    : "border-slate-700 bg-slate-900/50 text-slate-200 hover:border-slate-500"
                }`}
              >
                Start Intake
              </button>
              <button
                type="button"
                onClick={() => setView("help")}
                className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  view === "help"
                    ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                    : "border-slate-700 bg-slate-900/50 text-slate-200 hover:border-slate-500"
                }`}
              >
                Help / FAQ
              </button>
              <button
                type="button"
                onClick={() => setView("disclaimer")}
                className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  view === "disclaimer"
                    ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                    : "border-slate-700 bg-slate-900/50 text-slate-200 hover:border-slate-500"
                }`}
              >
                Disclaimer
              </button>
            </div>
          </div>
        </header>

        <main className="mt-8">
          {view === "help" && renderHelpPage()}
          {view === "disclaimer" && renderDisclaimerPage()}

          {view === "intake" && (
            <div className="grid gap-8 xl:grid-cols-[1.35fr_0.65fr]">
              <form onSubmit={submitDiagnosis} className="space-y-8">
                <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-cyan-950/10">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Intake Flow</p>
                      <h2 className="mt-2 text-2xl font-bold text-white">
                        {step === 1 ? "Step 1: Select Your Vehicle" : "Step 2: Describe the Problem"}
                      </h2>
                      <p className="mt-2 text-slate-300">
                        {step === 1
                          ? "Start with the vehicle. Don&apos;t know every detail? That&apos;s okay. Use I Don&apos;t Know where available."
                          : "Add the issue details, timing, urgency, and evidence that helps tell the story."}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-20 rounded-full ${step >= 1 ? "bg-cyan-400" : "bg-slate-700"}`} />
                      <div className={`h-2 w-20 rounded-full ${step >= 2 ? "bg-cyan-400" : "bg-slate-700"}`} />
                    </div>
                  </div>
                </section>

                {error && (
                  <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
                    {error}
                  </section>
                )}

                {result && (
                  <section className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6">
                    <h3 className="text-2xl font-bold text-emerald-300">Submission Received</h3>
                    <div className="mt-4 grid gap-3 text-sm text-slate-200">
                      <p><span className="font-semibold text-white">Status:</span> {result.status}</p>
                      <p><span className="font-semibold text-white">Request ID:</span> {result.id}</p>
                      <p><span className="font-semibold text-white">Created:</span> {result.createdAt}</p>
                    </div>
                    <p className="mt-4 text-slate-300">
                      Your intake was sent to the live backend. This version stores the structured text submission now. File upload delivery is the next wiring step.
                    </p>
                  </section>
                )}

                {step === 1 && (
                  <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-cyan-950/10">
                    <div className="grid gap-5 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-200">Year</label>
                        <select
                          value={year}
                          onChange={(e) => {
                            const nextYear = e.target.value;
                            setYear(nextYear);
                            resetMakeModelEngine(nextYear);
                          }}
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-400"
                        >
                          <option value="">Select year</option>
                          {YEARS.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-200">Make</label>
                        <select
                          value={make}
                          onChange={(e) => {
                            setMake(e.target.value);
                            setModel("");
                            setEngine("");
                          }}
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-400"
                        >
                          <option value="">Select make</option>
                          {availableMakes.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-200">Model</label>
                        <select
                          value={model}
                          onChange={(e) => {
                            setModel(e.target.value);
                            setEngine("");
                          }}
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-400"
                        >
                          <option value="">Select model</option>
                          {availableModels.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-200">Engine</label>
                        <select
                          value={engine}
                          onChange={(e) => setEngine(e.target.value)}
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-400"
                        >
                          <option value="">Select engine</option>
                          {availableEngines.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-200">Mileage</label>
                        <input
                          type="text"
                          value={mileage}
                          onChange={(e) => setMileage(e.target.value)}
                          placeholder="Optional"
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-200">Transmission</label>
                        <select
                          value={transmission}
                          onChange={(e) => setTransmission(e.target.value)}
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-400"
                        >
                          <option value="">Select transmission</option>
                          {TRANSMISSION_OPTIONS.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-200">Drivetrain / Drive Type</label>
                        <select
                          value={drivetrain}
                          onChange={(e) => setDrivetrain(e.target.value)}
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-400"
                        >
                          <option value="">Select drivetrain</option>
                          {DRIVETRAIN_OPTIONS.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-200">Best email for follow-up</label>
                        <input
                          type="email"
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          placeholder="Optional for now"
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                        />
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
                      <p className="text-sm text-slate-400">
                        Don&apos;t know every detail? Fill in what you can and keep moving.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          if (validateStepOne()) {
                            setStep(2);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }
                        }}
                        className="rounded-2xl border border-cyan-400 bg-cyan-400/10 px-5 py-3 font-semibold text-cyan-300 transition hover:bg-cyan-400/15"
                      >
                        Continue to Symptoms
                      </button>
                    </div>
                  </section>
                )}

                {step === 2 && (
                  <>
                    <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-cyan-950/10">
                      <div className="grid gap-5">
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-200">Problem Category</label>
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {CATEGORIES.map((item) => (
                              <button
                                key={item}
                                type="button"
                                onClick={() => setCategory(item)}
                                className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
                                  category === item
                                    ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                                    : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-500"
                                }`}
                              >
                                {item}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-200">Describe the Problem</label>
                          <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={8}
                            placeholder="Describe what the vehicle is doing, when it started, whether it is getting worse, what it sounds or feels like, any warning lights, and any recent work that was done."
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                          />
                        </div>

                        <div>
                          <label className="mb-3 block text-sm font-semibold text-slate-200">When Does It Happen?</label>
                          <div className="flex flex-wrap gap-3">
                            {TIMING_OPTIONS.map((item) => (
                              <button
                                key={item}
                                type="button"
                                onClick={() => toggleArrayValue(item, timingSelections, setTimingSelections)}
                                className={`rounded-full border px-4 py-2 text-sm transition ${
                                  timingSelections.includes(item)
                                    ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                                    : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-500"
                                }`}
                              >
                                {item}
                              </button>
                            ))}
                          </div>
                          <input
                            type="text"
                            value={otherTiming}
                            onChange={(e) => setOtherTiming(e.target.value)}
                            placeholder="Other timing details"
                            className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-200">Recent Repairs or Replaced Parts</label>
                          <textarea
                            value={recentRepairs}
                            onChange={(e) => setRecentRepairs(e.target.value)}
                            rows={4}
                            placeholder="Optional. Include recent repairs, part replacements, or anything that changed before the issue started."
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                          />
                        </div>

                        <div>
                          <label className="mb-3 block text-sm font-semibold text-slate-200">Warning Lights / Codes</label>
                          <div className="flex flex-wrap gap-3">
                            {WARNING_LIGHT_OPTIONS.map((item) => (
                              <button
                                key={item}
                                type="button"
                                onClick={() => toggleArrayValue(item, warningLights, setWarningLights)}
                                className={`rounded-full border px-4 py-2 text-sm transition ${
                                  warningLights.includes(item)
                                    ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                                    : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-500"
                                }`}
                              >
                                {item}
                              </button>
                            ))}
                          </div>
                          <input
                            type="text"
                            value={otherWarningLight}
                            onChange={(e) => setOtherWarningLight(e.target.value)}
                            placeholder="Optional code or warning light details"
                            className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                          />
                        </div>

                        <div>
                          <label className="mb-3 block text-sm font-semibold text-slate-200">Urgency / Driveability</label>
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            {URGENCY_OPTIONS.map((item) => (
                              <button
                                key={item}
                                type="button"
                                onClick={() => setUrgency(item)}
                                className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
                                  urgency === item
                                    ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                                    : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-500"
                                }`}
                              >
                                {item}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-cyan-950/10">
                      <div className="flex flex-col gap-2">
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Upload Evidence</p>
                        <h3 className="text-2xl font-bold text-white">Add evidence that helps tell the story</h3>
                        <p className="text-slate-300">
                          This version lets users select files in the interface and includes their names in the backend submission text. Direct file upload wiring is the next build step.
                        </p>
                      </div>

                      <div className="mt-6 grid gap-5 xl:grid-cols-2">
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
                          <label className="text-lg font-semibold text-white">Photos</label>
                          <p className="mt-2 text-sm text-slate-400">Dashboard lights, leaks, broken parts, tire wear, visible damage.</p>
                          <input
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={(e) => setPhotoFiles(Array.from(e.target.files || []))}
                            className="mt-4 block w-full text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-cyan-400/10 file:px-4 file:py-2 file:font-semibold file:text-cyan-300"
                          />
                          <FileListSummary files={photoFiles} />
                        </div>

                        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
                          <label className="text-lg font-semibold text-white">Audio</label>
                          <p className="mt-2 text-sm text-slate-400">Knocking, ticking, squealing, grinding, rattling, hissing.</p>
                          <input
                            type="file"
                            multiple
                            accept="audio/*"
                            onChange={(e) => setAudioFiles(Array.from(e.target.files || []))}
                            className="mt-4 block w-full text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-cyan-400/10 file:px-4 file:py-2 file:font-semibold file:text-cyan-300"
                          />
                          <FileListSummary files={audioFiles} />
                        </div>

                        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
                          <label className="text-lg font-semibold text-white">Video</label>
                          <p className="mt-2 text-sm text-slate-400">Startup behavior, idle quality, movement, smoke, wobble, visible symptoms.</p>
                          <input
                            type="file"
                            multiple
                            accept="video/*"
                            onChange={(e) => setVideoFiles(Array.from(e.target.files || []))}
                            className="mt-4 block w-full text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-cyan-400/10 file:px-4 file:py-2 file:font-semibold file:text-cyan-300"
                          />
                          <FileListSummary files={videoFiles} />
                        </div>

                        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
                          <label className="text-lg font-semibold text-white">Vibration / Motion</label>
                          <p className="mt-2 text-sm text-slate-400">Shaking at idle, pulsing while braking, steering wheel vibration, seat vibration, highway rumble.</p>
                          <input
                            type="file"
                            multiple
                            onChange={(e) => setVibrationFiles(Array.from(e.target.files || []))}
                            className="mt-4 block w-full text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-cyan-400/10 file:px-4 file:py-2 file:font-semibold file:text-cyan-300"
                          />
                          <FileListSummary files={vibrationFiles} />
                        </div>
                      </div>
                    </section>

                    <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          setStep(1);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="rounded-2xl border border-slate-700 bg-slate-900/70 px-5 py-3 font-semibold text-slate-200 transition hover:border-slate-500"
                      >
                        Back to Vehicle
                      </button>

                      <button
                        type="submit"
                        disabled={loading}
                        className="rounded-2xl border border-cyan-400 bg-cyan-400/10 px-6 py-3 font-semibold text-cyan-300 transition hover:bg-cyan-400/15 disabled:opacity-60"
                      >
                        {loading ? "Submitting..." : "Submit for Diagnosis"}
                      </button>
                    </section>
                  </>
                )}
              </form>

              <aside className="space-y-6">
                <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-cyan-950/10">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Why this helps</p>
                  <h3 className="mt-2 text-2xl font-bold text-white">Built to reduce diagnostic guesswork</h3>
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                    <li>Organize the issue before you approve repairs.</li>
                    <li>Collect useful symptom details in one place.</li>
                    <li>Use photos, audio, video, and vibration evidence to strengthen the story.</li>
                    <li>Prepare for a more focused conversation with a shop or mechanic.</li>
                  </ul>
                </section>

                <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-cyan-950/10">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Future direction</p>
                  <h3 className="mt-2 text-2xl font-bold text-white">What comes next</h3>
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                    <li>Direct file upload delivery</li>
                    <li>Structured email notification workflow</li>
                    <li>Guidance on what to say to the mechanic</li>
                    <li>Affordable parts and DIY support paths</li>
                    <li>Illustrations and video-based explanations</li>
                  </ul>
                </section>

                <section className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Use caution</p>
                  <p className="mt-3 text-sm leading-6 text-amber-100/90">
                    If the vehicle is overheating, has low oil pressure, serious brake issues, severe knocking, active smoke, or feels unsafe, stop and get in-person help.
                  </p>
                </section>
              </aside>
            </div>
          )}
        </main>

        <footer className="mt-10 rounded-3xl border border-slate-800 bg-slate-900/60 px-6 py-5 text-sm text-slate-400">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p>Mechanic&apos;s Eye is being refined as a practical diagnostic intake system built around clarity, evidence, and real-world repair decision support.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setView("help")} className="text-cyan-300 hover:text-cyan-200">
                Help
              </button>
              <button type="button" onClick={() => setView("disclaimer")} className="text-cyan-300 hover:text-cyan-200">
                Disclaimer
              </button>
              <button type="button" onClick={() => setView("intake")} className="text-cyan-300 hover:text-cyan-200">
                Intake
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
