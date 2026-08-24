import { isIP } from "node:net";

export const SCENARIO_NAMES = Object.freeze([
  "health",
  "browse",
  "text-intake",
  "auth-abuse",
  "upload-boundary",
]);

export const HARD_CAPS = Object.freeze({
  concurrency: 12,
  ratePerSecond: 20,
  durationSeconds: 300,
  requestTimeoutMs: 30_000,
  maxRequests: 3_000,
});

export const DEFAULTS = Object.freeze({
  target: "http://localhost:5000",
  concurrency: 4,
  ratePerSecond: 5,
  durationSeconds: 30,
  requestTimeoutMs: 10_000,
  maxRequests: 150,
  sloP95Ms: 3_000,
  sloMaxErrorRate: 0.01,
  sloMaxLost: 0,
  sloMaxDuplicate: 0,
  scenarios: SCENARIO_NAMES,
  paths: Object.freeze({
    health: "/api/health/db",
    // Browse a non-sensitive public shell. A launch harness must never require
    // access to customer case history merely to exercise the read path.
    browse: "/",
    textIntake: "/api/diagnoses",
    authAbuse: "/api/auth/session",
    uploadBoundary: "/api/diagnoses",
  }),
});

// These names are either used by the current public client or conventional
// production names. The allowlist flag can never override this denylist.
const KNOWN_PRODUCTION_HOSTS = new Set([
  "getdrivable.com",
  "www.getdrivable.com",
  "mechaniceye-backend-v2.onrender.com",
  "mechaniceye.com",
  "www.mechaniceye.com",
  "app.mechaniceye.com",
  "api.mechaniceye.com",
]);

const PRODUCTION_LABEL = /(^|[.-])(prod|production|live)([.-]|$)/i;

