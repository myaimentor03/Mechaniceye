# Drivable Public Claim-to-Proof Matrix V1

**Basis:** Authorized live-site inspection on 2026-08-24, repository readiness audit, product architecture, and current launch controls.  
**Rule:** A public statement is allowed only when the evidence column proves the exact audience interpretation—not merely that similar words or UI elements exist.

## Status Key

- **Supported:** Current evidence proves the bounded statement.
- **Supported with qualifier:** Only the exact qualified wording is allowed.
- **Unproven:** Evidence is insufficient; do not publish as fact.
- **Contradicted:** Current behavior or policy conflicts with the claim.
- **Broken:** The public path does not deliver what its label implies.
- **Roadmap:** May be described only as planned, in development, or coming soon, subject to naming clearance.

## Matrix

| ID | Public statement or implication | Current evidence | Status | Allowed wording / required action |
|---|---|---|---|---|
| CP-001 | Drivable has an official website | Apex redirects to the rendered `www` site with HTTP 200 | Supported | `Official information is available at https://www.getdrivable.com/.` |
| CP-002 | Drivable Check is a live automated diagnostic machine | Live intake exists; repository audit shows mock/default and manual-forwarding behavior; no complete automated diagnostic contract | Contradicted | `Drivable Check is a controlled beta workflow in preparation.` |
| CP-003 | Drivable tells users exactly what is wrong | Product architecture limits output to up to three possible causes; remote evidence can be incomplete | Contradicted | `Drivable is designed to rank up to three possible causes when evidence supports them.` |
| CP-004 | Drivable determines whether a vehicle is safe to drive | No physical inspection or validated safety-decision system | Contradicted | `Drivable does not determine whether a vehicle is safe to drive.` |
| CP-005 | Drivable accepts photos | Public page claims photos; end-to-end byte upload, retention, analysis, and result influence are not proven | Unproven | Do not advertise until modality test evidence exists |
| CP-006 | Drivable analyzes photos or uses computer vision | No proof that photo bytes reach a capable vision service and affect output | Unproven | Prohibited until end-to-end capable-service trace passes |
| CP-007 | Drivable accepts audio | Public page claims audio; end-to-end byte handling and analysis are not proven | Unproven | Do not advertise until modality test evidence exists |
| CP-008 | Drivable listens to or analyzes vehicle sounds | No proof that audio bytes reach a capable audio service and affect output | Unproven | Prohibited until end-to-end capable-service trace passes |
| CP-009 | Drivable accepts or analyzes video | Public page claims video; end-to-end video-byte processing is not proven | Unproven | Do not advertise until upload, sampling/analysis, and report trace pass |
| CP-010 | Drivable analyzes vibration | No genuine sensor or validated vibration-data contract is established | Contradicted | Remove vibration-analysis language; text-described observations are not sensor analysis |
| CP-011 | Drivable uses OBD information | Repository contains OBD-related intake/context behavior, but exact supported payload and analysis scope need end-to-end proof | Unproven | Describe OBD only after payload, compatibility, processing, and failure tests pass |
| CP-012 | Results can be delivered reliably later | Follow-up email is optional and durable account/case retrieval is not established | Contradicted | Do not promise delivery/history until one secure retrieval contract is implemented |
| CP-013 | Evidence is stored permanently | Terms say permanent upload storage is not guaranteed | Contradicted | Do not promise a durable evidence vault or history |
| CP-014 | One reusable vehicle evidence chain is live | Persistence, authorization, reuse, deletion/export, versioning, and handoff are not implemented/proven end to end | Unproven | `Drivable is designed around a connected evidence chain.` |
| CP-015 | Buyer Check shows what is right with a vehicle | Current flow provides context/risk-preview behavior and cannot prove condition | Contradicted | `Buyer Check is designed to organize supported positives, risks, seller claims, and unknowns.` |
| CP-016 | Buyer Check is a pre-purchase inspection | No physical comprehensive inspection | Contradicted | `Buyer Check does not replace an independent pre-purchase inspection.` |
| CP-017 | Buyer Check verifies title, ownership, mileage, accidents, or seller identity | No complete authoritative verification integrations and field-level methods are established | Unproven | Each field must remain seller-stated, document-supplied, observed, verified by a named method, unknown, or conflicting |
| CP-018 | ClearSale is a live marketplace | Live route presents seller support/intake concepts; full marketplace, inventory, moderation, and transaction flow are not proven | Roadmap | `The vehicle-marketplace concept is coming soon`; public name requires clearance |
| CP-019 | ClearSale guarantees honesty or prevents fraud | No system can guarantee behavior; controls are incomplete | Contradicted | `Designed to keep claims, observations, verification, conflicts, and unknowns distinct.` |
| CP-020 | AI-generated listings are verified | AI drafting does not verify underlying statements | Contradicted | `AI-generated listing draft based on seller-provided information and submitted evidence.` |
| CP-021 | Mechanic Match books mechanics | Live page describes request/referral support, not confirmed booking | Contradicted | `Mechanic Match currently supports requests/referrals; it is not live booking.` |
| CP-022 | Mechanic Match provides vetted mechanics | No documented screening, audit, re-check, complaint, or suspension program | Unproven | Do not use `vetted`, `verified`, `approved`, or `trusted` |
| CP-023 | Mechanic's Eye Review is available | Clicking the navigation item renders Disclaimer | Broken | Do not market or link; fix/remove route and verify scope |
| CP-024 | Help provides emergency or urgent response | Form includes urgency but no verified emergency coverage, hours, or service-level contract | Unproven | `Help is not an emergency or vehicle-safety service.` |
| CP-025 | Help provides AI-assisted guidance | Label exists; exact AI processing, human involvement, retention, and response path are not fully documented | Unproven | Define and prove processing before marketing the label |
| CP-026 | Users control deletion/export | Privacy notice lacks a visible exact process | Unproven | Do not claim control until tested routes and policy exist |
| CP-027 | Drivable has a complete privacy program | Notice lacks exact retention, provider list, privacy contact, consent version, and learning-use choice | Contradicted | Privacy is a P0 launch gate |
| CP-028 | The site is ready for a synchronized traffic surge | First visit showed a roughly 30–40-second service-waking state; no load evidence | Contradicted | Close infrastructure, monitoring, load, and rollback gates before coordinated traffic |
| CP-029 | Mobile experience is launch optimized | Content is readable, but ten navigation buttons consume nearly half the 390 px first viewport | Supported with qualifier | `The site renders on mobile`; do not claim optimized conversion/accessibility until compact navigation passes QA |
| CP-030 | Drivable is the first or only product of its kind | Active competitors span each adjacent category | Contradicted | Prohibit `first`, `only`, `nobody else`, and category-exclusivity claims |
| CP-031 | Drivable name is legally cleared | Active automotive use exists at `drivable.app`; no legal clearance record | Unproven | Treat brand as provisional for irreversible spend pending counsel/owner decision |
| CP-032 | ClearSale name is legally cleared | Active Experian ClearSale brand exists at `clear.sale`; no legal clearance record | Unproven | Treat marketplace name as provisional; investigate alternatives with counsel |

## Modality Proof Standard

For photo, video, audio, OBD, document, or any future sensor modality, a claim is supported only when a recorded end-to-end test proves:

1. the real bytes or structured payload leave the client;
2. the server receives and associates them with the correct authorized case;
3. validation rejects unsupported/unsafe inputs clearly;
4. the relevant capable service receives the content, not merely metadata or a filename;
5. the service's output influences the report in an auditable way;
6. missing/unusable evidence remains visible;
7. retention, access, provider transfer, correction, and deletion match policy;
8. logs and analytics do not leak sensitive contents;
9. the user sees the actual processing state and limits;
10. regression tests cover success, failure, wrong type, oversized input, timeout, duplicate, malicious file, revoked consent, and deletion.

Vibration requires genuine defined sensor data or another validated measurement contract. A user typing `the steering wheel shakes` is a text observation, not vibration analysis.

## Governance

Every proposed public claim receives a claim ID and evidence record before use. Marketing does not downgrade `Unproven`, `Contradicted`, `Broken`, or `Roadmap` to `Supported`; only new verified product, policy, legal, or operational evidence can change status.

