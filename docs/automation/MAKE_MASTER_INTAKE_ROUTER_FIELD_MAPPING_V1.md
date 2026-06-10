# Make Master Intake Router Field Mapping V1

## Purpose

Use this guide to build and verify the Drivable Master Intake Router one branch at a time without guessing webhook field names or Google Sheet headers.

The payload examples referenced below are in `MAKE_MASTER_INTAKE_TEST_PAYLOADS_V1.md`. The exact workbook tab names and Row 1 headers are defined in `DRIVABLE_MASTER_WORKBOOK_SCHEMA_V1.md` and `DRIVABLE_MASTER_WORKBOOK_HEADERS_V1.csv`.

## Critical Rules

- Router filters use exact `intakeType` values, not sheet names, route labels, or source values.
- In each route, map the OpenAI result from the OpenAI module in that same route. Do not map an OpenAI output token from another router branch.
- Do not send real customer emails during testing. Disable customer email modules or restrict them to an approved test address.
- Do not turn off an old scenario until its matching master-router branch has received a test payload, written the expected record, handled errors, and produced the expected admin output.
- Preserve the complete incoming bundle before transforming fields. The V1 workbook does not currently have a dedicated `Raw JSON` header, so store raw JSON in a Make Data Store, controlled archive, or other approved test log until a schema change is reviewed.
- Never store webhook URLs, credentials, access tokens, or secret environment values in a workbook cell.

## Router Filter Table

| Branch | Filter field | Operator | Exact filter value | Primary workbook destination |
|---|---|---|---|---|
| Concierge support | `intakeType` | Equal to | `support-concierge-request` | `Support_Concierge` |
| Marketplace seller | `intakeType` | Equal to | `marketplace-seller` | `Seller_Intake` |
| Diagnosis | `intakeType` | Equal to | `diagnosis` | Existing diagnosis case flow plus `Activity_Log` |
| Buyer interest | `intakeType` | Equal to | `buyer-interest` | `Buyer_Interest` |
| Internal diagnosis response | `intakeType` | Equal to | `internal-diagnosis-response` | `Internal_Review_Log` |

The current application routing map and server packet use `marketplace-buyer-interest`, while this requested master-router test branch uses `buyer-interest`. Do not silently combine them. During testing, use the exact filter above. Before production cutover, make a deliberate contract decision so the emitted application value and Make filter match.

## Minimum Mapping Priority

### Phase 1

- `intakeType`
- `submittedAt`
- `source`
- contact
- vehicle
- scenario
- reportType
- message/issues
- AI summary
- raw JSON
- status

### Phase 2

- media links
- acknowledgments
- pricing/listing options
- internal assignment/follow-up fields

### Phase 3

- advanced routing, errors, and customer confirmations

## Branch Build Checklist

Complete this minimum checklist for every intake route:

1. Add the exact `intakeType` filter.
2. Run the matching payload from `MAKE_MASTER_INTAKE_TEST_PAYLOADS_V1.md`.
3. Confirm the route receives exactly one bundle.
4. Map the original submitted timestamp and source.
5. Map contact and vehicle fields that exist for that intake.
6. Map scenario, report type, and message or issue context.
7. Run the route's own OpenAI module, if used.
8. Map that route's OpenAI output to the designated summary field.
9. Preserve the original raw JSON outside the workbook until a dedicated header is approved.
10. Set the route's controlled default status.
11. Add an `Activity_Log` record when operational traceability is needed.
12. Keep customer email disabled or test-only.
13. Verify the expected sheet row, admin output, and error path.
14. Leave the old scenario active until the new route is proven.

## support-concierge-request

**Router filter:** `intakeType` equals `support-concierge-request`

**Primary tab:** `Support_Concierge`

**Default status:** `New Support Request`

### Minimum Field Mapping

