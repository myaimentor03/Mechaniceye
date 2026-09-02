# Drivable Privacy-Safe Analytics and Launch Dashboard Contract V1

Status: Complete implementation contract. It does not authorize tracking installation or production configuration.

## Purpose and rules

Measure whether the public experience is reachable, understandable, reliable, and useful without copying vehicle evidence or personal details into marketing analytics.

1. Collect only data needed for a defined launch decision.
2. Never send names, contact details, addresses, VINs, plates, filenames, uploaded bytes, free-text concerns, seller statements, OBD codes, report text, mechanic messages, or precise location to analytics.
3. Use first-party opaque case/session identifiers only when policy-approved; never use them as advertising identifiers.
4. Keep evidence systems and marketing analytics logically separate.
5. Do not enable session replay, keystroke capture, form capture, or unrestricted URL/query capture.
6. Strip query strings and fragments. Allowlist SPA route labels rather than collecting raw URLs.
7. Do not activate non-essential analytics or advertising tags before applicable consent and policy controls pass review.
8. Give every metric a definition, owner, window, denominator, and data-quality check.

## Permitted common fields

| Field | Definition | Constraint |
|---|---|---|
| `event_name` | Approved identifier | Fixed vocabulary |
| `event_version` | Contract version | Integer |
| `occurred_at` | Event time | UTC, second precision |
| `route_name` | Approved route label | No raw URL |
| `release_id` | Deployed release | Non-secret identifier |
| `session_id` | Short-lived opaque ID | No cross-device stitching |
| `case_id` | Opaque case ID | Never sent to ad platforms |
| `device_class` | mobile, tablet, desktop, unknown | No fingerprint |
| `referrer_class` | direct, search, social, partner, press, paid, other | No full referrer URL |
| `consent_state` | essential_only, analytics_allowed, unknown | Actual control state |
| `result` | success, failure, abandoned, blocked | Fixed vocabulary |
| `error_class` | Approved coarse category | No stack trace or content |
| `duration_band` | under_1s, 1_to_3s, 3_to_10s, 10_to_30s, over_30s | No detailed behavior trail |

## Approved event vocabulary

| Event | Fires when | Forbidden payload |
|---|---|---|
| `page_viewed` | Approved route renders | Raw URL or query |
| `primary_cta_selected` | Primary CTA activates | User-derived CTA text |
| `case_started` | Workflow case is created | Vehicle/person details |
| `collection_step_completed` | Structured step completes | Field values, media, codes |
| `evidence_upload_attempted` | Upload begins | Filename, bytes, EXIF, URL |
| `evidence_upload_completed` | Durable upload acknowledgement occurs | Storage address or content hash in marketing tools |
| `analysis_requested` | Available analysis is requested | Evidence or prompt content |
| `report_ready` | Report is available to entitled user | Report contents or causes |
| `report_viewed` | Entitled user opens report | Report contents |
| `human_review_requested` | Review is requested | Reason text or contact data |
| `mechanic_handoff_requested` | Referral/handoff is requested | Symptom, location, contact, mechanic identity |
| `buyer_check_started` | Buyer Check begins | VIN, listing URL, seller data |
| `seller_disclosure_started` | Seller disclosure begins | Seller claims or vehicle data |
| `help_request_submitted` | Help request is accepted | Form contents/contact data |
| `policy_viewed` | Policy page opens | Replay or copy behavior |
| `client_error_seen` | Approved user-facing failure appears | Stack trace, response body, content |
| `service_wake_seen` | Loading interstitial exceeds threshold | IP or precise network identifiers |
| `consent_changed` | Consent choice changes | Consent UI free text |

An approved media class may name only an input category exposed by the release; it does not prove analysis. No vibration-analysis event may exist without validated instrumentation and an analysis contract.

## Required funnels

- Public comprehension: `page_viewed` → `primary_cta_selected` → `case_started`.
- Evidence to report: `case_started` → `collection_step_completed` → `analysis_requested` → `report_ready` → `report_viewed`.
- Human handoff: `report_viewed` → `human_review_requested` or `mechanic_handoff_requested`.

Report by approved route, device class, release, and consent-compatible acquisition class. Pair conversion with abandonment, support, provenance, and safety indicators. Never call a referral a match or booking.

## Grand-opening dashboard

| Signal | Decision use |
|---|---|
| Availability and cold-start incidence | No high-attention launch while material wake delays persist |
| Route correctness | Any primary navigation result opening the wrong page is NO-GO |
| Case-start and report completion | Investigate failures before increasing traffic |
| Report latency bands | Never publish unsupported speed claims |
| Evidence integrity | Any cross-vehicle exposure is immediate stop and incident response |
| Safety-language audit | Material bounded-language failure is NO-GO |
| Seller-claim audit | Systematic conversion of claims to facts is immediate stop |
| Help and review capacity | Pause traffic waves before capacity is exceeded |
| Policy-control health | Required consent, deletion, export, or contact failure is NO-GO |
| Accessibility | Critical blocker prevents launch |
| Substantiated complaint rate | Triggers incident review under owner-approved thresholds |

## Data-quality checks

- Measure and bound duplicate events.
- Reconcile required events with server workflow counts without exposing content.
- Reject route names outside the allowlist.
- Test for forbidden VIN-like strings, emails, phones, plates, diagnostic-code patterns, filenames, and free text.
- Consent-denied sessions produce only strictly necessary, policy-approved events.
- Label and exclude test, synthetic, bot, and monitoring traffic from public claims.
- Document event-version changes; do not silently mix incompatible dashboard periods.

## Decisions required before implementation

The owner and privacy/legal adviser must approve actual retention, deletion schedule, access roles, processor list, cross-border handling, consent basis, incident process, and alert thresholds. Until then, analytics is blocked beyond strictly necessary operational logging covered by an approved policy.

Marketing receives aggregate dashboards, not case evidence. Support and engineering access requires separate justification and audit.

## Advertising boundary

Do not send case creation, vehicle concerns, diagnostic behavior, report results, mechanic requests, or buyer/seller activity to advertising platforms for targeting. Paid measurement should use consented, aggregated campaign-level landing outcomes. Never build audiences from safety concerns, evidence, VINs, reports, or mechanic interactions.

## Claims boundary

No accuracy, speed, savings, customer-count, satisfaction, success-rate, or conversion claim may be published directly from a dashboard. Each requires a defined population, period, sample size, exclusions, methodology, reviewer, and claim-register entry.

## Implementation acceptance

Ready for launch review only when schema enforcement and forbidden-field tests pass; consent behavior, retention, processors, access, and deletion are approved; synthetic traffic is excluded; dashboards reconcile; thresholds are approved; and the incident lead can disable non-essential collection without a deployment.
