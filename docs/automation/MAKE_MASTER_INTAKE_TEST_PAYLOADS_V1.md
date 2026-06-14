# Make Master Intake Test Payloads V1

## Purpose

Provide copy/paste JSON payloads to test the Drivable Master Intake Router scenario in Make.

## Testing Warning

- These are test payloads.
- Do not send customer confirmations to real users during testing.
- Keep old intake scenarios on until each master router branch is verified.
- Use test email addresses and test-only destinations while validating routes.

## A. support-concierge-request

```json
{
  "intakeType": "support-concierge-request",
  "submittedAt": "2026-06-09T19:00:00.000Z",
  "source": "drivable-concierge",
  "appBrand": "Drivable by Mechanic's Eye",
  "scenario": "buying_vehicle",
  "reportType": "buyer_remote_risk_review",
  "topic": "Help deciding whether a used vehicle is worth pursuing",
  "urgency": "normal",
  "customerName": "Make Test Buyer",
  "customerEmail": "make-test-buyer@example.com",
  "customerPhone": "555-010-1001",
  "preferredContactMethod": "email",
  "message": "I am considering a used vehicle with incomplete service records and want help identifying red flags before I arrange an inspection.",
  "relatedCaseId": "TEST-CASE-1001",
  "relatedListingId": "TEST-LISTING-1001",
  "sourceContext": {
    "page": "help",
    "selectedScenario": "buying_vehicle",
    "selectedReportType": "buyer_remote_risk_review",
    "topic": "Help deciding whether a used vehicle is worth pursuing",
    "recognizedQueryParams": {
      "scenario": "buying_vehicle",
      "reportType": "buyer_remote_risk_review",
      "topic": "used-vehicle-risk"
    }
  }
}
```

## B. diagnosis

```json
{
  "intakeType": "diagnosis",
  "submittedAt": "2026-06-09T19:05:00.000Z",
  "source": "drivable-diagnosis",
  "appBrand": "Drivable by Mechanic's Eye",
  "scenario": "current_problem",
  "reportType": "first_look_report",
  "customer": {
    "name": "Make Test Driver",
    "email": "make-test-driver@example.com",
    "phone": "555-010-1002"
  },
  "vehicle": {
    "year": 2014,
    "make": "Honda",
    "model": "Accord",
    "trim": "EX",
    "mileage": 142500
  },
  "symptoms": {
    "description": "The steering wheel vibrates between 55 and 65 mph and the vibration becomes more noticeable while braking.",
    "timing": "Started about two weeks ago",
    "warningLights": []
  },
  "media": {
    "photoLinks": [],
    "videoLinks": [],
    "audioLinks": [],
    "scanCodeScreenshots": []
  },
  "notes": "Test payload only. Return possible causes, missing evidence, confidence-rated next steps, and any safety concerns based on the information provided."
}
```

## C. marketplace-seller

```json
{
  "intakeType": "marketplace-seller",
  "sellerName": "Make Test Seller",
  "sellerEmail": "make-test-seller@example.com",
  "sellerPhone": "555-010-1003",
  "vehicleYear": 2011,
  "make": "Ford",
  "model": "F-150",
  "trim": "XLT",
  "mileage": 176000,
  "askingPrice": 7200,
  "knownIssues": "Air conditioning is not cold and the driver window moves slowly.",
  "recentRepairs": "Battery and front brake pads replaced within the last six months.",
  "titleStatus": "Clean",
  "runsAndDrives": "Yes",
  "listingType": "Standard Listing",
  "marketplaceBrand": "Drivable Marketplace",
  "appBrand": "Drivable by Mechanic's Eye",
  "source": "drivable-marketplace-seller-intake",
  "submittedAt": "2026-06-09T19:10:00.000Z"
}
```

## D. buyer-interest

