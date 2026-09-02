# Drivable Channel Compression and Icon Mask QA V1

**QA date:** 2026-08-24  
**Scope:** Seven 4:5 social masters, one 1200×630 share master, and the provisional app/social icon.  
**Status:** Channel simulations passed after corrections; public approval remains gated.

## Simulation method

- Social SVG masters were rendered at native 1080×1350 dimensions.
- The share master was rendered at native 1200×630 dimensions.
- Delivery stress used JPEG quality 82 with 4:2:0 chroma subsampling.
- The app icon was tested at 16, 32, 64, 128, 256 and 512 pixels.
- Separate 512-pixel circular and rounded-square mask simulations were produced.
- Every compressed social/share output and both mask simulations were visually inspected.

Proofs are stored under `assets/proofs/channel-simulation/`. They are QA artifacts, not publication files.

## Results by asset

| Asset | Compression result | Copy/crop result | Decision |
|---|---|---|---|
| Symptom timing card | Fine text remains legible; no material ringing | Safety panel and footer preserved | Pass review simulation |
| Observe, don’t guess | Card text and safety boundary remain legible | No crop or overflow | Pass review simulation |
| Mechanic questions | White-card details survive compression | Strengthened teal heading remains clear | Pass review simulation |
| Confidence explainer | Secondary text remains readable; colored states retain labels | No color-only meaning | Pass review simulation |
| Beta recruitment | CTA and limitation remain legible | Previously corrected CTA remains within control | Pass review simulation |
| Buyer Check | Initial CTA clipped and implied a working listing action | Replaced with `Learn about Buyer Check`, widened and re-exported | Pass after correction |
| Seller-claim education | Attribution chain remains clear | ClearSale name still blocks publication | Visual pass; naming hold |
| Open Graph/share | Headline, beta state and limitation remain legible | Corrected badge survives native compression | Pass review simulation |

## Icon-mask correction

The first circular-mask simulation exposed transparent outer corners and an inset border that produced unintended flat bars at the circle boundary. The icon master was changed to a full-bleed dark gradient with no perimeter border. All icon sizes and both mask simulations were regenerated.

After correction:

- the circular mask has a clean continuous edge;
- the rounded-square mask has a clean continuous edge;
- the D-shaped evidence path and three status points remain inside the safe area;
- no text is required for recognition;
- no shield, certification, safety-check or diagnostic-light symbol is implied.

## Corrections made during this gate

1. Buyer Check CTA changed from `Review the listing` to `Learn about Buyer Check`.
2. Buyer Check control width and centered typography were corrected.
3. App-icon background changed to full bleed.
4. App-icon perimeter border removed to prevent mask-edge artifacts.
5. Native JPEG and icon-size proofs regenerated and re-inspected.

## Remaining platform gate

Before public or store use:

- test the actual platform upload preview rather than only local simulation;
- confirm each platform’s current safe zones and file limits;
- test dark/light OS surfaces and real device home screens;
- confirm naming/trademark and founder approval;
- verify the destination and availability label at publish time;
- retain exact final export hashes and platform screenshots.

## Current decision

The tested assets may remain in `review`. They are not `approved`, `channel_ready`, published, or authorized for paid distribution.
