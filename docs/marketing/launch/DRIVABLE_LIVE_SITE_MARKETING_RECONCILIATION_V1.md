# Drivable Live-Site Marketing Reconciliation V1

**Inspected:** 2026-08-24  
**Canonical public URL observed:** [`https://www.getdrivable.com/`](https://www.getdrivable.com/)  
**Redirect observed:** `https://getdrivable.com/` → HTTP 301 → `https://www.getdrivable.com/` → HTTP 200  
**Inspection:** Read-only desktop and 390 px mobile review; no site, DNS, hosting, analytics, or repository changes were made.

This report converts the observed public experience into marketing release gates. It does not authorize application changes.

## 1. Executive Decision

The site is suitable as evidence of an active project and for controlled internal review, but it is **not ready for a coordinated high-impact public launch or paid traffic**.

The highest-risk gap is not visual polish. It is the mismatch between the proposed evidence-chain positioning and the current public product/storage/privacy behavior. Marketing must not promise a reusable evidence backbone until the implementation, delivery, retention, consent, deletion/export, and provider behavior support it.

## 2. Observed Public Information Architecture

Visible navigation:

- Home
- Drivable Check
- ClearSale
- Buyer Check
- Mechanic Match
- Mechanic's Eye Review
- Help
- Disclaimer
- Terms
- Privacy

Observed route behavior:

| Destination | Observed public behavior | Marketing label allowed now |
|---|---|---|
| Home | Multi-product overview | Pre-beta/product-development overview only |
| Drivable Check | Vehicle concern form and evidence promises | Controlled beta intake candidate; not guaranteed diagnosis or persistent evidence record |
| ClearSale | Seller support, listing-story organization, seller-intake links, repair-versus-sell, help | Pilot workflow / coming-soon marketplace; not live transparent marketplace |
| Buyer Check | Year/make/model context form, risk-review and evidence links | Closed-beta preparation; not inspection/title/condition guarantee |
| Mechanic Match | Request/referral support | Manual referral support only; not live booking, certification, or vetted network |
| Mechanic's Eye Review | Button selects, but Disclaimer content renders | Broken; do not market or link until corrected and verified |
| Help | AI-assisted guide request form collecting contact and request details | Support/request intake; privacy and response expectations require clarification |
| Disclaimer | SPA state on base URL | Must remain reachable and correctly linked |
| Terms | SPA state on base URL; permanent upload storage not guaranteed | Conflicts with persistent/reusable evidence promise |
| Privacy | SPA state on base URL; lacks launch-level specificity | Launch blocker for sensitive evidence and scaled acquisition |

## 3. Critical Launch Blockers

### LS-001 — Cold-start / waking-service interstitial

**Observed:** Initial browser visit showed a Render-style `Application loading / Service waking up` state for approximately 30–40 seconds before the app rendered.

**Marketing impact:** A coordinated launch can drive a synchronized traffic spike. A long cold-start screen will look like an outage, waste press/creator attention, impair conversion measurement, and undermine trust before users see the product.

**Required evidence to close:**

- infrastructure owner identifies the cause and production posture;
- fresh-session tests from multiple networks/devices meet an approved page-availability target;
- uptime, error, latency, cold-start, and capacity monitoring exists;
- load/capacity test reflects the launch traffic model;
- launch-day owner can scale, pause campaigns, or roll back;
- maintenance/error page uses approved truthful language and working support information.

**Launch state:** Blocks press embargo lift, creator coordination, paid media, QR/print distribution, and mass email.

### LS-002 — Mechanic's Eye Review navigation defect

**Observed:** Selecting `Mechanic's Eye Review` renders the Disclaimer page.

**Marketing impact:** The navigation implies a product or review capability that the destination does not deliver. This is both a broken conversion path and a risk of misleading users about available human review.

**Required evidence to close:**

- intended product/route decision recorded;
- navigation either routes to the correct reviewed experience or is removed/renamed;
- direct URL, back/forward, reload, keyboard, mobile, and analytics behavior tested;
- marketing definition distinguishes human safety/uncertainty review from a mechanic inspection or diagnosis.

**Launch state:** Do not link, advertise, screenshot, or describe Mechanic's Eye Review as available.

### LS-003 — Evidence-input promise exceeds verified implementation

**Observed:** Home and Drivable Check publicly promise photos, audio, video, and vibration inputs. Current evidence review has not established honest vibration capture. Photo/audio/video promises require verification that actual bytes are accepted, retained as represented, and genuinely analyzed—not merely named, previewed, or forwarded.

**Marketing impact:** Input-format claims can imply multimodal analysis that may not occur. A file-picker or metadata record is not proof that content was analyzed.

**Required evidence to close for each modality:**

- actual supported device/browser/file types, sizes, duration, quality, and failure states;
- byte upload, malware/content handling, access, encryption, retention, deletion, and vendor flow;
- the exact analysis performed and how it affects output;
- user-visible status when evidence is unusable, unprocessed, missing, or requires human review;
- safe capture instructions and explicit prohibition on collection while driving;
- test records proving the released build behavior end to end.

**Immediate copy rule:** Describe only verified modalities. Do not use `vibration analysis`, `analyzes your video`, `listens to your car`, or equivalent language without evidence.

### LS-004 — Optional follow-up email conflicts with case delivery

**Observed:** Drivable Check labels follow-up email `Optional for now`.

**Marketing impact:** A case/report lifecycle cannot promise reliable delivery, notification, account history, or human follow-up when no durable contact route is required or alternative retrieval method is clearly established.

**Required product decision:** Choose and implement one honest contract:

1. authenticated account/case history;
2. secure reference plus retrieval secret;
3. verified email/contact delivery;
4. clearly ephemeral same-session output with no follow-up promise.

Then align consent, security, accessibility, support, recovery, deletion, and marketing copy.

**Immediate copy rule:** Do not promise `we'll email your report`, `track your case`, `return anytime`, or persistent vehicle history until the implemented contract proves it.

### LS-005 — Terms contradict reusable evidence backbone

**Observed:** Terms state that permanent upload storage is not guaranteed.

**Marketing impact:** The high-impact positioning depends on one trustworthy evidence chain across owner concern, buyer/seller workflows, human/mechanic handoff, and outcomes. That requires defined persistence and authorization. Marketing cannot turn a non-guaranteed upload into a reusable evidence record.

**Required evidence to close:**

- product owner defines vehicle/evidence record lifecycle and allowed reuse;
- implementation supports the promised retention, access, sharing, correction, revocation, and deletion behavior;
- terms and privacy accurately describe that behavior;
- user consent differentiates service processing, cross-workflow reuse, human/provider sharing, product improvement, and marketing;
- failure/expiration/export behavior is visible;
- migration/versioning protects provenance.

**Immediate positioning rule:** Use `evidence-first workflow` or `designed around a connected evidence chain` as an aspiration. Do not claim a persistent evidence backbone is live.

### LS-006 — Privacy notice lacks launch-level specificity

**Observed gaps:** No exact retention period, deletion/export process, privacy contact, consent-version record, provider list, or learning/model-improvement choice was visible.

**Marketing impact:** Vehicle evidence may contain faces, voices, plates, VINs, locations, documents, contact details, device data, and sensitive inferences. Scaled acquisition before clear handling and choices would create trust, compliance, support, and incident risk.

**Required evidence to close:**

- data inventory and flow map derived from the running system;
- purpose, required/optional status, legal/consent basis as applicable, recipients/providers, geography, security, and retention by data class;
- user-access, correction, export, deletion, withdrawal, and complaint routes;
- named monitored privacy contact;
- consent text/version/time/source records;
- separate choice for product improvement or model learning where applicable;
- vendor/subprocessor list and contract review;
- incident response, child/age posture, and regional applicability;
- notice and in-product explanations match actual behavior.

**Launch state:** Blocks scaled public evidence intake, paid acquisition, creator campaigns, app-store submission, and broad partner recruitment.

### LS-007 — Mobile navigation dominates first viewport

**Observed:** At 390 px width, cards stack and remain readable, but the ten-button navigation consumes nearly half of the initial viewport.

**Marketing impact:** The primary promise and CTA are pushed down, increasing confusion and abandonment. The number of public products also makes roadmap appear more available than it is.

**Required evidence to close:**

- compact accessible mobile navigation;
- correct focus management, labels, escape/outside-close, keyboard, screen-reader, zoom, and touch-target behavior;
- primary launch path visible without scrolling through ten product/legal buttons;
- roadmap products visually separated from available experiences;
- common mobile devices and orientation tested.

### LS-008 — Help intake and response contract need clarification

**Observed:** Help contains an AI-assisted guide request with name, email, phone, contact preference, urgency, review request, and acknowledgments.

**Marketing impact:** `Urgency` and `review request` can be misunderstood as emergency, diagnostic, safety, or guaranteed human-response services. Contact fields require precise purpose, required/optional status, retention, sharing, and response expectations.

**Required evidence to close:**

- emergency and safety exclusion appears before submission;
- monitored hours, service target, capacity, escalation, and no-response behavior are accurate;
- privacy details appear at collection;
- marketing consent is separate from service contact;
- SMS/phone/email preference behavior and required authorization are implemented;
- `AI-assisted guide` is defined by actual processing and human involvement.

## 4. Preserved Boundary — Mechanic Match

The live Mechanic Match copy correctly presents request/referral support rather than live booking or certification. Preserve this boundary across landing pages, profiles, press, outreach, and ads until provider fulfillment and any vetting program are operational.

Approved current label:

`Mechanic Match — manual referral support / pilot planned. Availability, fit, credentials, price, timing, diagnosis, workmanship, and outcome are not guaranteed.`

## 5. Canonical URL and Campaign Mapping

Use the observed canonical host:

`https://www.getdrivable.com/`

Because the site uses query-based SPA routing, do not invent permanent paths. Before replacing any launch placeholder, copy and test the exact shareable URL from the rendered route in a signed-out fresh session.

Required destination record:

| Campaign | Exact URL | Fresh-load pass | Mobile pass | CTA parity | Privacy/safety pass | Owner |
|---|---|---|---|---|---|---|
| Master brand | pending | no | no | pending | pending | pending |
| Drivable Check | pending | no | no | pending | pending | pending |
| Buyer Check | pending | no | no | pending | pending | pending |
| ClearSale progress | pending | no | no | pending | pending | pending |
| Mechanic Match request | pending | no | no | pending | pending | pending |
| Help/support | pending | no | no | pending | pending | pending |
| Disclaimer | pending | no | no | n/a | pending | pending |
| Terms | pending | no | no | n/a | pending | pending |
| Privacy | pending | no | no | n/a | pending | pending |

Do not use the broken Review destination.

## 6. Coordinated Launch Go/No-Go Addendum

A high-impact synchronized launch requires all of the following beyond ordinary beta readiness:

- cold-start and load risk closed;
- navigation and routing defects closed;
- actual evidence modality contract verified;
- durable report/evidence delivery contract established;
- privacy/terms/consent aligned to implementation;
- product status reduced to a clear primary launch path;
- signed-out desktop/mobile destinations tested from multiple networks;
- support, privacy, safety, incident, infrastructure, and campaign owners staffed;
- naming/trademark decision recorded for Drivable and ClearSale;
- launch claims and proof register approved;
- paid/creator/press traffic can be paused centrally;
- rollback destination and public status message are ready.

Until these pass, continue reversible creative, product education, beta evidence design, and launch rehearsal. Do not coordinate a public traffic spike.

## 7. Prioritized Remediation Backlog

| Priority | Item | Owner type | Marketing dependency |
|---|---|---|---|
| P0 | Remove cold-start/waking experience and prove capacity | Infrastructure/product | Every coordinated channel |
| P0 | Fix/remove Mechanic's Eye Review route | Product/web | Human-review messaging and navigation trust |
| P0 | Reconcile evidence modality promises to tested processing | Product/AI/privacy | Home, Drivable Check, video, press, ads |
| P0 | Define secure report/case delivery contract | Product/security/support | Lifecycle email, accounts, reusable evidence |
| P0 | Align retention and evidence reuse across implementation, Terms, and Privacy | Product/privacy/legal | Evidence-chain positioning |
| P0 | Complete privacy/data-flow/consent controls | Privacy/security/product | Scaled intake, analytics, ads, partners |
| P1 | Clarify Help urgency, AI, human review, and response contract | Support/product/privacy | Support and beta recruitment |
| P1 | Replace mobile ten-button block with accessible compact navigation | Design/web/accessibility | Mobile conversion and launch clarity |
| P1 | Verify exact shareable route URLs and metadata | Web/marketing | Social, email, press, paid, QR |
| P1 | Complete naming/trademark decision | Owner/legal/brand | Irreversible brand production |
| P2 | Add measured performance, SEO, accessibility, and link QA | Web/marketing | Organic acquisition and launch polish |
| P2 | Produce final screenshots and videos from the verified release build | Product/creative | Press, store, ads, walkthroughs |

## 8. Acceptance Evidence

Each item must close with reproducible evidence, not a verbal assurance:

- issue/ticket and owner;
- affected release/build;
- before/after screenshots or recordings;
- test steps, environment, device/browser, and results;
- copy/legal/privacy approval where applicable;
- monitoring or regression coverage;
- updated release matrix and marketing asset status;
- date and approver.

