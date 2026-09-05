# Drivable Repository Readiness and Marketing Release Matrix V1

**Audit date:** 2026-08-24  
**Purpose:** Tie marketing availability claims to observable repository behavior.  
**Scope:** Read-only repository audit; this document does not declare deployed production behavior.

## 1. Executive Finding

The repository is strongest as a product concept, customer-flow prototype, intake/router foundation, and safety/report design system. It is not yet evidence of a fully operational diagnostic, account, review, marketplace, provider-verification, or guided-repair platform.

The most accurate launch posture is:

- **Drivable Check:** controlled beta intake and report-service candidate; not a live automated diagnostic product.
- **Buyer Check:** beta preview/context lookup candidate; not a complete buyer report or inspection service.
- **Mechanic Match:** manual request/referral-support intake; not automated matching, vetted-provider search, or booking.
- **Seller Check/ClearSale:** reviewed seller-intake and marketplace concept; not a transparency-enforced public marketplace.
- **Guided Service:** future/disabled; must not be advertised as available.
- **Accounts/Garage:** future/disabled; must not be advertised as available.

## 2. Status Vocabulary

| Status | Meaning | Marketing treatment |
|---|---|---|
| Observable prototype | A route/component demonstrates intended experience with sample or local behavior. | May be shown only as a clearly labeled preview or beta demonstration. |
| Intake-capable | Customer data can be validated and accepted/forwarded when required environment dependencies work. | May recruit controlled testers after end-to-end operational verification. |
| Operationally dependent | Behavior relies on environment variables, database, webhook, Make/Gmail, local filesystem, or manual staff. | Disclose manual/review nature; do not promise availability or turnaround until verified. |
| Mock/test only | Output is explicitly test data and cannot be customer-sent as real guidance. | Internal demonstration only. |
| Disabled/future | Feature flag or code path indicates it is intentionally unavailable. | Coming soon only; no conversion CTA. |
| Production-ready | Security, persistence, safety, operations, support, monitoring, and end-to-end behavior are proven. | No audited product currently meets this bar. |

## 3. Product Release Matrix

### 3.1 Drivable Check

**Observed foundation**

- A default two-step vehicle/problem intake exists in `client/src/TestBackend.tsx`.
- A legacy diagnosis page posts to `/api/diagnoses` and routes to a result page.
- The diagnosis endpoint normalizes intake, creates a case response, attempts database insertion, and forwards to configured webhooks.
- The repository contains structured report previews, evidence checklists, missing-information, roadside, review, send-gate, and outcome components.
- Safety and report contracts exist under `shared/` and `docs/product/`.

**Material gaps/limitations**

- `/api/diagnoses` primarily creates/forwards an intake case; it does not return a completed customer diagnosis report.
- `server/drivable-ai-mode.ts` defaults to mock unless live mode is explicitly configured.
- Mock reports are labeled test-only and cannot be delivered as real reports.
- `server/storage.ts` uses in-memory maps for much runtime behavior; records do not constitute durable account-scoped Garage history.
- The follow-up analysis uses keyword-scored static scenarios, not evidence-calibrated diagnostic confirmation.
- Review UI exists, but complete reviewer authentication, qualifications, queue operations, immutable release, and delivery proof are not established by this audit.
- Legacy UI copy claims “AI-powered vehicle diagnostics” and “instant analysis,” which conflicts with the approved product contract.

**Release classification:** `intake-capable / observable prototype / operationally dependent`

**Marketing allowed now**

- Recruit controlled beta participants for non-emergency cases.
- Demonstrate how intake, evidence, possible-cause, missing-information, and report concepts are intended to work.
- Say the team is building/testing Drivable Check.

**Marketing prohibited now**

- “Instant diagnosis,” “tells you what is wrong,” or “diagnostic machine” as a current capability.
- Live AI, confirmed causes, accuracy, savings, or customer-ready human review claims.
- Guaranteed response or report turnaround.

### 3.2 Buyer Check

**Observed foundation**

- `/buyer-check` provides a buyer-focused landing/preview.
- A year/make/model lookup calls `/api/buyer-risk/vehicle-knowledge`.
- The backend endpoint retrieves contextual vehicle knowledge when database configuration and matching data are available.
- A Buyer Risk preview demonstrates claims, missing evidence, red flags, and walk-away language.
- Buyer-focused seed data, safety language, and report contracts exist.

**Material gaps/limitations**

