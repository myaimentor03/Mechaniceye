# Drivable Confidence and Unknown Education Set QA V1

Status: internal organic-content review; not approved for publication  
Family: SO-004 — How Confidence Works

## Complete four-card set

| Sequence | Concept | Master |
|---:|---|---|
| 1 | Unknown can be a responsible result | `assets/social/DRV_SO-004_confidence_unknown-is-a-result_4x5_v01_review.svg` |
| 2 | Confidence is not urgency, severity, diagnosis, or safety | `assets/social/DRV_SO-004_confidence_not-safety-or-severity_4x5_v01_review.svg` |
| 3 | Unable to rank can be the responsible answer | `assets/social/DRV_SO-004_confidence_unable-to-rank-is-responsible_4x5_v01_review.svg` |
| 4 | New evidence can change a ranking without rewriting the past | `assets/social/DRV_SO-004_confidence_new-evidence-can-change-ranking_4x5_v01_review.svg` |

Each card has a 2× PNG review export and a native 1080 x 1350 JPEG quality-82 compression simulation under `assets/proofs/channel-simulation/`.

## Complete organic captions

### Card 1

Confidence language should follow the evidence. Relevant signals may align strongly, moderately, weakly, or not well enough to rank a responsible possible cause.

“Unable to rank” is a valid result when evidence is limited, conflicting, unsafe to collect, or outside the workflow's scope. Confidence is not a safety rating, and a possible cause is not a confirmed diagnosis.

### Card 2

Confidence answers one bounded question: how strongly does the available evidence support a possibility?

It does not measure urgency, severity, repair cost, certainty, or whether a vehicle is safe to drive. Safety signals and emergency conditions require separate handling, regardless of a confidence label.

Informational education only. Do not delay qualified or emergency help while waiting for a result.

### Card 3

A system should not manufacture a list merely because a user expects one. Evidence may be too limited, materially conflicting, unsafe to collect, or outside the scope of remote guidance.

The responsible next step may be safe written follow-up, human review, appropriate hands-on testing, or emergency help. “Unable to rank” is not permission to keep driving and does not mean no problem exists.

### Card 4

New evidence can change how strongly a possible cause is supported. A responsible revision preserves the earlier version, source labels, conflicts, missing information, and the new evidence that caused the ranking to change.

The example shown is entirely synthetic. A higher ranking is still not a confirmed diagnosis, repair instruction, or vehicle-safety determination.

## Alt text

- **Card 1:** Dark Drivable card titled “Unknown can be a responsible result,” defining higher, moderate, low, and unable-to-rank confidence states and stating that confidence is not a safety rating.
- **Card 2:** Light Drivable card titled “Confidence answers: How supported?” It separates evidence confidence from urgency, severity, diagnosis, and safety.
- **Card 3:** Dark Drivable card reading “Unable to rank can be the responsible answer,” with four reasons: too limited, conflicting, unsafe to collect, and out of scope, followed by appropriate next steps.
- **Card 4:** Light Drivable card showing synthetic Version 1 at low support and Version 2 at moderate support after a new device entry, while retaining prior versions, sources, conflicts, and missing information.

## Confidence and safety review

- No confidence label is represented as a probability, diagnostic accuracy rate, severity grade, urgency score, or safety rating.
- No numerical confidence percentage is invented.
- The cards repeatedly separate ranked possible causes from confirmed diagnosis and repair instruction.
- `Unable to rank` does not mean `no issue`, `safe`, or `keep driving`.
- Unsafe evidence collection is a reason to stop collection, not a reason to lower confidence and continue.
- Human review and in-person help are escalation paths, not guarantees of diagnosis, availability, quality, timing, or outcome.
- The version-change example is explicitly synthetic and preserves provenance instead of rewriting earlier evidence.

## Visual QA

Cards 2–4 were rendered at 2× and visually inspected. The confidence definition, four exclusion panels, unable-to-rank reasons, escalation panel, version progression, synthetic label, and safety statements show no clipping or collision. Native JPEG simulations remain readable without material artifacts.

## Publication gates

- released report terminology and confidence behavior match the cards exactly;
- human-review and safety-escalation contracts are implemented and tested;
- owner and naming approval;
- final caption, alt-text, crop, compression, and mobile-feed preview;
- support and moderation scripts distinguish confidence, urgency, severity, and safety;
- no surrounding copy describes a confidence label as certainty or vehicle clearance.

## Review result

The four-card set passes internal confidence-contract, uncertainty, escalation, safety, versioning, visual, caption, and alt-text review. Status remains **review — not publish-ready**.
