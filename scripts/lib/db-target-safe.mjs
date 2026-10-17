import { createHash } from "node:crypto";
import { isIP } from "node:net";

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
export const ISOLATED_TEST_DATABASE = "drivable_commerce_test";
export const ALLOW_ISOLATED_TEST_DATABASE_ENV = "DRIVABLE_ALLOW_ISOLATED_TEST_DATABASE";
export const EXPECTED_TEST_DATABASE_FINGERPRINT_ENV = "DRIVABLE_EXPECTED_TEST_DATABASE_FINGERPRINT";
export const EXPECTED_TEST_INSTANCE_ID_ENV = "DRIVABLE_EXPECTED_TEST_DATABASE_INSTANCE_ID";
export const CONFIRMED_TEST_INSTANCE_ID_ENV = "DRIVABLE_CONFIRMED_TEST_DATABASE_INSTANCE_ID";
export const EXPECTED_TEST_SERVER_ADDRESS_ENV = "DRIVABLE_EXPECTED_TEST_DATABASE_SERVER_ADDRESS";

/** Set this to "1" when the target is a deliberate, owner-approved remote database. */
export function mutationTargetConfirmed(env = process.env) {
  return env[CONFIRM_MUTATION_TARGET_ENV] === "1";
}

function isLocalHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.startsWith("127.") || host === "::1" || host === "0.0.0.0";
}

/** PostgreSQL renders inet_server_addr() as a host CIDR (for example, 10.0.0.1/32). */
function normalizeServerAddress(value) {
  const parts = String(value || "").trim().split("/");
  if (parts.length > 2) return null;
  const version = isIP(parts[0]);
  if (!version) return null;
  if (parts.length === 1) return parts[0];
  const prefix = Number(parts[1]);
  const fullHostPrefix = version === 4 ? 32 : 128;
  return Number.isInteger(prefix) && prefix === fullHostPrefix ? parts[0] : null;
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
        protocol: "",
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
    protocol: parsed.protocol,
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
    identified: Boolean(host && parsed.database && ["postgres:", "postgresql:"].includes(parsed.protocol)),
    local: isLocalHost(host),
    markers,
    host: parsed.host,
    database: parsed.database,
    sslRequested: parsed.sslRequested,
  };
}

/** Credential-free endpoint fingerprint. This identifies the URL target, not a live server. */
export function databaseTargetFingerprint(databaseUrl) {
  const parsed = parseDatabaseUrl(databaseUrl);
  if (!parsed || parsed.parseError || !parsed.host || !parsed.database
    || !["postgres:", "postgresql:"].includes(parsed.protocol)) return null;
  const target = `${parsed.host.toLowerCase()}:${parsed.port}/${parsed.database.toLowerCase()}`;
  return createHash("sha256").update(target, "utf8").digest("hex");
}

/**
 * Fail-closed policy for every mutating database script in this repo. A local URL
 * or generic remote confirmation is not enough: only the exact isolated DB,
 * its separately confirmed URL fingerprint and separately recorded instance ID
 * can pass. Operators must verify the instance ID in the provider console first.
 */
export function mutationTargetGuard(databaseUrl, env = process.env) {
  if (!databaseUrl) return { ok: false, reason: "DATABASE_URL is not configured; nothing to mutate." };
  const risk = targetRisk(databaseUrl);
  if (!risk.identified) return { ok: false, reason: "DATABASE_URL target could not be identified; refusing before connection." };
  if (risk.database !== ISOLATED_TEST_DATABASE) {
    return { ok: false, reason: `mutations are restricted to database ${ISOLATED_TEST_DATABASE}; refusing this target before connection.` };
  }
  if (env[ALLOW_ISOLATED_TEST_DATABASE_ENV] !== "1") {
    return { ok: false, reason: `set ${ALLOW_ISOLATED_TEST_DATABASE_ENV}=1 only for a separately authorized isolated test run.` };
  }
  const fingerprint = databaseTargetFingerprint(databaseUrl);
  if (!fingerprint || env[EXPECTED_TEST_DATABASE_FINGERPRINT_ENV] !== fingerprint) {
    return { ok: false, reason: `the target does not match ${EXPECTED_TEST_DATABASE_FINGERPRINT_ENV}; verify the exact endpoint before connection.` };
  }
  const expectedInstance = String(env[EXPECTED_TEST_INSTANCE_ID_ENV] || "").trim();
  const confirmedInstance = String(env[CONFIRMED_TEST_INSTANCE_ID_ENV] || "").trim();
  if (!expectedInstance || !confirmedInstance || expectedInstance !== confirmedInstance) {
    return { ok: false, reason: `a separately verified provider instance ID is required (${EXPECTED_TEST_INSTANCE_ID_ENV} must match ${CONFIRMED_TEST_INSTANCE_ID_ENV}).` };
  }
  const expectedServerAddress = String(env[EXPECTED_TEST_SERVER_ADDRESS_ENV] || "").trim();
  if (!normalizeServerAddress(expectedServerAddress)) {
    return { ok: false, reason: `${EXPECTED_TEST_SERVER_ADDRESS_ENV} must contain the separately verified PostgreSQL server address.` };
  }
  return { ok: true, local: risk.local, markers: risk.markers, database: ISOLATED_TEST_DATABASE, fingerprint };
}

/** Call immediately after connect and before any write; verifies the server's actual identity. */
export async function verifyConnectedDatabaseTarget(client, env = process.env) {
  const expectedAddress = normalizeServerAddress(env[EXPECTED_TEST_SERVER_ADDRESS_ENV]);
  const result = await client.query("select current_database() as database, inet_server_addr()::text as server_address");
  const row = result.rows?.[0];
  if (row?.database !== ISOLATED_TEST_DATABASE || !expectedAddress
    || normalizeServerAddress(row?.server_address) !== expectedAddress) {
    throw new Error("Connected PostgreSQL identity did not match the verified isolated test target; refusing further queries.");
  }
  return Object.freeze({ database: ISOLATED_TEST_DATABASE, verified: true });
}

export function sslConfigForUrl(databaseUrl) {
  const parsed = parseDatabaseUrl(databaseUrl);
  if (!parsed || (parsed.host || "").toLowerCase().startsWith("127.") || (parsed.host || "").toLowerCase() === "localhost" || (parsed.host || "").toLowerCase() === "::1") {
    return false;
  }
  return parsed.sslRequested === false ? false : { rejectUnauthorized: false };
}