```json
{
  "intakeType": "buyer-interest",
  "submittedAt": "2026-06-09T19:15:00.000Z",
  "source": "drivable-marketplace-buyer-interest",
  "appBrand": "Drivable by Mechanic's Eye",
  "customer": {
    "name": "Make Test Marketplace Buyer",
    "email": "make-test-marketplace-buyer@example.com",
    "phone": "555-010-1004",
    "city": "Tacoma",
    "state": "WA"
  },
  "vehicle": {
    "year": 2011,
    "make": "Ford",
    "model": "F-150",
    "trim": "XLT",
    "mileage": 176000,
    "askingPrice": 7200
  },
  "listingId": "TEST-LISTING-1001",
  "buyerQuestions": [
    "May I see the title before arranging payment?",
    "Can I bring an independent mechanic?",
    "Are there any warning lights or active leaks?"
  ],
  "scenario": "buying_vehicle",
  "reportType": "buyer_remote_risk_review"
}
```

Compatibility note: this test contract uses `buyer-interest` as requested for the new master-router branch. The current application routing map and server packet use `marketplace-buyer-interest`. Before production cutover, either update the Make filter to the emitted application value or intentionally standardize the application contract in a separate reviewed change.

## E. internal-diagnosis-response

```json
{
  "intakeType": "internal-diagnosis-response",
  "submittedAt": "2026-06-09T19:20:00.000Z",
  "source": "drivable-internal-review",
  "appBrand": "Drivable by Mechanic's Eye",
  "caseId": "TEST-CASE-1001",
  "reviewer": {
    "name": "Make Test Reviewer",
    "role": "Internal review"
  },
  "confidence": {
    "level": "moderate",
    "reason": "The symptom pattern supports several possible wheel, tire, brake, or suspension paths, but no inspection evidence is attached."
  },
  "recommendation": "Arrange an in-person wheel, tire, brake, and front suspension inspection before approving high-cost repairs.",
  "decisionPaths": [
    {
      "id": "professional_repair",
      "status": "recommended",
      "reason": "The concern affects braking and vehicle control."
    },
    {
      "id": "monitor_wait",
      "status": "not_recommended",
      "reason": "Waiting may be inappropriate until safety-related causes are ruled out."
    }
  ],
  "customerReadySummary": "Based on the information provided, possible causes include a tire or wheel issue, brake rotor variation, or worn steering or suspension parts. Confidence is moderate. An in-person inspection is recommended before continued highway driving or repair approval.",
  "internalNotes": "Test payload only. Confirm that the route saves the raw JSON and prepares an admin-reviewed response rather than sending directly to a real customer."
}
```

## Suggested Test Order

1. `support-concierge-request`
2. `marketplace-seller`
3. `diagnosis`
4. `buyer-interest`
5. `internal-diagnosis-response`

## Expected Make Router Filters

- `intakeType` equals `support-concierge-request`
- `intakeType` equals `marketplace-seller`
- `intakeType` equals `diagnosis`
- `intakeType` equals `buyer-interest`
- `intakeType` equals `internal-diagnosis-response`

## What to Verify in Make

- The correct route fires.
- A row is added to the expected sheet or tab.
- Raw JSON is saved somewhere.
- The admin email fires.
- Customer email is disabled or sent only to a test address during testing.
- No old scenario is turned off until the replacement branch is proven.

## Mock AI / No-Credit Testing

Use these payloads only for routing, sheet, admin/test email, and template checks. Every mock payload requires human review and must remain visibly labeled as test-only data.

### Mock diagnosis

