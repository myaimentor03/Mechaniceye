# Drivable Synthetic Sample Report Gallery QA V1

Status: internal concept review; not approved as a product screenshot or public performance claim  
Scenario source: `DRIVABLE_SYNTHETIC_EVIDENCE_CHAIN_DEMONSTRATION_V1.md`

## Gallery

All editable masters and PNG review exports are stored under `assets/web/sample-report/`.

| Sequence | Screen | Required truth carried by the design |
|---:|---|---|
| 1 | Evidence record | Owner statement, device entry, owner context, and missing evidence remain separately labeled |
| 2 | Possible causes | No more than three possibilities; confidence, support, conflict/missing evidence, next question, and safety boundary remain visible |
| 3 | Buyer Check | Seller statement, submitted record, professional report, unknown current condition, and buyer next step remain distinct |

Every screen displays `SYNTHETIC DEMONSTRATION · NOT A REAL RESULT`. The evidence screen additionally states that it is a target-behavior concept rather than a capture of the current application.

## Source integrity

- Vehicle alias and scenario values come from the synthetic demonstration specification.
- No real person, VIN, plate, contact, location, shop, technician, vehicle, document, outcome, or customer record appears.
- The owner statement proves only that the synthetic owner made the statement.
- P0301 is labeled as a synthetic device-reported entry; the screen explains that a code does not identify the failed part or prove a repair.
- Recent fuel timing remains owner-stated context and is explicitly not treated as causation.
- Maintenance history and freeze-frame data remain missing.
- The possible-cause order and confidence labels match the synthetic specification: ignition-related moderate; fuel-delivery low; mechanical low.
- The later synthetic technician note does not retroactively turn the earlier possibility into a confirmed diagnosis.
- Buyer Check says Drivable did not independently verify the professional report or current condition.
- The seller statement remains `SELLER-REPORTED`; AI wording does not convert it into a Drivable fact.

## Capability and safety boundaries

- No photo, audio, video, vision, document, or vibration analysis is depicted.
- No vehicle is declared safe, roadworthy, inspected, repaired, verified, certified, or mechanically sound.
- No part replacement is recommended from the remote evidence.
- No price, savings, accuracy, customer outcome, mechanic credential, title status, or transaction claim is present.
- The possible-cause screen carries the full material boundary: not a confirmed diagnosis, repair instruction, inspection, emergency service, or vehicle-safety determination.
- Buyer Check recommends current documentation and an independent pre-purchase inspection.

## Visual QA

First-render review found and corrected:

1. synthetic-warning text that exceeded its badge on all three screens;
2. an overlap between the missing-evidence statement and confidence consequence on screen 1.

The corrected 2× PNG exports were inspected for overflow, hierarchy, provenance labels, contrast, and limitation visibility. No remaining clipping or overlap was observed.

## Usage restrictions

These files may be used internally to align product, design, safety, privacy, and launch teams. They must not be described as current product screenshots, a customer report, proof of AI performance, or proof that the live workflow preserves this evidence chain.

Public use requires:

- the released product to reproduce every displayed behavior end to end;
- provenance, permissions, persistence, correction, withdrawal, and deletion behavior to be verified;
- privacy, terms, consent, and human-review contracts to match the screens;
- route, mobile, accessibility, security, and report-delivery tests to pass;
- naming and owner approvals;
- a released-build capture to replace concept screens wherever the context implies current product UI.

## Review result

The three-screen gallery passes internal synthetic-data, provenance, bounded-claim, safety-language, and visual-layout review. Status remains **concept review — not a released-product screenshot and not publish-ready**.
