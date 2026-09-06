export type DatabaseSslConfig = false | { rejectUnauthorized: boolean };

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
  const isLocal = databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");
  return isLocal ? false : { rejectUnauthorized: false };
}