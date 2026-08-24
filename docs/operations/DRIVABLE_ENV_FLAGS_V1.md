# Drivable Environment Flags V1

## AI Mode

```text
DRIVABLE_AI_MODE=mock
```

Adds clearly labeled mock fields to supported webhook payloads. Mock mode is also selected when `OPENAI_API_KEY` is missing or empty.

```text
DRIVABLE_AI_MODE=live
```

Selects live mode only when `OPENAI_API_KEY` is also present. The current backend does not call OpenAI directly; live AI behavior remains the responsibility of the reviewed downstream workflow.

## Required External Values

```text
OPENAI_API_KEY=...
```

Required before live AI can be used. Never commit a real key.

```text
MASTER_INTAKE_WEBHOOK_URL=...
```

Required for Make forwarding on the master intake routes. Use only a controlled test webhook during mock testing.

The legacy diagnosis path may also use `MECHANIC_EYE_INTAKE_WEBHOOK_URL` and `PUBLIC_CASE_WEBHOOK_URL`. Do not change production values as part of mock-mode testing.

```text
DRIVABLE_REVIEWER_TOKEN=...
```

Required before internal review, case-reading, follow-up, consultation mutation, database-health, or legacy file routes can be used. Generate a long random secret in the hosting provider; never reuse a personal password or place the value in source control. The server intentionally returns `503` when this value is missing and `401` when the supplied Bearer token is wrong.

```text
DRIVABLE_SESSION_SECRET=...
```

Required for customer registration, sign-in, and authenticated case intake. Use a different random secret of at least 32 characters. Changing it signs every customer out. Customer passwords are stored as salted scrypt hashes in the existing `users.password` field; the beta must verify that the deployed `users` table matches the reviewed schema before tester registration is opened.

```text
DRIVABLE_BETA_INVITE_CODE=...
DRIVABLE_PHOTO_UPLOAD_ENABLED=false
```

The invite code is required for new registrations and supports controlled prelaunch testing. Share it directly with approved testers and rotate it if it leaks. Keep photo upload `false` until private durable object storage, authenticated reviewer retrieval, retention/deletion behavior, malware/content safeguards, and owner-operated upload tests all pass. The customer interface reads this capability at runtime, so enabling the verified evidence system does not require removing or rebuilding the photo experience.

## Private Evidence Object Storage

```text
DRIVABLE_EVIDENCE_S3_BUCKET=...
DRIVABLE_EVIDENCE_S3_REGION=...
DRIVABLE_EVIDENCE_S3_ENDPOINT=...
DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID=...
DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY=...
DRIVABLE_EVIDENCE_S3_FORCE_PATH_STYLE=false
```

The endpoint and explicit credentials are optional when the host supplies standard AWS-compatible credentials; S3-compatible providers normally require them. The bucket must be private, must block anonymous/public access, and must have lifecycle/retention rules approved before customer uploads. Photo capability remains off unless both `DRIVABLE_PHOTO_UPLOAD_ENABLED=true` and the bucket/region configuration are present. Never expose the storage credentials or direct object URLs to customers; reviewer retrieval passes through the authenticated backend route.

## Safety

- Store secrets in local or hosting-provider environment settings.
- Do not put real keys or webhook URLs in Git, docs, screenshots, logs, or test payloads.
- Mock mode does not authorize customer sending.
- Confirm the intended environment and webhook target before every test.
- Enter the reviewer key only into the internal review desk over HTTPS; do not send it in email, case notes, screenshots, or customer messages.
- Never reuse the reviewer token as the customer session secret.
- Never reuse either server secret as the tester invite code.
