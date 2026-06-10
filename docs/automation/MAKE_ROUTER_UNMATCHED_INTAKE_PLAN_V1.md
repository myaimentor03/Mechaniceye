# Make Router Unmatched Intake Plan V1

## Purpose

Document a future fallback branch for Drivable Master Intake Router payloads whose `intakeType` does not match any approved primary route.

This is a planning document only. Do not build this route until the five main branches are tested and proven.

## Why an Unmatched Intake Route Matters

Without a fallback, a misspelled, new, empty, or unexpected `intakeType` can enter the master webhook without reaching an operational branch. That creates silent data loss and makes troubleshooting harder.

An unmatched route should:

- Capture enough safe information for an administrator to investigate.
- Preserve the original payload in an approved raw JSON location.
- Avoid sending customer confirmations.
- Avoid guessing which workflow should receive the intake.
- Create a visible routing-review task.
- Never expose webhook URLs, credentials, tokens, or internal secrets.

## Future Route Name

`Unknown Intake Type`

## Filter Logic

Configure the route with all conditions joined by `AND`:

```text
intakeType does not equal support-concierge-request
AND intakeType does not equal marketplace-seller
AND intakeType does not equal diagnosis
AND intakeType does not equal buyer-interest
AND intakeType does not equal internal-diagnosis-response
```

The filter must evaluate the incoming `intakeType` value. Do not filter on a sheet name, route label, source value, or email subject.

Also test missing, blank, and null `intakeType` behavior before enabling the route.

## Recommended Destination Sheet

Use one dedicated internal tab:

- Preferred: `Router_Errors`
- Alternative: `Unmatched_Intakes`

Do not create or rename the workbook tab casually after Make mappings are configured. Add the tab through a reviewed workbook schema update.

## Minimum Fields

| Field | Purpose |
|---|---|
| `submittedAt` | Incoming timestamp, or a Make-generated ISO timestamp when missing |
| `intakeType` | Exact received value, including blank or unknown values |
| `source` | Originating flow when supplied |
| `appBrand` | Brand identifier when supplied |
| `raw JSON` | Complete original bundle stored in an approved secure location |
| `errorReason` | Plain-language explanation such as `No approved router filter matched` |
| `nextAction` | Required investigation or routing decision |
| `assignedTo` | Internal owner responsible for review |
| `status` | Controlled review status |

## Recommended Status

`NEEDS_ROUTING_REVIEW`

Do not automatically convert this status to resolved. A person should confirm whether the payload represents:

- A misspelled existing intake type.
- A new intake type requiring a planned route.
- A test payload.
- An old integration still using a retired contract.
- An invalid or abusive request.
- A malformed payload that needs producer-side correction.

## Recommended Error Record

```json
{
  "submittedAt": "{{incoming submittedAt or Make timestamp}}",
  "intakeType": "{{incoming intakeType}}",
  "source": "{{incoming source}}",
  "appBrand": "{{incoming appBrand}}",
  "raw JSON": "{{approved raw bundle reference}}",
  "errorReason": "No approved router filter matched.",
  "nextAction": "Review the payload and assign it to an approved route or correct the producing integration.",
  "assignedTo": "{{internal owner}}",
  "status": "NEEDS_ROUTING_REVIEW"
}
```

## Notification Behavior

- Send an admin-only warning or create an internal task.
- Include the received `intakeType`, source, submitted time, and error-record location.
- Do not send a customer confirmation.
- Do not include raw secrets or the complete raw payload in email.
- Do not run a customer-facing OpenAI or email module.
- Rate-limit or group repeated identical errors if a broken producer creates noise.

## Testing Plan

After the five main branches pass:

1. Set the Make scenario to `Run once`.
2. Send a test payload with `intakeType: "test-unknown-intake"`.
3. Verify only `Unknown Intake Type` fires.
4. Verify none of the five approved branches fires.
5. Verify one error record is written to the approved destination.
6. Verify raw JSON is retained in the approved location.
7. Verify status is `NEEDS_ROUTING_REVIEW`.
8. Verify only the approved admin test inbox receives a warning.
9. Verify no customer email is sent.
10. Repeat with a missing or blank `intakeType`.

## Do Not Build Yet

Do not build or enable this route until all five main branches are tested:

- `support-concierge-request`
- `marketplace-seller`
- `diagnosis`
- `buyer-interest`
- `internal-diagnosis-response`

Building the unmatched branch too early can hide incorrect primary filters by catching payloads that should have reached a real route. First prove every main route with its matching payload, sheet row, raw JSON retention, OpenAI result, and test-email behavior.

## Enablement Gate

The future unmatched route may be enabled only when:

- All five main branches are marked PASS.
- Their exact `intakeType` filters are confirmed.
- The live app webhook target is confirmed.
- The destination error tab has been added through a reviewed schema change.
- Admin ownership and follow-up expectations are defined.
- Missing and unknown `intakeType` tests pass.
- Customer email is absent from the unmatched branch.
