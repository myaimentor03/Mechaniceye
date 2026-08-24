# Staging-only launch certification

This is a small, dependency-free Node.js harness for a bounded pre-launch check. It is deliberately **not** a stress-to-failure, volumetric, soak, or denial-of-service tool.

It refuses every remote target unless its exact hostname is passed with `--allow-staging-host` **and** the hostname contains affirmative non-production evidence. Accepted evidence is a distinct marker such as `stage`, `staging`, `dev`, `test`, `qa`, `uat`, `sandbox`, or `preview`, or a reserved test/example domain. An allowlist entry alone cannot reclassify an ambiguous hostname such as `api.getdrivable.com` as staging. Remote targets must use HTTPS. Known/conventional production hostnames are denied even when allowlisted, redirects are never followed, and all pacing controls have non-overridable hard caps.

## Validate it first

Run the self-tests:

```sh
node --test tests/load/load-cert.test.mjs
```

Validate a local plan without sending a request:

```sh
node tests/load/load-cert.mjs --target http://localhost:5000 --dry-run
```

Validate a staging plan without sending a request:

```sh
node tests/load/load-cert.mjs \
  --target https://stage.example.test \
  --allow-staging-host stage.example.test \
  --dry-run
```

## Run a bounded certification

The defaults are 4 concurrent requests, 5 starts/second, 30 seconds, and no more than 150 total requests:

```sh
node tests/load/load-cert.mjs \
  --target https://stage.example.test \
  --allow-staging-host stage.example.test
```

Start with smaller settings when certifying a new staging deployment:

```sh
node tests/load/load-cert.mjs \
  --target https://stage.example.test \
  --allow-staging-host stage.example.test \
  --concurrency 2 \
  --rate 2 \
  --duration 15 \
  --max-requests 30
```

The process exits `0` only when the launch SLO passes, `1` for an SLO failure, and `2` when a safety/configuration guard refuses the run.

## Scenarios

- `health`: `GET /api/health/db`, expecting `200`.
- `browse`: `GET /`, expecting `200`. Bodies are size-bounded, discarded, and never printed. The default deliberately avoids customer case-history endpoints.
- `text-intake`: by default submits malformed synthetic evidence metadata and expects `400`, exercising the intake parser without storing a case or calling downstream work.
- `auth-abuse`: submits one fixed fake credential pair at the globally capped pace and expects rejection (`400`, `401`, `403`, `404`, `405`, `422`, or `429`). `404` means the deployment exposes no route at the configured auth path; override it with `--auth-path` if staging has a different login route. It never enumerates users or sprays passwords.
- `upload-boundary`: alternates tiny synthetic file-count and unsupported-type probes, expecting `413`/`415`. It uses no user media and sends at most 36 bytes of file content per request.

No real name, email, phone number, VIN, account, password, or user media is generated. Correlation IDs use a random run identifier and sequence only. The special request headers are `x-mechaniceye-load-cert: synthetic-staging-only` and `x-load-test-request-id`.

To certify successful text persistence, add `--write-text-intake`. That creates clearly marked synthetic cases. A remote run requires the additional `--confirm-staging-writes` flag because the normal staging route may invoke its configured database, notifications, or webhooks:

```sh
node tests/load/load-cert.mjs \
  --target https://stage.example.test \
  --allow-staging-host stage.example.test \
  --write-text-intake \
  --confirm-staging-writes
```

Use `--scenarios health,browse` to run only selected checks. Same-origin route overrides are available as `--health-path`, `--browse-path`, `--text-path`, `--auth-path`, and `--upload-path`.

## Guardrails and SLOs

Hard caps cannot be raised from the command line:

| Control | Default | Hard cap |
| --- | ---: | ---: |
| Concurrency | 4 | 12 |
| Starts per second | 5 | 20 |
| Launch duration | 30 seconds | 300 seconds |
| Request timeout | 10 seconds | 30 seconds |
| Total requests | 150 | 3,000 |

Requests are evenly paced rather than burst-launched. If workers fall behind, the harness skips stale scheduled starts instead of catching up in a burst; those are reported as lost and fail the default SLO.

The JSON report includes counts by status/error/scenario, p50/p95/p99/max latency, HTTP responses lost, response/correlation duplicates, and missing case IDs for successful synthetic writes. Defaults are:

- overall and per-scenario p95 at or below 3,000 ms;
- error rate at or below 1%;
- zero lost responses;
- zero duplicate indicators;
- a unique case ID for every successful synthetic text write.

Override launch requirements with `--slo-p95-ms`, `--slo-max-error-rate`, `--slo-max-lost`, and `--slo-max-duplicate`. A returned HTTP status is a scenario error unless it matches that scenario's contract, and any contract error contributes to the overall error rate.

Do not aim this harness at production, increase traffic by running copies in parallel, or use it to discover a breaking point. For higher-volume testing, obtain explicit operational approval and use an isolated environment with a separately reviewed plan.