- The landing page routes to a sample buyer-risk review rather than a complete persisted buyer case/report workflow.
- Vehicle knowledge is contextual and depends on database/knowledge-pack coverage; it is not VIN-level verification.
- No audited workflow proves listing ingestion, claim provenance, evidence reuse, human review, immutable buyer report release, or independent inspection completion.
- Buyer-interest intake is marketplace lead forwarding, not Buyer Check analysis.

**Release classification:** `observable prototype / contextual lookup / operationally dependent`

**Marketing allowed now**

- Recruit Buyer Check beta testers.
- Demonstrate claims-versus-evidence, missing-proof, red-flag, and inspection-question concepts.
- Explicitly label vehicle knowledge as context, not vehicle-specific proof.

**Marketing prohibited now**

- “Buyer Check tells you what is right with the car.”
- Inspection, title, ownership, mileage, seller, condition, or transaction verification.
- Comprehensive VIN coverage or guaranteed knowledge results.

### 3.3 Mechanic Match

**Observed foundation**

- A detailed request form collects customer/location, vehicle, problem, drivability, urgency, preferred provider type, budget, evidence availability, prior case, sharing permission, and acknowledgments.
- The backend validates `/api/mechanic-match/request` and forwards the request to `MASTER_INTAKE_WEBHOOK_URL`.
- The UI accurately describes V1 as request/referral support rather than live booking.

**Material gaps/limitations**

- No public provider database, verified provider inventory, specialty taxonomy validation, ranking engine, live availability, scheduling, pricing, or booking is proven.
- `server/storage.ts` contains only a placeholder “Mechanic Queue” entry for local behavior.
- Fulfillment depends on a configured webhook and manual/admin operations.
- No operating vetting standard or verification record is established.

**Release classification:** `manual intake / operationally dependent`

**Marketing allowed now**

- Describe a controlled beta/manual referral request only after webhook and operator fulfillment are tested.
- Explain the future handoff and matching vision.

**Marketing prohibited now**

- “Find a vetted mechanic,” “matched instantly,” live availability, booking, ratings, provider count, guaranteed specialty, price, or outcome.

### 3.4 Seller Check and ClearSale

**Observed foundation**

- ClearSale landing and marketplace pages exist.
- Seller intake captures vehicle/seller data and required acknowledgments.
- The backend validates seller intake and forwards it through the master intake webhook.
- Buyer-interest capture, marketplace guidance, terms, checklists, and submission confirmation exist.
- Product/data documents define claim attribution, disclosure prompts, evidence, and marketplace boundaries.

**Material gaps/limitations**

- The observed browse/listing experience contains sample content and does not prove a live inventory system.
- No enforced evidence provenance, listing version history, transparency profile, independent verification, moderation/dispute system, account authorization, or publication review is proven end to end.
- Webhook forwarding is not a marketplace database, listing approval system, or transaction workflow.
- ClearSale does not handle title, funds, transport, tax, registration, inspection, or disputes.

**Release classification:** `seller-intake prototype / marketplace concept / operationally dependent`

**Marketing allowed now**

- Explain and test the transparent seller-intake/listing-pack concept.
- Recruit sellers willing to separate claims, evidence, known issues, and unknowns.
- Use “coming soon” for the marketplace.

**Marketing prohibited now**

- Live public marketplace availability unless deployment evidence separately proves it.
- “Verified sellers,” “honest cars,” “no misleading listings,” “title checked,” or completed transaction claims.

### 3.5 Guided Service and Repair Instructions

**Observed foundation**

- Legacy diagnosis results, fix history, step-completion, follow-up, and repair-related components/routes exist.
- Future product documentation describes DIY caution and professional escalation.

**Material gaps/limitations**

- `stepByStepRepair`, `fixHistory`, `chatExport`, and `repairGuideGenerator` are explicitly false in `client/src/lib/featureFlags.ts`.
- Some legacy static repair guidance includes unsafe or overbroad patterns that require separate safety review.
- No task-tiering, vehicle-specific procedure validation, tool/environment check, service-manual rights, torque/spec source, or guided human-support operation is established.

**Release classification:** `disabled/future`

**Marketing allowed now**

- Long-term roadmap language only.

**Marketing prohibited now**

- Repair instructions, guided fixes, fix tracking, or remote guided service as available features.

### 3.6 Accounts, Roles, Garage, and Evidence Reuse

**Observed foundation**

