# Master Intake Router Repair Plan — 2026-10-15

Status: local review notes only. This is not an import-ready blueprint, and no live Make scenario, workbook, email, webhook, database, or payment provider was changed or called.

## Verified application contract

Current `server/routes.ts` payload constructors emit flat `intakeType` values:

| Flow | Exact `intakeType` | Other routing fields |
|---|---|---|
| Buyer interest / remote risk review | `marketplace-buyer-interest` | `scenario=buying_vehicle`, `reportType=buyer_remote_risk_review` |
| Internal diagnosis response | `internal-diagnosis-response` | `scenario=current_problem`; `reportType` is the response type or `full_decision_report` |
| Concierge / guide request | `support-concierge-request` | `scenario` and `reportType` are supplied with controlled fallbacks |
| Diagnosis / decision intake | `diagnosis` | No `eventType`; the constructor owns `source`, `submissionStatus`, and `reviewStatus` |
| Seller listing intake | `marketplace-seller` | `scenario=selling_vehicle`, `reportType=seller_as_is_listing_pack` |
| Mechanic Match request | `mechanic-match-request` | Not one of the five branches below; keep in the internal routing-review fallback |

Do not substitute `eventType` for `intakeType`, and do not let request-body fields override server-owned diagnosis status or source fields.

## Exported router filter corrections

The newest local export inspected was the October 14 Master Intake Router blueprint. It has router module 2; route OpenAI module IDs in displayed order are 30, 40, 50, 10, and 20. Each route has a filter before OpenAI and another before Sheets.

| Branch | Purpose | Exact filter on both route OpenAI and Sheets modules | Exported state / correction |
|---|---|---|---|
| 1 | Buyer interest / remote risk review | `{{1.intakeType}}` equal to `marketplace-buyer-interest` | Both exported conditions use outdated `buyer-interest`; correct both. OpenAI module 30; Sheets 31; emails 32/33. |
| 2 | Internal diagnosis response | `{{1.intakeType}}` equal to `internal-diagnosis-response` | OpenAI condition is correct. Sheets condition has a leading space in its equality value; remove it. OpenAI 40; Sheets 41; email 42. |
| 3 | Concierge / guide request | `{{1.intakeType}}` equal to `support-concierge-request` | OpenAI condition is correct. Sheets condition has a leading space in its equality value; remove it. OpenAI 50; Sheets 51; emails 52/53. |
| 4 | Diagnosis / decision intake | `{{1.intakeType}}` equal to `diagnosis` | Both exported conditions are correct. OpenAI 10; Sheets 11; emails 12/13. |
| 5 | Seller listing intake | `{{1.intakeType}}` equal to `marketplace-seller` | Both exported conditions are correct. OpenAI 20; Sheets 21; emails 22/23. |

These five equalities are mutually exclusive for a single scalar `intakeType`. Make must separately route missing, blank, or unsupported values to a fallback; do not rely on a default route's implicit behavior without testing it.

## Mapping audit and safe corrections

### Branch 1 — Buyer interest

The webhook is flat (`buyerName`, `buyerEmail`, `buyerPhone`, `preferredContactMethod`, `listingTitle`, `listingUrl`, `buyerLocation`, `message`, `timeline`, `acknowledgments`). The exported Sheets map uses 73 seller-style fields, including `sellerName`, `sellerEmail`, `vehicle.year`, and `symptoms.*`; these are wrong or absent for the buyer payload. The configured live `Buyer_Interest` tab was reported as 27 headers, so the 73-value mapping cannot match its schema.

Proposed direct mappings only where both sides are verified: `BuyerName <- buyerName`, `BuyerEmail <- buyerEmail`, `BuyerPhone <- buyerPhone`, `BestContactMethod <- preferredContactMethod`, and `MessageToSeller <- message`. Do not infer location parts, listing IDs, offer/financing/trade values, test-drive requests, or inspection choices that the app does not send. Confirm the live header row in Make before mapping columns.

### Branch 2 — Internal diagnosis response

The app payload is flat: `caseId`, `customerName`, `customerEmail`, `vehicleYear`, `make`, `model`, `symptomsSummary`, `responseType`, `confidenceScore`, `confidenceBand`, `messageBody`, `followUpNeeded`, and `adminNotes`, plus common routing fields. The 19 exported destination values mostly use seller fields or nested paths such as `customer.name`, `vehicle.year`, and `symptoms.summary`, which do not match this flat payload. The configured workbook lacks the reported `Internal_Review` tab. Do not write to a guessed destination; confirm an approved internal-only destination and actual headers first.

