const JSON_HEADERS = Object.freeze({ "content-type": "application/json" });

function jsonRequest(path, body, expectedStatuses, extra = {}) {
  return {
    path,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    expectedStatuses,
    ...extra,
  };
}

function syntheticDiagnosis(correlationId) {
  const description = "Synthetic launch-cert case: intermittent vibration during a controlled test cycle.";
  return {
    source: "launch-cert-synthetic",
    submittedAt: new Date().toISOString(),
    vehicleYear: "2018",
    vehicleMake: "Example",
    vehicleModel: "Test Vehicle",
    vehicleInfo: "2018 Example Test Vehicle",
    mileage: "50000",
    description,
    symptomSummary: description,
    timing: "Synthetic test cycle only",
    canDrive: "yes",
    urgency: "low",
    evidenceIntake: {
      mode: "diagnose",
      vehicle: {
        year: "2018",
        make: "Example",
        model: "Test Vehicle",
        mileage: 50000,
      },
      situation: {
        description,
        symptoms: ["Synthetic vibration signal"],
        timing: "Synthetic test cycle only",
        urgency: "low",
        canDrive: "yes",
        buyerObservations: [],
        sellerClaims: [],
      },
      obd: { codes: [], attachmentIds: [] },
      attachments: [],
    },
    loadCertificationId: correlationId,
  };
}

function textIntakeRequest(config, correlationId) {
  if (config.writeTextIntake) {
    return jsonRequest(
      config.paths.textIntake,
      syntheticDiagnosis(correlationId),
      new Set([200, 201, 202]),
      { expectsUniqueResponseId: true, mode: "synthetic write" },
    );
  }

  // Deliberately malformed evidence metadata reaches the real intake parser but
  // is rejected before storage, notifications, or external analysis.
  return jsonRequest(
    config.paths.textIntake,
    {
      source: "launch-cert-synthetic-validation",
      description: "Synthetic intake validation probe",
      evidenceIntake: "{",
      loadCertificationId: correlationId,
    },
    new Set([400]),
    { mode: "non-persistent validation" },
  );
}

function authAbuseRequest(config) {
  // Fixed fake credentials model rejection/rate-limit behavior without spraying
  // passwords or enumerating accounts. A 404 means no auth surface is exposed.
  return jsonRequest(
    config.paths.authAbuse,
    { username: "load-cert-user", password: "deliberately-invalid" },
    new Set([400, 401, 403, 404, 405, 422, 429]),
    { mode: "fixed invalid credential" },
  );
}

function tinySyntheticJpegMarker() {
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });
}

function uploadBoundaryRequest(config, occurrence) {
  const form = new FormData();
  if (occurrence % 2 === 0) {
    // Nine four-byte markers exercise the eight-file count boundary. Multer
    // rejects the request before application persistence.
    for (let index = 0; index < 9; index += 1) {
      form.append("photos", tinySyntheticJpegMarker(), `synthetic-boundary-${index}.jpg`);
    }
    return {
      path: config.paths.uploadBoundary,
      method: "POST",
      body: form,
      expectedStatuses: new Set([413]),
      mode: "file-count rejection",
    };
  }

  form.append(
    "photos",
    new Blob([new Uint8Array([0x4c, 0x43, 0x45, 0x52, 0x54])], { type: "application/octet-stream" }),
    "synthetic-boundary.bin",
  );
  return {
    path: config.paths.uploadBoundary,
    method: "POST",
    body: form,
    expectedStatuses: new Set([415]),
    mode: "media-type rejection",
  };
}

export function buildScenarioCatalog(config) {
  return new Map([
    ["health", {
      name: "health",
      weight: 3,
      description: "database-backed health",
      request: () => ({
        path: config.paths.health,
        method: "GET",
        expectedStatuses: new Set([200]),
        mode: "read",
      }),
    }],
    ["browse", {
      name: "browse",
      weight: 3,
      description: "recent-case browse",
      request: () => ({
        path: config.paths.browse,
        method: "GET",
        expectedStatuses: new Set([200]),
        mode: "read",
      }),
    }],
    ["text-intake", {
      name: "text-intake",
      weight: 2,
      description: config.writeTextIntake ? "successful synthetic intake" : "non-persistent intake validation",
      request: ({ correlationId }) => textIntakeRequest(config, correlationId),
    }],
    ["auth-abuse", {
      name: "auth-abuse",
      weight: 1,
      description: "fixed fake credential rejection",
      request: () => authAbuseRequest(config),
    }],
    ["upload-boundary", {
      name: "upload-boundary",
      weight: 1,
      description: "tiny synthetic count/type rejection",
      request: ({ occurrence }) => uploadBoundaryRequest(config, occurrence),
    }],
  ]);
}

export function buildWeightedScenarioPlan(config) {
  const catalog = buildScenarioCatalog(config);
  const plan = [];
  for (const name of config.scenarios) {
    const scenario = catalog.get(name);
    if (!scenario) throw new Error(`Unknown scenario: ${name}`);
    for (let count = 0; count < scenario.weight; count += 1) plan.push(scenario);
  }
  return plan;
}