| `Support_Concierge` header | Incoming field or Make value | Mapping note |
|---|---|---|
| `Submitted At` | `submittedAt` | Preserve the incoming ISO timestamp. |
| `Intake Type` | `intakeType` | Must remain `support-concierge-request`. |
| `Source` | `source` | Expected test value: `drivable-concierge`. |
| `Guide Requested` | `reportType` | Use the selected Drivable report type when `guideRequested` is not present. |
| `Help Topic` | `topic` | Fall back to `helpTopic` when supplied by the live app. |
| `Customer Name` | `customerName` | Direct mapping. |
| `Customer Email` | `customerEmail` | Required by the V1 workbook. Use a test address during testing. |
| `Customer Phone` | `customerPhone` | Direct mapping. |
| `Related Case ID` | `relatedCaseId` | Leave blank when not supplied. |
| `Related Listing ID` | `relatedListingId` | Leave blank when not supplied. |
| `Current Page` | `sourceContext.page` | Fall back to `currentPage`. |
| `Urgency` | `urgency` | Direct mapping. |
| `Preferred Contact Method` | `preferredContactMethod` | Direct mapping. |
| `Message` | `message` | Preserve the customer's original message. |
| `Stuck Step` | `stuckStep` | Leave blank when absent. |
| `Wants Human Review` | `wantsHumanReview` | Boolean or workbook-safe Yes/No value. |
| `Acknowledgments` | `acknowledgments` | Serialize as compact JSON or readable accepted values. |
| `Status` | Make constant | `New Support Request`. |
| `Admin Notes` | Route's OpenAI summary plus context | Use only the OpenAI result generated inside this support route. Include `scenario` and `reportType` if useful. |

### Context Fields to Preserve

- `scenario`
- `reportType`
- `topic`
- `sourceContext.selectedScenario`
- `sourceContext.selectedReportType`
- `sourceContext.recognizedQueryParams`

These context fields do not all have dedicated V1 columns. Preserve them in raw JSON. A concise, non-sensitive context summary may also be appended to `Admin Notes`.

## marketplace-seller

**Router filter:** `intakeType` equals `marketplace-seller`

**Primary tab:** `Seller_Intake`

**Default status:** `New Seller Intake`

### Minimum Field Mapping

| `Seller_Intake` header | Incoming field or Make value | Mapping note |
|---|---|---|
| `Submitted At` | `submittedAt` | Preserve the incoming ISO timestamp. |
| `Intake Type` | `intakeType` | Must remain `marketplace-seller`. |
| `Source` | `source` | Expected value: `drivable-marketplace-seller-intake`. |
| `App Brand` | `appBrand` | Direct mapping. |
| `Marketplace Brand` | `marketplaceBrand` | Direct mapping. |
| `Seller Name` | `sellerName` | Direct mapping. |
| `Seller Email` | `sellerEmail` | Required by the V1 workbook. |
| `Seller Phone` | `sellerPhone` | Direct mapping. |
| `Vehicle Year` | `vehicleYear` | Direct mapping. |
| `Make` | `make` | Direct mapping. |
| `Model` | `model` | Direct mapping. |
| `Trim` | `trim` | Leave blank when absent. |
| `Mileage` | `mileage` | Keep numeric when possible. |
| `VIN` | `vin` | Leave blank when absent. |
| `Title Status` | `titleStatus` | Direct mapping. |
| `Asking Price` | `askingPrice` | Keep numeric when possible. |
| `Location` | `city` + `state` + `zip` | Join only the supplied location parts. |
| `Condition Summary` | Route's OpenAI summary | Use the OpenAI result from this seller route, based on submitted condition facts. |
| `Known Issues` | `knownIssues` | Preserve seller wording. Do not replace it with the AI summary. |
| `Drivable Status` | `runsAndDrives` | Direct mapping or normalize to a controlled readable value. |
| `Listing Goal` | `listingType` | Direct mapping. |
| `Photos Available` | photo field or media count | Phase 2; leave blank when no media metadata exists. |
| `Acknowledgments` | `acknowledgments` | Serialize accepted seller acknowledgments safely. |
| `Status` | Make constant | `New Seller Intake`. |
| `Admin Notes` | `recentRepairs` plus internal route notes | Keep internal notes separate from public listing copy. |

### Phase 2 Seller Fields

- Media or photo links
- Pricing help interest
- Requested listing package
- Featured listing interest
- Mechanic review interest
- Inspection referral interest
- Paperwork guidance interest
- Weekend Offer Event interest
- Internal assignment and follow-up date

Only map these when the receiving workbook has an approved destination header or a separate workflow record. Do not rename existing headers inside Make to force a fit.

## diagnosis

**Router filter:** `intakeType` equals `diagnosis`

**Primary destination:** Existing diagnosis case flow

