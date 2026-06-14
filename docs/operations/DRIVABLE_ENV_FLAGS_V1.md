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

## Safety

- Store secrets in local or hosting-provider environment settings.
- Do not put real keys or webhook URLs in Git, docs, screenshots, logs, or test payloads.
- Mock mode does not authorize customer sending.
- Confirm the intended environment and webhook target before every test.
