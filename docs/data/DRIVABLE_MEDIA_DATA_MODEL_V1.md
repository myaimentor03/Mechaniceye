# Drivable Media Data Model V1

## Purpose

Define how customer-uploaded media, internal test assets, approved external datasets, and synthetic assets may connect to a Drivable case. This is a planning model and does not authorize storage, upload, or AI processing.

## Proposed Fields

| Field | Type or controlled values | Purpose |
|---|---|---|
| `mediaId` | Stable unique ID | Primary media record identifier |
| `caseId` | Stable case ID, nullable only for approved datasets | Links media to the customer event |
| `sourceType` | `customer_upload`, `internal_test`, `external_dataset`, `synthetic` | Identifies provenance |
| `modality` | `image`, `video`, `audio`, `vibration`, `accelerometer`, `oscilloscope`, `scan_screenshot` | Describes the evidence form |
| `fileName` | Text | Original or safely normalized file name |
| `storageLocation` | Restricted storage reference | Pointer to object storage, not a public URL by default |
| `uploadTimestamp` | ISO 8601 timestamp | Records receipt time |
| `consentStatus` | Controlled status | Tracks permission for service, review, evaluation, or learning use |
| `licenseStatus` | Controlled status | Records external/synthetic usage rights |
| `vehicleYear` | Integer or unknown | Vehicle context |
| `make` | Text or unknown | Vehicle context |
| `model` | Text or unknown | Vehicle context |
| `engine` | Text or unknown | Vehicle context |
| `mileage` | Integer plus unit or unknown | Vehicle context at capture |
| `symptomCategory` | Seed category ID or unknown | Normalized relationship without replacing raw description |
| `capturedWhile` | `cold_start`, `idle`, `acceleration`, `braking`, `turning`, `highway_speed`, `parked`, `unknown` | Capture operating context |
| `safetyContext` | Structured flags and notes | Records whether capture was parked/safe and any hazards |
| `labels` | Versioned structured labels | Reviewer or model annotations with provenance |
| `confidence` | Calibrated value plus source | Confidence in labels or interpretation |
| `linkedReportId` | Stable report ID or null | Connects evidence used in a report |
| `linkedOutcomeId` | Stable outcome ID or null | Connects evidence supporting an outcome |
| `actualCauseConfirmed` | Cause reference plus verification level or null | Never inferred solely from media |
| `notes` | Restricted text | Supporting context, limitations, and provenance |

## Relationship Model

- One case may have many media records.
- One media record may support multiple draft or report evaluations through a join table.
- Outcome-supporting media should link to the outcome without overwriting the original case evidence.
- Labels should be versioned separately from the binary asset so review changes remain auditable.
- External and synthetic assets may exist without a customer case but require dataset, license, and provenance records.

## Consent and License Controls

- `customer_upload` requires clear service-use consent and a separately approved basis for evaluation or learning.
- `external_dataset` requires documented license scope, attribution requirements, restrictions, and deletion obligations.
- `synthetic` must be labeled as synthetic and must not be represented as a real confirmed customer case.
- Consent withdrawal or license expiration must be enforceable through storage and derived-data workflows.
- Do not expose private storage locations in prompts, logs, emails, or customer pages.

## Safety Controls

- Never instruct a customer to drive, brake, accelerate, turn, or recreate a dangerous symptom for evidence.
- Do not request recording while driving.
- Do not ask customers to crawl under vehicles, touch hot/moving parts, open pressurized systems, or approach smoke, fire, fuel, traffic, or unstable vehicles.
- High-risk media interpretation requires qualified human review or in-person help.
- Media alone does not certify a diagnosis or that a vehicle is safe.

## Privacy and Security

- Minimize faces, voices, license plates, VINs, addresses, precise location, bystanders, documents, and background identifiers.
- Strip metadata such as precise geolocation when it is not required and consented.
- Encrypt storage and transfer, restrict access by role, and log access to sensitive assets.
- Define retention, correction, deletion, export, and incident-response procedures before production collection.
- Keep derived labels linked to the consent and source record from which they came.
