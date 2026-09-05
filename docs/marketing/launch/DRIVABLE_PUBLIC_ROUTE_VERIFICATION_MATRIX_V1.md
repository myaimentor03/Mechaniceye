# Drivable Public Route Verification Matrix V1

**Website:** `https://www.getdrivable.com/`  
**Observed routing model:** Query-based SPA state on the canonical URL  
**Current status:** Verification specification complete; route-by-route execution remains required after public-experience fixes  
**No-placeholder rule:** Unknown deep links are not invented. Exact shareable URLs must be copied from the corrected live application and recorded by test evidence.

## 1. Routes in Scope

| Route label | Observed content | Current release label | Current blocking issue |
|---|---|---|---|
| Home | Multi-product overview | Pre-beta/product-development overview | Cold start, claim reconciliation, mobile navigation |
| Drivable Check | Concern/evidence intake | Closed beta in preparation | Modalities, delivery, storage, privacy, exact AI behavior |
| ClearSale | Seller support and intake concepts | Coming-soon marketplace; name provisional | Naming, marketplace readiness, provenance, legal/privacy |
| Buyer Check | Year/make/model context and risk preview | Closed beta in preparation | Not full report/inspection; evidence and verification limits |
| Mechanic Match | Request/referral support | Manual referral support/pilot planned | No booking, supply, vetted program, or fulfillment guarantee |
| Mechanic's Eye Review | Currently renders Disclaimer | Broken/unavailable | Routing defect and undefined review contract |
| Help | AI-assisted guide request intake | Support/request intake | Urgency, AI/human scope, privacy, service target |
| Disclaimer | Product limitations | Public policy content | Must align to every current claim and route |
| Terms | Service terms | Public policy content | Permanent storage not guaranteed; conflicts with evidence-chain promise |
| Privacy | Privacy notice | Public policy content | Retention, rights, contact, providers, consent version, learning choice |

## 2. Route Test Record Standard

Every execution record must include:

- test date, timezone, release/build identifier, and environment;
- exact copied URL and redirect chain;
- signed-in/signed-out state;
- device, viewport, operating system, browser, network, and assistive technology;
- cold/warm session state;
- screenshots or recordings;
- observed result, expected result, severity, and issue reference;
- tester and reviewer;
- retest evidence after correction.

An unchecked box or empty cell is not stored as a release record. This document specifies the required proof; completed execution evidence belongs in the controlled test system.

## 3. Universal Functional Checks

Apply to every route:

1. Apex and canonical host resolve without certificate warning.
2. Redirect reaches the intended canonical URL without loop or unnecessary chain.
3. Cold external session renders within the approved performance target.
4. Direct URL, internal navigation, back, forward, reload, new tab, copied link, and bookmark preserve the intended route.
5. Page title, top heading, selected navigation item, content, and CTA agree.
6. Primary and secondary CTAs perform exactly the labeled action.
7. Disabled or unavailable features are not presented as working controls.
8. Error, empty, loading, offline, slow, timeout, and retry states are truthful and recoverable.
9. Forms prevent duplicate submission and explain success/failure.
10. Legal/policy links remain reachable before collection and submission.

## 4. Accessibility Checks

### Structure and navigation

- One descriptive page-level heading.
- Headings form a meaningful hierarchy.
- Landmarks identify header, navigation, main content, forms, and footer.
- Skip link reaches main content.
- Current navigation state is conveyed without color alone.
- Compact mobile menu has an accessible name and correct expanded state.
- Opening the menu moves focus appropriately; closing returns focus.
- Escape and outside-close behavior do not trap users.
- Keyboard order follows visual/logical order.

### Forms

- Every input has a persistent programmatic label.
- Instructions do not rely on placeholder text.
- Required/optional status is explicit.
- Errors identify the field, problem, and correction in text.
- Error summary receives focus and links to fields.
- Autocomplete purpose is appropriate for contact fields.
- Sensitive evidence purpose, access, retention, and required/optional state appear before submission.
- Timeouts are absent or extendable.
- Success state is announced and durable enough to understand.

### Visual and motor

- Text and meaningful controls meet approved contrast targets.
- Focus indicator is visible on every interactive element.
- Content works at 200% zoom and narrow reflow without two-dimensional scrolling for ordinary content.
- Touch targets and spacing support motor accessibility.
- Text is not embedded solely in raster images.
- Color is not the only evidence/confidence/safety cue.
- Motion can be reduced and does not flash dangerously.

### Media and cognitive

- Images have useful alt text or are marked decorative.
- Video has accurate captions, transcript, and audio description where needed.
- Audio has transcript and does not autoplay unexpectedly.
- Instructions use plain language and short steps.
- Possible cause, confidence, unknown, human review, and safety limits are visually distinct.
- Users can review and correct before submission.

## 5. SEO and Metadata Checks

For each public indexable route:

