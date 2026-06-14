# Drivable No-Credit Test Mode Runbook V1

## Purpose

Use mock AI fields to test Drivable intake, Make routing, sheets, admin/test email, and templates without OpenAI credits. This mode exists so controlled workflow testing can continue without spending housing or essential-expense money.

Mock mode does not provide diagnosis, repair approval, purchase approval, listing certification, or safety clearance.

## Enable Mock Mode

For a local PowerShell session:

```powershell
$env:DRIVABLE_AI_MODE = "mock"
Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
$env:MASTER_INTAKE_WEBHOOK_URL = "YOUR_CONTROLLED_TEST_WEBHOOK"
npm run dev
```

Mock mode is also selected automatically when `OPENAI_API_KEY` is missing or empty. Never commit a real key or webhook URL.

## Pre-Checks

- Use a Glenn-owned test inbox.
- Disable customer email or hard-code it to the test inbox.
- Put Make in `Run once`.
- Confirm `MASTER_INTAKE_WEBHOOK_URL` is the controlled test webhook.
- Keep old scenarios available as backup.
- Confirm the test payload contains `aiMode: "mock"` and `reviewStatus: "mock_test_only"`.
- Confirm the warning reads: `Test response only. Not a real diagnosis or safety clearance.`

## Router Test Order

1. `support-concierge-request`
2. `marketplace-seller`
3. `diagnosis`
4. `buyer-interest`
5. `internal-diagnosis-response`

Use the mock payloads in `docs/automation/MAKE_MASTER_INTAKE_TEST_PAYLOADS_V1.md`.

## Verify Each Run

- Exactly one router branch fires.
- The raw JSON is retained.
- `aiMode` is `mock`.
- `reviewStatus` is `mock_test_only`.
- `needsHumanReview` is `true`.
- The mock warning remains visible in the sheet row and admin/test email.
- Low-risk tests include a structured `mockReport`.
- Critical-risk signals produce `mockReport: null` and a blocked reason.
- No OpenAI module is required for the mock branch.
- No real customer receives email.

Expected destinations:

| Intake type | Expected result |
|---|---|
| `support-concierge-request` | One `Support_Concierge` test row and admin/test email |
| `marketplace-seller` | One `Seller_Intake` test row and admin/test email |
| `diagnosis` | Existing diagnosis test destination or `Activity_Log`; no false AI success claim |
| `buyer-interest` | One `Buyer_Interest` test row and admin/test email |
| `internal-diagnosis-response` | One `Internal_Review_Log` test row or draft visible only internally |

## Switch to Live Later

1. Obtain approved OpenAI billing and a valid key.
2. Set `DRIVABLE_AI_MODE=live`.
3. Set `OPENAI_API_KEY` securely in the environment.
4. Test live AI only with controlled test data and a Glenn-owned inbox.
5. Verify live and mock results can be distinguished in raw JSON, sheets, and email.
6. Keep human review and the customer-send gate active.

The current backend does not call OpenAI directly. Setting live mode does not create a new live AI integration; it only stops the backend from adding mock fields to forwarded payloads.

## Stop Line

Stop before any real-customer send when:

- Mock labels or warnings are missing.
- A mock row or email looks like a real diagnosis.
- Customer recipient routing is uncertain.
- A critical-risk case receives mock diagnosis content.
- Human review is absent.
- The report status could become `approved_to_send` automatically.
- Raw JSON, route, sheet row, and email cannot be traced to the same test.
- Live mode is selected without a reviewed live AI workflow.
