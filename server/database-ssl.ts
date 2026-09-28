export type DatabaseSslConfig = false | { rejectUnauthorized: boolean };

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/**
 * Detects a loopback-only connection target by parsing the authority section of
 * the URL. A substring scan of the whole URL also matches credentials, paths and
 * query parameters (`?options=-c host=localhost`), which would silently drop TLS
 * for a remote database. An unparseable URL is treated as remote so the safer
 * TLS posture is the default.
 */
export function isLoopbackDatabaseUrl(databaseUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return false;
  return LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase());
}

/**
 * Decides the TLS verification posture for a Postgres connection.
 *
 * - Explicit `DRIVABLE_DATABASE_SSL_MODE=disable` turns TLS verification off
 *   (documented development/legacy escape hatch for managed hosts that use
 *   non-standard CAs).
 * - Explicit `DRIVABLE_DATABASE_SSL_MODE=verify-full` requires a valid,
 *   verifiable certificate chain (recommended for production).
 * - The default keeps the historical behavior: TLS for remote hosts without
 *   certificate verification (required by several managed Postgres hosts whose
 *   certificates are not in Node's bundle), disabled for loopback-only URLs.
 */
export function sslConfigForDatabaseUrl(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): DatabaseSslConfig {
  const mode = env.DRIVABLE_DATABASE_SSL_MODE?.trim();
  if (mode === "disable") return false;
  if (mode === "verify-full") return { rejectUnauthorized: true };
  return isLoopbackDatabaseUrl(databaseUrl) ? false : { rejectUnauthorized: false };
}