### Branch 3 — Concierge / guide request

The app payload is flat and includes `guideRequested`, `helpTopic`, `customerName`, `customerEmail`, `customerPhone`, `relatedCaseId`, `relatedListingId`, `currentPage`, `urgency`, `preferredContactMethod`, `message`, `stuckStep`, `wantsHumanReview`, `scenario`, `reportType`, `topic`, `sourceContext`, and `acknowledgments`. The export maps 73 seller-style values, so this mapping is wrong. The configured workbook lacks the reported `Concierge_Requests` tab. `Support_Concierge` appears in local documentation but is not proof of a configured live tab. Confirm the destination and live headers before writing.

### Branch 4 — Diagnosis / decision intake

The configured `Diagnosis_Cases_v2/Sheet1` was reported as 27 headers, while this route exports 73 seller-style mapped values; the mapping is wrong. The app's diagnosis payload is flat and its server owns status/source fields. The verified destination field list supplied for `Sheet1` is: `caseId`, `submittedAt`, `intakeType`, `source`, `submissionStatus`, `reviewStatus`, `name`, `email`, `phone`, `vehicleInfo`, `vehicleYear`, `vehicleMake`, `vehicleModel`, `engine`, `mileage`, `description`, `symptomSummary`, `timing`, `whenItHappens`, `canDrive`, `urgency`, `vibrationNotes`, `soundNotes`, `obdCodes`, `repairHistory`, `openAiSummary`, `adminNotes`. Confirm these against the live Sheet again immediately before editing Make. Map only constructor-provided flat fields; `openAiSummary` must use this branch's OpenAI result and `adminNotes` must remain internal.

### Branch 5 — Seller listing

The destination `Seller_Intake` was reported as 73 populated headers, matching the exported map's 73 positions in count only. Many exported paths are nested (`vehicle.year`, `vehicle.make`, `vehicle.model`, `vehicle.trim`, `vehicle.vin`, `vehicle.mileage`, and `symptoms.*`) but the current seller constructor emits flat fields such as `vehicleYear`, `make`, `model`, `trim`, `vin`, `mileage`, `runsAndDrives`, and `knownIssues`. Those nested paths are wrong. Other Seller_Intake headers are not collected by the current app; leave them blank rather than inventing values. Reconfirm the live headers and map the actual flat fields one by one.

## OpenAI result binding

Every exported email mapper points at `{{2.result}}`, the router module, rather than its route's OpenAI module. Do not assume import remaps module IDs. In the Make mapping picker, select the OpenAI result from the same route: module 30 for branch 1, 40 for branch 2, 50 for branch 3, 10 for branch 4, and 20 for branch 5. After import, confirm each selected token against that route's actual OpenAI module; if IDs changed, select by module label/position in the current scenario rather than typing an ID.

Email recipients are customer-facing in the export. Keep these modules disabled during testing or replace them with an approved internal-only test destination in a separate test scenario. Never leave the candidate pointed at the live webhook, live customer recipients, or production workbook.

## Unmatched route

Create an explicit unmatched route for missing, blank, or unsupported `intakeType`. Store only safe correlation metadata (`intakeType`, `source`, `submittedAt`, a generated correlation ID, and a case/listing ID only when policy permits); do not store or email the full private payload. Set `NEEDS_ROUTING_REVIEW`, notify only an internal reviewer, and do not invoke customer-facing OpenAI or email modules. `mechanic-match-request` remains in this safe internal-review fallback until its dedicated workflow is verified.

## Remaining prerequisites / no candidate blueprint

- The live workbook is reported to lack `Internal_Review` and `Concierge_Requests`; no approved replacement destinations or verified live headers were provided here.
- The buyer and diagnosis mappings need their destination-specific schemas, not seller columns.
- No isolated test webhook, test workbook, or internal-only email destination is available in this checkout.
- The original export contains live endpoint, workbook, and customer-email configuration. It remains untouched. No corrected blueprint JSON was created because a safe, valid candidate cannot be produced without the isolated test configuration.

Next Make action: create a new disabled test scenario using an isolated webhook, test workbook tabs with reviewed headers, and internal-only email addresses; import a sanitized copy only after those values are available. Run one synthetic payload per exact route and one unmatched payload, verify exactly one route fires, and retain the old scenario until every row and error path is reviewed. Do not enable or schedule either scenario from this document.