```json
{
  "intakeType": "diagnosis",
  "submittedAt": "2026-06-13T18:15:00.000Z",
  "source": "drivable-diagnosis",
  "aiMode": "mock",
  "reviewStatus": "mock_test_only",
  "needsHumanReview": true,
  "customerFacingWarning": "Test response only. Not a real diagnosis or safety clearance.",
  "mockReport": {
    "aiMode": "mock",
    "reviewStatus": "mock_test_only",
    "reportType": "first_look_report",
    "scenario": "current_problem",
    "vehicleSummary": "2014 Honda Accord EX, 142500 miles",
    "symptomSummary": "Steering wheel vibration between 55 and 65 mph.",
    "possibleCauses": [
      "A possible symptom-related mechanical concern based on information provided",
      "A possible maintenance or wear concern that needs human review"
    ],
    "riskLevel": "low",
    "confidenceLevel": "low",
    "missingInformation": [
      "Qualified in-person inspection findings",
      "Relevant warning lights, scan codes, photos, or video",
      "Recent repair and maintenance history"
    ],
    "recommendedNextSteps": [
      "Have a human review the intake and mock output.",
      "Request missing evidence before making a repair or driving decision.",
      "Use a qualified in-person inspection when condition or safety is uncertain."
    ],
    "safetyWarning": "This mock report cannot determine whether a vehicle is safe to drive.",
    "customerFacingWarning": "Test response only. Not a real diagnosis or safety clearance.",
    "internalNote": "Mock test data only. Needs human review and must not be sent as a real customer report."
  }
}
```

### Mock support-concierge-request

```json
{
  "intakeType": "support-concierge-request",
  "submittedAt": "2026-06-13T18:16:00.000Z",
  "source": "drivable-concierge",
  "scenario": "buying_vehicle",
  "reportType": "buyer_remote_risk_review",
  "customerName": "Mock Support Tester",
  "customerEmail": "glenn-owned-test@example.com",
  "message": "I need help deciding what evidence to request before arranging an inspection.",
  "aiMode": "mock",
  "reviewStatus": "mock_test_only",
  "needsHumanReview": true,
  "customerFacingWarning": "Test response only. Not a real diagnosis or safety clearance.",
  "mockReport": {
    "aiMode": "mock",
    "reviewStatus": "mock_test_only",
    "reportType": "buyer_remote_risk_review",
    "scenario": "buying_vehicle",
    "vehicleSummary": "Vehicle details not provided",
    "symptomSummary": "Buyer needs help requesting evidence before inspection.",
    "possibleCauses": [
      "A possible vehicle-condition concern based on information provided",
      "A possible evidence or seller-claim gap that needs independent review"
    ],
    "riskLevel": "low",
    "confidenceLevel": "low",
    "missingInformation": [
      "Vehicle details and seller claims",
      "Photos, scan codes, and maintenance history",
      "Qualified in-person inspection findings"
    ],
    "recommendedNextSteps": [
      "Have a human review the support request.",
      "Ask for missing evidence without making a diagnosis claim.",
      "Use an independent inspection before a purchase decision."
    ],
    "safetyWarning": "This mock report cannot determine whether a vehicle is safe to drive.",
    "customerFacingWarning": "Test response only. Not a real diagnosis or safety clearance.",
    "internalNote": "Mock test data only. Needs human review and must not be sent as a real customer report."
  }
}
```

### Mock marketplace-seller

```json
{
  "intakeType": "marketplace-seller",
  "submittedAt": "2026-06-13T18:17:00.000Z",
  "source": "drivable-marketplace-seller-intake",
  "sellerName": "Mock Seller",
  "sellerEmail": "glenn-owned-test@example.com",
  "vehicleYear": "2011",
  "make": "Ford",
  "model": "F-150",
  "knownIssues": "Air conditioning is not cold.",
  "aiMode": "mock",
  "reviewStatus": "mock_test_only",
  "needsHumanReview": true,
  "customerFacingWarning": "Test response only. Not a real diagnosis or safety clearance.",
  "mockReport": {
    "aiMode": "mock",
    "reviewStatus": "mock_test_only",
    "reportType": "seller_as_is_listing_pack",
    "scenario": "selling_vehicle",
    "vehicleSummary": "2011 Ford F-150",
    "symptomSummary": "Seller reports that the air conditioning is not cold.",
    "possibleCauses": [
      "A possible maintenance or wear concern based on information provided",
      "A possible condition or disclosure gap that needs human review"
    ],
    "riskLevel": "low",
    "confidenceLevel": "low",
    "missingInformation": [
      "Qualified in-person inspection findings",
      "Repair records and supporting evidence",
      "Complete seller disclosure details"
    ],
    "recommendedNextSteps": [
      "Have a human review the seller intake.",
      "Preserve the seller's wording and request missing evidence.",
      "Do not make a certified-condition or repair guarantee."
    ],
    "safetyWarning": "This mock report cannot determine whether a vehicle is safe to drive.",
    "customerFacingWarning": "Test response only. Not a real diagnosis or safety clearance.",
    "internalNote": "Mock test data only. Needs human review and must not be published as a real listing assessment."
  }
}
```