- unique accurate title;
- unique factual meta description;
- canonical URL reflects actual routing and duplicate strategy;
- index/noindex decision recorded;
- robots behavior and sitemap agree with the decision;
- Open Graph title, description, URL, image, image dimensions, and alternative text are correct;
- social preview does not advertise unavailable functionality;
- structured data describes the real organization/product/service and contains no fake rating, offer, review, price, availability, or application;
- heading and visible copy match search-preview promises;
- no internal/test environment appears in metadata;
- renamed/provisional products are excluded from permanent metadata until cleared;
- legal and privacy pages are discoverable but not used as conversion landing pages.

## 6. Performance and Reliability Checks

Test cold and warm sessions on representative mobile and desktop networks.

Record:

- DNS, connection, TLS, server response, first render, largest content render, interaction responsiveness, and layout stability;
- asset weight by script, CSS, image, font, video, and third party;
- cache behavior and service-waking incidence;
- route-transition and direct-route performance;
- form submission, upload, processing, and report latency;
- p50, p95, and p99 under launch-like load;
- error rate, retry behavior, queue age, and saturation;
- behavior when analytics, chat, fonts, media, or third parties fail;
- monitoring alert, status experience, degraded mode, and rollback.

The first-launch Render waking screen is a P0 until fresh-session tests prove it closed.

## 7. Privacy and Security Checks

- Collection notice matches every field and evidence type.
- Service processing is separate from marketing consent.
- Consent version, time, source, scope, and withdrawal state are recorded.
- Exact recipients/providers and transfer regions match production.
- Analytics and advertising tags respect consent and exclude sensitive evidence.
- No report, VIN, plate, symptom, contact, document, or evidence content appears in URLs, page titles, referrers, logs, or marketing events without an approved necessity and control.
- Authentication/authorization protects every private case and report.
- Wrong-recipient, guessed identifier, expired link, revoked share, and signed-out tests fail safely.
- Uploads enforce type, size, content, malware, timeout, and retention controls.
- Account/data access, correction, export, deletion, and withdrawal work end to end.
- Public errors reveal no stack, secret, internal host, provider key, or sensitive record.

## 8. Claims and Content Checks

- Page uses the current release label.
- No possible cause is called a diagnosis.
- No confidence label implies safety.
- No modality is named without end-to-end proof.
- Vibration is never claimed from text description or fake sensor behavior.
- Seller claims retain attribution.
- Documents are not called authenticated without a recorded method.
- `verified` applies only to the exact verified field and method.
- Buyer Check does not imply complete inspection, title, condition, value, or reliability.
- Mechanic Match does not imply booking, supply, vetting, certification, or outcome.
- ClearSale name and marketplace language follow the current naming decision.
- No first/only/superiority, accuracy, savings, scale, rating, outcome, or trust claim lacks a substantiation record.

## 9. Route-Specific Acceptance

### Home

- One dominant primary product path.
- Current and roadmap products clearly separated.
- First viewport states the bounded value and release stage.
- Mobile navigation no longer consumes nearly half the first viewport.
- Every modality and evidence-chain claim links to proof or uses aspirational language.

### Drivable Check

- Safe capture appears before evidence collection.
- Actual supported modalities only.
- Follow-up/delivery contract is explicit and reliable.
- Missing evidence and human review are real states.
- Urgent symptoms interrupt ordinary flow conservatively.

### Buyer Check

- Seller-stated, observed, document-supplied, independently verified, unknown, and conflicting labels are distinct.
- Absence of evidence never becomes a positive fact.
- Independent inspection/title/history verification remains recommended.
- Synthetic examples cannot be mistaken for real listings.

### Seller / marketplace concept

- AI-drafted text disclosure is present.
- Seller reviews and approves the exact listing.
- Unknowns and conflicts cannot be silently removed.
- Marketplace availability and naming match reality.
- Reporting, correction, moderation, and withdrawal exist before public listings.

### Mechanic Match

- Request/referral language remains bounded.
- User explicitly selects evidence to share.
- Provider terms, credentials, estimates, warranty, payment, and booking are not implied to be handled when they are not.

### Mechanic's Eye Review

- Navigation reaches the intended page.
- Human identity/qualification, scope, evidence access, response window, escalation, and limits are defined.
- Page does not imply physical inspection or safety determination.

### Help

- Emergency exclusion precedes urgency selection.
- AI versus human processing is explicit.
- Contact purpose, required/optional status, response target, and privacy are clear.
- No support promise exceeds staffed capacity.

### Disclaimer, Terms, and Privacy

- Each has a stable shareable route and effective/revision date.
- Language agrees with the released product and one another.
- Retention, evidence reuse, human/provider sharing, learning use, rights, contacts, and limitations are specific.
- Material changes trigger reviewed notice and consent behavior where required.

## 10. Launch Acceptance

Public-route verification passes only when:

- every route has completed external cold/warm desktop/mobile records;
- zero P0/P1 functional, accessibility, safety, privacy, security, claim, or routing issue remains;
- performance/load results cover the coordinated traffic ramp;
- exact URLs and metadata are recorded in the publishing queue;
- every failure state and rollback is rehearsed;
- the Launch Director links the evidence in the go/no-go decision.