**Operational log tab:** `Activity_Log`

The V1 operations workbook does not define a standalone raw diagnosis intake tab. Do not redirect or replace the existing diagnosis storage, database, or webhook flow with this documentation. The master-router test branch should validate routing and may append a safe operational summary to `Activity_Log`.

### Minimum Source Mapping

| Logical destination | Incoming field | Mapping note |
|---|---|---|
| Intake type | `intakeType` | Must remain `diagnosis`. |
| Submitted time | `submittedAt` | Preserve the incoming ISO timestamp. |
| Source | `source` | Expected test value: `drivable-diagnosis`. |
| Contact | `customer.name`, `customer.email`, `customer.phone` | Use only in approved diagnosis modules and destinations. |
| Vehicle | `vehicle.year`, `vehicle.make`, `vehicle.model`, `vehicle.trim`, `vehicle.mileage` | Keep structured fields separate where the destination supports them. |
| Scenario | `scenario` | Expected test value: `current_problem`. |
| Report type | `reportType` | Expected test value: `first_look_report`. |
| Message/issues | `symptoms.description`, `symptoms.timing`, `symptoms.warningLights`, `notes` | Preserve the user's observations separately from conclusions. |
| Media | `media.photoLinks`, `media.videoLinks`, `media.audioLinks`, `media.scanCodeScreenshots` | Phase 2. |
| AI summary | Route's OpenAI result | Use this diagnosis route's OpenAI module output only. Require possible-cause and confidence language. |
| Raw JSON | Original webhook bundle | Store outside the V1 workbook until a dedicated field is approved. |
| Status | Existing diagnosis status or Make route status | Do not overwrite the application's diagnosis status contract. |

### Optional `Activity_Log` Mapping

| `Activity_Log` header | Source |
|---|---|
| `Submitted At` | `submittedAt` |
| `Activity Type` | Make constant: `Diagnosis Intake Routed` |
| `Related Intake Type` | `intakeType` |
| `Related Case ID` | Case ID returned or supplied by the existing case flow |
| `Related Listing ID` | Blank |
| `Customer Email` | `customer.email` |
| `Summary` | Safe route summary or this route's OpenAI summary |
| `Status` | `Logged`, `Warning`, or `Failed` |
| `Admin Notes` | Safe operational notes only |

## buyer-interest

**Router filter:** `intakeType` equals `buyer-interest`

**Primary tab:** `Buyer_Interest`

**Default status:** `New Buyer Interest`

### Minimum Field Mapping

| `Buyer_Interest` header | Incoming field or Make value | Mapping note |
|---|---|---|
| `Submitted At` | `submittedAt` | Preserve the incoming ISO timestamp. |
| `Intake Type` | `intakeType` | For this test branch, map `buyer-interest` exactly. |
| `Source` | `source` | Expected value: `drivable-marketplace-buyer-interest`. |
| `Listing ID` | `listingId` | Required by the V1 workbook. |
| `Vehicle Label` | vehicle year + make + model + trim | Build from `vehicle.year`, `vehicle.make`, `vehicle.model`, and optional `vehicle.trim`. |
| `Buyer Name` | `customer.name` | Direct mapping. |
| `Buyer Email` | `customer.email` | Required by the V1 workbook. |
| `Buyer Phone` | `customer.phone` | Direct mapping. |
| `Preferred Contact Method` | `preferredContactMethod` | Leave blank when absent. |
| `Buyer Message` | joined `buyerQuestions` | Preserve each question; join with line breaks or a safe delimiter. |
| `Financing Needed` | `financingNeeded` | Phase 2; leave blank when absent. |
| `Trade In` | `tradeIn` or `tradeOffer` | Phase 2; leave blank when absent. |
| `Urgency` | `urgency` | Leave blank when absent. |
| `Acknowledgments` | `acknowledgments` | Phase 2; serialize safely when supplied. |
| `Status` | Make constant | `New Buyer Interest`. |
| `Admin Notes` | Route's OpenAI buyer summary | Use the OpenAI result generated inside this buyer-interest route. Include `scenario` and `reportType` only as useful context. |

### Buyer Context to Preserve

- `scenario`: expected test value `buying_vehicle`
- `reportType`: expected test value `buyer_remote_risk_review`
- Complete structured `vehicle` object
- Original `buyerQuestions` array
- Original raw JSON

