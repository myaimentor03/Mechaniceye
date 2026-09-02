# Drivable Responsive Confidence Explainer QA V1

Status: internal responsive-concept review; not approved as current product UI or for publication  
Manifest item: WB-007 — How Confidence Works

## Responsive masters

| View | Master | Review export |
|---|---|---|
| Desktop | `assets/web/DRV_WB-007_confidence-explainer_desktop-1440x900_v01_review.svg` | Same basename with `.png`; rendered at 2× |
| Narrow mobile | `assets/web/DRV_WB-007_confidence-explainer_mobile-390x1200_v01_review.svg` | Same basename with `.png`; rendered at 2× |

The mobile master is intentionally recomposed rather than mechanically scaled from the desktop design. It uses a vertical support scale, stacked unable-to-rank and safety sections, and shortened line lengths for a 390-pixel viewport.

## Canonical explanation

The visual communicates one bounded definition:

> Confidence describes how strongly the available evidence supports a possibility.

It separately states that confidence is not:

- certainty or a probability promise;
- urgency;
- severity or expected cost;
- a confirmed diagnosis;
- a vehicle-safety rating or determination.

Low, moderate, and higher labels are qualitative support states. No percentage, accuracy rate, numerical threshold, or validated calibration is invented.

## Unable-to-rank behavior

Both views show `Unable to rank responsibly` as a valid result when evidence is:

- too limited;
- materially conflicting;
- unsafe to collect;
- outside the workflow's scope.

The explanation does not treat unable-to-rank as `no problem`, `safe`, or permission to continue driving. It states that the system must not manufacture certainty merely to produce a list.

## Safety and escalation separation

The safety section makes clear that a confidence label does not answer whether:

- a vehicle is safe to drive;
- a condition is urgent or severe;
- emergency, human, specialized, or hands-on help is needed.

Those decisions require separate evidence and rules. The footer states that possible causes are not a confirmed diagnosis or safety determination.

## Product-truth boundary

Both masters are labeled as concept review and explicitly state that they are target messaging concepts rather than captures of the current live application. They must not be used to imply that the released product already:

- calculates calibrated confidence;
- persists versioned evidence;
- performs automated safety triage;
- routes human review;
- returns three possible causes in every case.

## Visual QA

- Desktop hierarchy, horizontal support scale, two-column lower section, and limitation footer were inspected at full render.
- Mobile hierarchy, vertical support scale, stacked panels, bullet spacing, and footer were inspected at 390-pixel composition width.
- No text overflow, clipping, collision, hidden source label, or color-only distinction was observed.
- Each state has a written label; meaning does not depend on cyan, amber, green, or red alone.
- The limitation text remains part of the native SVG and is not buried in separate fine print.

## Implementation and publication gates

- released confidence vocabulary and behavior match the explainer;
- safety, human-review, missing-evidence, and unable-to-rank contracts pass end-to-end tests;
- accessibility review covers semantic headings, reading order, zoom, reflow, contrast, screen-reader text, and reduced motion if animated;
- mobile testing covers supported viewport widths without truncation;
- owner, safety, naming, and any required legal review approve the final copy;
- live-site route, metadata, analytics, privacy, and support readiness pass their launch gates;
- released-build visuals replace concept graphics wherever the context implies current product UI.

## Review result

The paired masters pass internal responsive-layout, confidence-contract, uncertainty, safety-separation, and product-truth review. Status remains **concept review — not current product UI and not publish-ready**.
