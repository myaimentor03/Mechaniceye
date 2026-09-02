import { getPool } from "../db.js";
import { AsyncHumanReviewReleaseGate } from "./async-release-gate.js";
import { PgLaunchControlExecutor, verifyLaunchControlSchema } from "./postgres-adapter.js";
import { PostgresReviewReleaseReader } from "./postgres-review-release-reader.js";
import { PostgresReviewWriter } from "./postgres-review-writer.js";
import { PostgresConsentRepository } from "../consent/postgres-consent-repository.js";

export const LAUNCH_CONTROLS_ENABLED_ENV = "DRIVABLE_LAUNCH_CONTROLS_ENABLED";

export class LaunchControlUnavailableError extends Error {
  readonly code = "LAUNCH_CONTROLS_UNAVAILABLE";
  constructor() {
    super("Durable launch controls are not ready");
    this.name = "LaunchControlUnavailableError";
  }
}

export type LaunchControlRuntime = Readonly<{
  executor: PgLaunchControlExecutor;
  writer: PostgresReviewWriter;
  reader: PostgresReviewReleaseReader;
  releaseGate: AsyncHumanReviewReleaseGate;
  consent: PostgresConsentRepository;
}>;

let cached: LaunchControlRuntime | undefined;

export function getLaunchControlRuntime(): LaunchControlRuntime {
  if (process.env[LAUNCH_CONTROLS_ENABLED_ENV] !== "true") throw new LaunchControlUnavailableError();
  if (!cached) {
    const executor = new PgLaunchControlExecutor(getPool());
    const reader = new PostgresReviewReleaseReader(executor);
    cached = Object.freeze({ executor, reader, writer: new PostgresReviewWriter(executor),
      releaseGate: new AsyncHumanReviewReleaseGate(reader), consent: new PostgresConsentRepository(executor) });
  }
  return cached;
}

export async function requireVerifiedLaunchControlRuntime(): Promise<LaunchControlRuntime> {
  const runtime = getLaunchControlRuntime();
  try {
    const schema = await verifyLaunchControlSchema(runtime.executor);
    if (!schema.ready) throw new LaunchControlUnavailableError();
    return runtime;
  } catch (error) {
    if (error instanceof LaunchControlUnavailableError) throw error;
    throw new LaunchControlUnavailableError();
  }
}

export function resetLaunchControlRuntimeForTests(): void {
  cached = undefined;
}