The current workbook's `Intake Type` default is `marketplace-buyer-interest`. Because this master-router branch is intentionally testing `buyer-interest`, do not depend on the sheet default. Map the incoming `intakeType` explicitly during testing.

## internal-diagnosis-response

**Router filter:** `intakeType` equals `internal-diagnosis-response`

**Primary tab:** `Internal_Review_Log`

**Default status:** `New Internal Review`

### Minimum Field Mapping

| `Internal_Review_Log` header | Incoming field or Make value | Mapping note |
|---|---|---|
| `Submitted At` | `submittedAt` | Preserve the incoming ISO timestamp. |
| `Intake Type` | `intakeType` | Must remain `internal-diagnosis-response`. |
| `Source` | `source` | Expected value: `drivable-internal-review`. |
| `Case ID` | `caseId` | Required by the V1 workbook. |
| `Customer Name` | `customerName` | Leave blank when absent from the packet. |
| `Customer Email` | `customerEmail` | Use a test address during testing; leave blank only if the test sheet allows it. |
| `Vehicle Year` | `vehicle.year` or `vehicleYear` | Map whichever approved packet shape is present. |
| `Make` | `vehicle.make` or `make` | Map whichever approved packet shape is present. |
| `Model` | `vehicle.model` or `model` | Map whichever approved packet shape is present. |
| `Diagnosis Summary` | `customerReadySummary` | This is the reviewed customer-ready summary, not raw internal notes. |
| `Recommended Response` | `recommendation` | Direct mapping. |
| `Confidence Level` | `confidence.level` | Approved values include `low`, `moderate`, `high`, and `insufficient_information`. |
| `Needs Human Review` | Make rule or incoming flag | Set true for safety, title, structural, high-cost, low-confidence, or conflicting-evidence cases. |
| `Draft Created` | Gmail/OpenAI draft module result | Set only after the draft module succeeds. |
| `Status` | Make constant or workflow result | Start with `New Internal Review`. |
| `Admin Notes` | `internalNotes`, `confidence.reason`, and decision path summary | Keep internal-only content out of customer-facing modules. |

### Decision Path Mapping

Preserve `decisionPaths` as structured raw JSON. If Make creates a readable admin summary, use the approved IDs:

- `professional_repair`
- `diy_repair`
- `sell_as_is`
- `monitor_wait`
- `walk_away`

Do not convert a possible cause or confidence-rated recommendation into a guaranteed diagnosis.

## OpenAI Module Mapping Rules

For every route that uses OpenAI:

1. Place the OpenAI module after the router filter and after any required field normalization.
2. Feed only the current route's incoming bundle and approved reference context into that module.
3. Map the OpenAI result token from that same module into the route's summary or draft field.
4. Do not select an identically named OpenAI result from another route.
5. Keep original customer text in its original workbook field; AI output belongs in summary, draft, or admin-note fields.
6. Require uncertainty-aware language such as possible causes, supporting evidence, missing evidence, confidence, and next checks based on information provided.
7. Require human review before sensitive customer communication involving safety, title, structural condition, or high-cost repairs.

## Raw JSON Handling

`DRIVABLE_MASTER_WORKBOOK_HEADERS_V1.csv` currently has no dedicated `Raw JSON` header on the five primary destination tabs. For Phase 1:

- Preserve the original webhook bundle in Make execution history during controlled testing.
- Prefer a Make Data Store or approved secure archive for longer retention.
- Do not place raw JSON in `Admin Notes` unless a reviewed schema decision explicitly authorizes it.
- Do not add or rename Google Sheet headers ad hoc after Make mappings are configured.
- Propose a workbook schema revision separately if permanent raw JSON storage is required.

## Final Branch Verification

Before declaring a branch proven:

- The exact `intakeType` filter fires and no sibling route fires.
- Required contact and identifier fields reach the intended module.
- The expected workbook tab receives one correctly mapped row.
- Status uses the controlled default value.
- The original raw JSON is retained in the approved test location.
- The route's own OpenAI result populates the intended summary or draft field.
- Admin notification goes only to the approved test destination.
- Customer email is disabled or limited to an approved test address.
- Error handling records a safe failure without exposing secrets.
- The old scenario remains active until all checks pass.
