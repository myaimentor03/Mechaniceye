/**
 * Guarded wrapper for `drizzle-kit push` so the dangerous one-shot schema
 * command can never run against an unconfirmed target.
 *
 * Safety contract:
 *  - Requires DATABASE_URL, otherwise refuses (exit 1).
 *  - Prints the redacted intended target first.
 *  - Uses the same rules as every other mutation script: local targets are
 *    allowed; any non-local host (and any production-marker host) is refused
 *    unless DRIVABLE_CONFIRM_AUTHENTICATED_TARGET=1 is set.
 *  - Never echoes DATABASE_URL or credentials.
 *
 * Preferred production path is the reviewed SQL in migrations/
 * (0001-0003). This wrapper exists only to keep the previously-uncontrolled
 * `db:push` safe until it is retired entirely.
 *
 * Usage:  DATABASE_URL=... node scripts/db-push-guarded.mjs
 *         npm run db:push   (same, after wiring)
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  mutationTargetGuard,
  safeTargetDescription,
} from "./lib/db-target-safe.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.DATABASE_URL?.trim();

console.log(`db:push target: ${safeTargetDescription(databaseUrl)}`);

if (!databaseUrl) {
  console.error("db:push refused: DATABASE_URL is not configured. Nothing to push against.");
  process.exit(1);
}

const guard = mutationTargetGuard(databaseUrl);
if (!guard.ok) {
  console.error(`db:push refused: ${guard.reason}`);
  console.error("db:push directly alters the target schema with no migration review.");
  console.error("Prefer the reviewed SQL migrations in migrations/ (0001-0003).");
  process.exit(1);
}
if (guard.markers?.length) {
  console.log(`Target blocked markers: ${guard.markers.join(", ")}`);
}
console.log("db:push guard passed; running drizzle-kit push...");

const result = spawnSync("drizzle-kit push", {
  cwd: root,
  stdio: "inherit",
  shell: true,
  timeout: 5 * 60 * 1000,
});

process.exit(result.status ?? 1);