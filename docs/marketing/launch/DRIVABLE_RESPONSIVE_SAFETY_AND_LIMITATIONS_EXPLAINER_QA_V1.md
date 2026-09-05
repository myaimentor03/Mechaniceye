# Drivable Responsive Safety and Limitations Explainer QA V1

**Created:** 2026-08-31  
**Status:** Concept review passed. Not current product UI, not approved, and not publication-ready.  
**Scope:** Paired desktop and mobile safety-messaging concepts for review and future implementation planning.

## 1. Asset Pair

| View | Editable master | Review export | Target canvas |
|---|---|---|---:|
| Desktop | `assets/web/DRV_WB-008_safety-limitations_desktop-1440x900_v01_review.svg` | `assets/web/DRV_WB-008_safety-limitations_desktop-1440x900_v01_review.png` | 1440 × 900 |
| Mobile | `assets/web/DRV_WB-008_safety-limitations_mobile-390x1350_v01_review.svg` | `assets/web/DRV_WB-008_safety-limitations_mobile-390x1350_v01_review.png` | 390 × 1350 |

Both masters explicitly identify themselves as concepts. They are messaging and layout references, not screenshots or representations of the current live product.

## 2. Safety Contract Preserved

The concepts put safety before evidence collection and use a non-exhaustive set of possible immediate-threat examples:

- fire or smoke;
- fuel odor or leak;
- severe overheating;
- loss of braking or steering;
- wheel or tire structural risk;
- electrical hazard;
- severe instability; and
- loss of power in traffic.

The response is bounded: stop using the vehicle and seek appropriate qualified or emergency help. The language does not attempt to determine whether an emergency exists, prescribe a repair, or imply that Drivable is monitoring the vehicle.

## 3. Evidence-Collection Boundaries

The paired concepts state that evidence should be collected only when safely parked. They prohibit:

- typing, recording, photographing, or connecting equipment while driving;
- recreating a symptom for content or a report; and
- approaching moving, hot, energized, pressurized, or unsupported components.

“I cannot provide this safely” is presented as an acceptable evidence response. Missing evidence caused by a safety boundary must remain missing and must not be inferred, simulated, or treated as proof that a condition is absent.

## 4. Product-Limitation Boundaries

The concepts state that Drivable does not:

- provide emergency service or real-time monitoring;
- replace a physical inspection or qualified in-person diagnosis; or
- declare a vehicle safe, roadworthy, repaired, or ready to drive.

Possible causes and confidence labels do not override warning signs, professional advice, or the user's judgment. The concepts do not claim that any photo, recording, video, vibration, or other media was processed or analyzed.

## 5. Visual QA Record

Both SVG masters parsed and rendered locally to lossless PNG review exports. The initial rendered pass identified three layout defects: desktop overflow in the immediate-threat heading, desktop overflow in a parked-collection line, and mobile footer-headline clipping. Font sizing was corrected in the SVG masters, both PNGs were regenerated, and both final exports were visually re-inspected at their original target dimensions.

The final review found:

- no clipped or overflowing text;
- no panel collisions;
- clear immediate-threat, parked-collection, and product-limitation hierarchy;
- readable narrow-screen stacking at 390 px;
- visible concept-status labeling; and
- no imagery showing or encouraging unsafe collection behavior.

The local renderer reported that its ordinary font-cache directories were not writable. Rendering still completed using the declared `Inter, Arial, sans-serif` stack, and the resulting exports were visually inspected. Final production export must repeat font and layout QA in the approved production environment.

## 6. Release and Implementation Gates

These assets remain concept-review materials until all of the following are complete:

1. Product, safety, accessibility, privacy, and qualified legal review approve the exact released language.
2. The released application implements equivalent safety interruption, parked-only instructions, safe refusal/missing-evidence behavior, and limitation language at the relevant collection and report points.
3. Functional testing verifies that safety messages cannot be bypassed in a way that encourages dangerous collection.
4. Screen-reader order, focus behavior, text zoom, contrast, responsive reflow, localization expansion, and small-device testing pass in the released interface.
5. The official route, release label, owner approval, naming decision, and live-site verification are recorded.
6. Final channel or product exports are generated as new approved versions; these `_review` files are not renamed or silently treated as approved.

Until those gates close, these files may be used for internal review and implementation guidance only. They must not be presented as a current feature, released interface, safety certification, or emergency service.
