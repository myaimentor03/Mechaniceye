# Drivable Mock AI Safety Rules V1

## Allowed Use

Mock responses are allowed only for routing, sheet, admin/test email, template, and controlled workflow testing.

## Required Rules

- A mock response is not a diagnosis.
- A mock response cannot be customer-sent as a real report.
- Every mock response must visibly show `aiMode: "mock"`.
- Every mock response must visibly show `reviewStatus: "mock_test_only"`.
- Every mock response must state: `Test response only. Not a real diagnosis or safety clearance.`
- Every mock response must set `needsHumanReview: true`.
- Mock output must never say a vehicle is safe to drive.
- Mock output must never guarantee a repair, result, cost, purchase, sale, title, or condition.
- Mock output must use possible, likely, based-on-information-provided, and needs-human-review language.
- Mock output must never hide that it is test data.
- Mock output must not include dangerous repair instructions.
- Critical-risk signals must block mock diagnosis content and require qualified human and in-person safety review.

## Customer Send Prohibition

Mock content must never receive `approved_to_send`. It must remain internal even when the router, sheet, and email-template test passes.

If mock content appears in a customer-addressed template, the recipient must be a Glenn-owned test inbox and the subject and body must remain visibly labeled `MOCK` or `TEST ONLY`.

## High-Risk Stop Line

Do not generate mock diagnosis content for brake failure, steering loss, overheating, fuel leak, smoke, fire, burning smell, oil-pressure warnings, wheel or tire separation, violent shaking, loss of control, or another critical safety signal.

The correct test result for those inputs is:

- `mockReport: null`
- `needsHumanReview: true`
- a visible blocked reason
- no customer send
