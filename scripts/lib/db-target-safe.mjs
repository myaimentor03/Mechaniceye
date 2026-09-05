/**
 * Safe database-target helpers for Drivable preflight, import, and
 * read-only verification scripts.
 *
 * Goals:
 *  - Never render a DATABASE_URL, username, or password in output.
 *  - Always surface enough host/port/database/SSL detail to confirm the
 *    intended target before any mutating command runs.
 *  - Block obvious production-like hosts for mutating commands unless an
 *    explicit confirmation environment gate is set.
 */

export const PRODUCTION_HOST_MARKERS = [
  "render.com",
  "render",
  "amazonaws",
  "neon.tech",
  "supabase",
  "railway",
  "production",
  "prod",
  "fly.io",
  "azure",
  "herokuapp",
  "vercel.com",
];

/** Explicit gate required before any mutating script touches a non-local target. */
export const CONFIRM_MUTATION_TARGET_ENV = "DRIVABLE_CONFIRM_AUTHENTICATED_TARGET";

/** Set this to "1" when the target is a deliberate, owner-approved remote database. */
export function mutationTargetConfirmed(env = process.env) {
  return env[CONFIRM_MUTATION_TARGET_ENV] === "1";
}

function isLocalHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.startsWith("127.") || host === "::1" || host === "0.0.0.0";
}

function parseDatabaseUrl(raw) {
  const input = String(raw || "").trim();
  if (!input) return null;

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    const normalized = input.replace(/^postgres(ql)?:\/\//, "postgres://");
    try {
      parsed = new URL(normalized);
    } catch {
      return {
        raw: input,
        host: "",
        port: "",
        database: "",
        username: "",
        password: "",
        sslRequested: false,
        parseError: "could not parse database URL",
      };
    }
  }

  const sslMode = parsed.searchParams.get("sslmode");
  const hasSslQuery = parsed.searchParams.has("sslmode") || parsed.searchParams.has("ssl");
  const sslRequested = hasSslQuery
    ? sslMode !== "disable" && sslMode !== "allow" && sslMode !== "prefer"
    : true;

  return {
    raw: input,
    host: parsed.hostname,
    port: parsed.port || (parsed.protocol === "postgresql:" ? "5432" : "5432"),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "").replace(/\/$/, "")),
    username: parsed.username ? decodeURIComponent(parsed.username) : "",
    password: parsed.password ? decodeURIComponent(parsed.password) : "",
    sslRequested,
    parseError: null,
  };
}

/**
 * Render a target line that can never leak credentials.
 * Example: `postgres://<redacted>:<redacted>@neon-db.region.neon.tech:5432/drivable (ssl=preferred)`
 */
export function safeTargetDescription(databaseUrl) {
  if (!databaseUrl) {
    return "no DATABASE_URL configured (no target)";
  }
  const parsed = parseDatabaseUrl(databaseUrl);
  if (parsed.parseError) {
    return "DATABASE_URL present but unparseable (refusing to guess a target)";
  }
  const host = parsed.host || "(unknown-host)";
  const auth = parsed.username || parsed.password ? "<redacted>:<redacted>@" : "";
  return `postgres://${auth}${host}:${parsed.port}/${parsed.database || "(database)"} (ssl=${parsed.sslRequested ? "required" : "not-requested"})`;
}

export function targetRisk(databaseUrl) {
  if (!databaseUrl) {
    return { identified: false, local: false, markers: [], host: "", database: "" };
  }
  const parsed = parseDatabaseUrl(databaseUrl);
  const host = (parsed.host || "").toLowerCase();
  const lowercaseUrl = String(databaseUrl).toLowerCase();
  const markers = PRODUCTION_HOST_MARKERS.filter((marker) => lowercaseUrl.includes(marker));
  return {
    identified: Boolean(host && parsed.database),
    local: isLocalHost(host),
    markers,
    host: parsed.host,
    database: parsed.database,
    sslRequested: parsed.sslRequested,
  };
}

/**
 * Decide whether a mutating script may proceed.
 *  - No URL => blocked (mutations always need a target).
 *  - Local target => allowed (sandbox/local postgres), no gate required.
 *  - Remote target => allowed only when mutationTargetConfirmed(env) is true.
 * The returned object always explains the decision for the operator.
 */
export function mutationTargetGuard(databaseUrl, env = process.env) {
  if (!databaseUrl) {
    return { ok: false, reason: "DATABASE_URL is not configured; nothing to mutate." };
  }
  const risk = targetRisk(databaseUrl);
  if (risk.markers.length > 0 && !mutationTargetConfirmed(env)) {
    return {
      ok: false,
      reason: `target host matches production-like marker(s): ${risk.markers.join(", ")}. Set ${CONFIRM_MUTATION_TARGET_ENV}=1 only after the owner confirms this is the intended database.`,
    };
  }
  if (!risk.local && !mutationTargetConfirmed(env)) {
    return {
      ok: false,
      reason: `target is a non-local host (${risk.host || "unknown"}) and ${CONFIRM_MUTATION_TARGET_ENV} is not set to 1. Local inspection and explicit ownership confirmation are required before mutating commands.`,
    };
  }
  return { ok: true, local: risk.local, markers: risk.markers };
}

export function sslConfigForUrl(databaseUrl) {
  const parsed = parseDatabaseUrl(databaseUrl);
  if (!parsed || (parsed.host || "").toLowerCase().startsWith("127.") || (parsed.host || "").toLowerCase() === "localhost" || (parsed.host || "").toLowerCase() === "::1") {
    return false;
  }
  return parsed.sslRequested === false ? false : { rejectUnauthorized: false };
}