function finiteNumber(value, flag) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${flag} must be a finite number`);
  return parsed;
}

function positiveNumber(value, flag) {
  const parsed = finiteNumber(value, flag);
  if (parsed <= 0) throw new Error(`${flag} must be greater than zero`);
  return parsed;
}

function nonNegativeNumber(value, flag) {
  const parsed = finiteNumber(value, flag);
  if (parsed < 0) throw new Error(`${flag} must not be negative`);
  return parsed;
}

function integer(value, flag) {
  const parsed = positiveNumber(value, flag);
  if (!Number.isInteger(parsed)) throw new Error(`${flag} must be an integer`);
  return parsed;
}

function requireValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function validateRelativePath(value, flag) {
  if (!value.startsWith("/") || value.startsWith("//")) {
    throw new Error(`${flag} must be a same-origin path beginning with one slash`);
  }
  const parsed = new URL(value, "http://load-cert.invalid");
  if (parsed.origin !== "http://load-cert.invalid") {
    throw new Error(`${flag} must not point to another origin`);
  }
  return `${parsed.pathname}${parsed.search}`;
}

function normalizeAllowlistedHost(value) {
  const candidate = value.trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (!candidate || candidate.includes(":") && isIP(candidate) !== 6) {
    throw new Error("--allow-staging-host accepts a hostname only (no scheme, port, or path)");
  }
  if (candidate.includes("/") || candidate.includes("*") || candidate.includes("?")) {
    throw new Error("--allow-staging-host must be one exact hostname; wildcards are forbidden");
  }
  return candidate;
}

export function parseArgs(args) {
  const config = {
    ...DEFAULTS,
    paths: { ...DEFAULTS.paths },
    scenarios: [...DEFAULTS.scenarios],
    allowStagingHosts: [],
    dryRun: false,
    writeTextIntake: false,
    confirmStagingWrites: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    switch (flag) {
      case "--target":
        config.target = requireValue(args, index, flag);
        index += 1;
        break;
      case "--allow-staging-host":
        config.allowStagingHosts.push(normalizeAllowlistedHost(requireValue(args, index, flag)));
        index += 1;
        break;
      case "--concurrency":
        config.concurrency = integer(requireValue(args, index, flag), flag);
        index += 1;
        break;
      case "--rate":
        config.ratePerSecond = positiveNumber(requireValue(args, index, flag), flag);
        index += 1;
        break;
      case "--duration":
        config.durationSeconds = positiveNumber(requireValue(args, index, flag), flag);
        index += 1;
        break;
      case "--timeout-ms":
        config.requestTimeoutMs = integer(requireValue(args, index, flag), flag);
        index += 1;
        break;
      case "--max-requests":
        config.maxRequests = integer(requireValue(args, index, flag), flag);
        index += 1;
        break;
      case "--slo-p95-ms":
        config.sloP95Ms = positiveNumber(requireValue(args, index, flag), flag);
        index += 1;
        break;
      case "--slo-max-error-rate":
        config.sloMaxErrorRate = nonNegativeNumber(requireValue(args, index, flag), flag);
        index += 1;
        break;
      case "--slo-max-lost":
        config.sloMaxLost = nonNegativeNumber(requireValue(args, index, flag), flag);
        index += 1;
        break;
      case "--slo-max-duplicate":
        config.sloMaxDuplicate = nonNegativeNumber(requireValue(args, index, flag), flag);
        index += 1;
        break;
      case "--scenarios": {
        const requested = requireValue(args, index, flag).split(",").map((item) => item.trim()).filter(Boolean);
        const unknown = requested.filter((item) => !SCENARIO_NAMES.includes(item));
        if (!requested.length || unknown.length) {
          throw new Error(`--scenarios must contain only: ${SCENARIO_NAMES.join(", ")}`);
        }
        config.scenarios = [...new Set(requested)];
        index += 1;
        break;
      }
      case "--health-path":
        config.paths.health = validateRelativePath(requireValue(args, index, flag), flag);
        index += 1;
        break;
      case "--browse-path":
        config.paths.browse = validateRelativePath(requireValue(args, index, flag), flag);
        index += 1;
        break;
      case "--text-path":
        config.paths.textIntake = validateRelativePath(requireValue(args, index, flag), flag);
        index += 1;
        break;
      case "--auth-path":
        config.paths.authAbuse = validateRelativePath(requireValue(args, index, flag), flag);
        index += 1;
        break;
      case "--upload-path":
        config.paths.uploadBoundary = validateRelativePath(requireValue(args, index, flag), flag);
        index += 1;
        break;
      case "--write-text-intake":
        config.writeTextIntake = true;
        break;
      case "--confirm-staging-writes":
        config.confirmStagingWrites = true;
        break;
      case "--dry-run":
        config.dryRun = true;
        break;
      case "--help":
      case "-h":
        config.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }

  return config;
}

export function isLoopbackHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized === "::1") return true;
  if (isIP(normalized) === 4) {
    const [first] = normalized.split(".").map(Number);
    return first === 127;
  }
  return false;
}

export function isRecognizableProductionHostname(hostname) {
  const normalized = hostname.toLowerCase();
  return KNOWN_PRODUCTION_HOSTS.has(normalized)
    || normalized.startsWith("www.")
    || PRODUCTION_LABEL.test(normalized);
}

export function assertSafeTarget(target, allowStagingHosts = []) {
  let url;
  try {
    url = new URL(target);
  } catch {
    throw new Error("--target must be a valid http:// or https:// URL");
  }

  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error("--target must use http:// or https://");
  }
  if (url.username || url.password) throw new Error("Credentials are forbidden in --target");
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("--target must be an origin only, without a path, query, or fragment");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  const local = isLoopbackHostname(hostname);
  if (isRecognizableProductionHostname(hostname)) {
    throw new Error(`Refusing recognizable production hostname: ${hostname}`);
  }

  const normalizedAllowlist = allowStagingHosts.map(normalizeAllowlistedHost);
  if (!local && !normalizedAllowlist.includes(hostname)) {
    throw new Error(
      `Remote target ${hostname} is blocked. Pass --allow-staging-host ${hostname} only after confirming it is staging.`,
    );
  }
  if (!local && url.protocol !== "https:") {
    throw new Error("Remote staging targets must use HTTPS");
  }

  return {
    origin: url.origin,
    hostname,
    local,
    targetKind: local ? "loopback" : "explicitly allowlisted staging",
  };
}

export function validateConfig(config) {
  const target = assertSafeTarget(config.target, config.allowStagingHosts);
  const capChecks = [
    ["concurrency", config.concurrency, HARD_CAPS.concurrency],
    ["rate", config.ratePerSecond, HARD_CAPS.ratePerSecond],
    ["duration", config.durationSeconds, HARD_CAPS.durationSeconds],
    ["timeout-ms", config.requestTimeoutMs, HARD_CAPS.requestTimeoutMs],
    ["max-requests", config.maxRequests, HARD_CAPS.maxRequests],
  ];
  for (const [name, value, maximum] of capChecks) {
    if (!Number.isFinite(value) || value <= 0 || value > maximum) {
      throw new Error(`--${name} must be greater than zero and at most ${maximum}`);
    }
  }
  if (!Number.isInteger(config.concurrency) || !Number.isInteger(config.maxRequests)) {
    throw new Error("--concurrency and --max-requests must be integers");
  }
  if (config.sloMaxErrorRate > 1) throw new Error("--slo-max-error-rate must be between 0 and 1");
  if (!Number.isInteger(config.sloMaxLost) || !Number.isInteger(config.sloMaxDuplicate)) {
    throw new Error("lost and duplicate SLO limits must be whole numbers");
  }
  if (config.writeTextIntake && !config.scenarios.includes("text-intake")) {
    throw new Error("--write-text-intake requires the text-intake scenario");
  }
  if (config.writeTextIntake && !target.local && !config.confirmStagingWrites) {
    throw new Error("Remote synthetic writes require --confirm-staging-writes");
  }
  const rateLimitedPlan = Math.ceil(config.ratePerSecond * config.durationSeconds);
  const plannedRequests = Math.min(rateLimitedPlan, config.maxRequests);
  if (plannedRequests < 1) throw new Error("Configuration would schedule no requests");

  return { ...target, plannedRequests };
}