- A Drizzle schema draft/current schema includes users and diagnosis-related records.
- Product/data documents define accounts, roles, vehicles, evidence, reports, and outcomes.

**Material gaps/limitations**

- `profile` and `history` feature flags are false.
- The audited UI does not establish authenticated customer accounts, role enforcement, account-scoped vehicle ownership, durable Garage, evidence consent/reuse, export/deletion, or privileged reviewer/provider authentication.
- In-memory storage is not sufficient evidence of durable multi-user isolation.

**Release classification:** `disabled/future / design foundation`

**Marketing allowed now:** none as current functionality.

**Marketing prohibited now:** account, Garage, saved history, reusable evidence, role-based review, or provider portal availability.

## 4. Cross-Cutting Readiness Gaps

The following block a scaled beta or public launch regardless of visible page completeness:

1. **Canonical customer flow:** remove or gate conflicting legacy routes/copy and define which experience is authoritative.
2. **Live analysis contract:** prove model/rule behavior, structured output validation, safety handling, confidence, and missing-evidence logic.
3. **Durable identity/persistence:** account isolation, vehicle/evidence records, consent, access, retention, correction, and deletion.
4. **Human review operations:** authentication, qualifications, queue, service levels, audit, immutable release, delivery, incident handling.
5. **Environment dependencies:** database, master webhook, Make/Gmail, local/public storage behavior, notifications, and failure recovery.
6. **Security/privacy:** uploaded media scanning, signed access, sensitive data handling, secrets, logs, abuse, and data lifecycle.
7. **Product QA:** end-to-end test environments, supported browsers/devices, accessibility, analytics, monitoring, and rollback.
8. **Legal/marketplace policy:** claims, AI disclosure, terms, provider verification, seller/listing moderation, complaints, and jurisdiction scope.
9. **Operational capacity:** reviewer/support staffing, beta limits, turnaround, escalation, correction, and adverse-event response.
10. **Substantiation:** verified outcomes before performance or comparative advertising.

## 5. Immediate Marketing Truth Table

| Customer-facing phrase | Status | Replacement |
|---|---|---|
| “AI-powered vehicle diagnostics at your fingertips” | Do not use | “Evidence-centered guidance for a clearer next vehicle decision.” |
| “Upload for instant analysis” | Do not use | “Submit a non-emergency case for the controlled beta.” |
| “Drivable tells you what is wrong” | Do not use | “Drivable organizes possible causes, confidence, and what to check next.” |
| “Buyer Check shows what is right” | Do not use | “Buyer Check shows supported positives, risks, contradictions, and unknowns.” |
| “Find vetted mechanics” | Do not use yet | “Request help identifying the type of provider that may fit.” |
| “Transparent marketplace” | Vision/coming soon | “A marketplace being designed to keep claims, evidence, and unknowns visible.” |
| “Step-by-step repair help” | Coming soon only | “Guided Service is planned and will require task-specific safety controls.” |

## 6. Recommended Release Labels

Use these exact labels until stronger evidence changes the matrix:

- **Drivable Check — Closed beta in preparation**
- **Buyer Check — Closed beta in preparation**
- **Mechanic Match — Manual referral pilot planned**
- **Seller Check — Pilot workflow planned**
- **ClearSale Marketplace — Coming soon**
- **Guided Service — Future roadmap**

Do not use “available now,” “live,” “production-ready,” or “vetted” based only on repository routes or previews.

## 7. Evidence Reviewed

- `client/src/TestBackend.tsx`
- `client/src/pages/home.tsx`
- `client/src/pages/diagnosis.tsx`
- `client/src/pages/results.tsx`
- `client/src/components/DrivablePreviewHub.tsx`
- `client/src/components/BuyerCheckPreview.tsx`
- `client/src/components/ClearSalePreview.tsx`
- `client/src/components/MechanicMatchPreview.tsx`
- `client/src/marketplace/Marketplace.tsx`
- `client/src/lib/featureFlags.ts`
- `server/routes.ts`
- `server/storage.ts`
- `server/enhanced-analysis.ts`
- `server/drivable-ai-mode.ts`
- `server/mock-drivable-report.ts`
- `server/case-storage.ts`
- `shared/drivableDecisionEngine.ts`
- `shared/drivableReportTypes.ts`
- `shared/drivableReportStatus.ts`

This audit is repository evidence, not a deployment test. Environment configuration and external Make/Gmail/webhook behavior still require separate end-to-end verification.