### Mock buyer-interest

```json
{
  "intakeType": "buyer-interest",
  "submittedAt": "2026-06-13T18:18:00.000Z",
  "source": "drivable-marketplace-buyer-interest",
  "listingId": "TEST-LISTING-1001",
  "customer": {
    "name": "Mock Buyer",
    "email": "glenn-owned-test@example.com"
  },
  "aiMode": "mock",
  "reviewStatus": "mock_test_only",
  "needsHumanReview": true,
  "customerFacingWarning": "Test response only. Not a real diagnosis or safety clearance.",
  "mockReport": {
    "aiMode": "mock",
    "reviewStatus": "mock_test_only",
    "reportType": "buyer_remote_risk_review",
    "scenario": "buying_vehicle",
    "vehicleSummary": "TEST-LISTING-1001",
    "symptomSummary": "Buyer wants title, inspection, and condition evidence.",
    "possibleCauses": [
      "A possible vehicle-condition concern based on information provided",
      "A possible evidence or seller-claim gap that needs independent review"
    ],
    "riskLevel": "low",
    "confidenceLevel": "low",
    "missingInformation": [
      "Title and seller-authority verification",
      "Vehicle condition evidence",
      "Independent inspection findings"
    ],
    "recommendedNextSteps": [
      "Have a human review the buyer-interest record.",
      "Request title and condition evidence.",
      "Do not treat the mock output as purchase approval."
    ],
    "safetyWarning": "This mock report cannot determine whether a vehicle is safe to drive.",
    "customerFacingWarning": "Test response only. Not a real diagnosis or safety clearance.",
    "internalNote": "Mock test data only. Needs human review and must not be sent as a real buyer report."
  }
}
```

### Mock internal-diagnosis-response

```json
{
  "intakeType": "internal-diagnosis-response",
  "submittedAt": "2026-06-13T18:19:00.000Z",
  "source": "drivable-internal-review",
  "caseId": "TEST-CASE-1001",
  "customerEmail": "glenn-owned-test@example.com",
  "aiMode": "mock",
  "reviewStatus": "mock_test_only",
  "needsHumanReview": true,
  "customerFacingWarning": "Test response only. Not a real diagnosis or safety clearance.",
  "mockReport": {
    "aiMode": "mock",
    "reviewStatus": "mock_test_only",
    "reportType": "full_decision_report",
    "scenario": "current_problem",
    "vehicleSummary": "2014 Honda Accord",
    "symptomSummary": "Internal mock draft for workflow and template testing.",
    "possibleCauses": [
      "A possible symptom-related mechanical concern based on information provided",
      "A possible maintenance or wear concern that needs human review"
    ],
    "riskLevel": "low",
    "confidenceLevel": "low",
    "missingInformation": [
      "Qualified reviewer findings",
      "Supporting evidence",
      "Final approved customer wording"
    ],
    "recommendedNextSteps": [
      "Keep the draft internal.",
      "Complete human review before changing any send status.",
      "Do not send this mock content to a real customer."
    ],
    "safetyWarning": "This mock report cannot determine whether a vehicle is safe to drive.",
    "customerFacingWarning": "Test response only. Not a real diagnosis or safety clearance.",
    "internalNote": "Mock test data only. Needs human review and must remain internal."
  }
}
```

For a critical-risk test, expect `mockReport` to be `null` and `mockReportBlockedReason` to explain that mock diagnosis content was withheld. A blocked mock report is a successful safety result, not a router failure.
