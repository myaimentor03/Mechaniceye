# Drivable Color Contrast and Visual Accessibility Audit V1

**Audit date:** 2026-08-24  
**Scope:** Provisional palette and the 12 editable SVG review masters.  
**Standard:** WCAG 2.2 AA contrast calculation using the declared foreground and background colors.

## Standard applied

WCAG 2.2 Success Criterion 1.4.3 requires at least 4.5:1 for normal text and 3:1 for large text. Ratios are thresholds and must not be rounded upward to pass. Meaningful non-text graphical or interface boundaries generally require 3:1 against adjacent colors under Success Criterion 1.4.11. Sources: [W3C text-contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [W3C non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

This audit applies the stricter 4.5:1 normal-text threshold to every tested text pairing, including large headings. Decorative shapes and logo elements are recorded separately. Status and safety meaning must never depend on color alone.

## Verified text pairs

| Foreground | Background | Ratio | Result |
|---|---|---:|---|
| Ice `#EDF5FF` | Midnight 950 `#07111F` | 17.23:1 | Pass AA/AAA normal text |
| Steel `#9CB0C8` | Midnight 950 `#07111F` | 8.53:1 | Pass AA/AAA normal text |
| Steel `#9CB0C8` | Slate 800 `#122238` | 7.21:1 | Pass AA/AAA normal text |
| Steel `#9CB0C8` | Midnight 900 `#0D1A2B` | 7.88:1 | Pass AA/AAA normal text |
| Steel `#9CB0C8` | Deep card `#1A2637` | 6.87:1 | Pass AA normal text |
| Signal Cyan `#3BD6FF` | Midnight 950 `#07111F` | 11.04:1 | Pass AA/AAA normal text |
| Midnight 950 `#07111F` | Signal Cyan `#3BD6FF` | 11.04:1 | Pass AA/AAA normal text |
| Clarity Green `#9AF0C5` | Midnight 950 `#07111F` | 14.11:1 | Pass AA/AAA normal text |
| Caution Amber `#FFD27D` | Midnight 950 `#07111F` | 13.32:1 | Pass AA/AAA normal text |
| Midnight 950 `#07111F` | Caution Amber `#FFD27D` | 13.32:1 | Pass AA/AAA normal text |
| Stop Coral `#FF8F8F` | Midnight 950 `#07111F` | 8.64:1 | Pass AA/AAA normal text |
| Ink `#172334` | Paper `#F7F9FB` | 15.00:1 | Pass AA/AAA normal text |
| Editorial secondary `#52677F` | Paper `#F7F9FB` | 5.52:1 | Pass AA normal text |
| Editorial secondary `#52677F` | White `#FFFFFF` | 5.82:1 | Pass AA normal text |
| Light-surface endorsement `#52657A` | Paper `#F7F9FB` | 5.68:1 | Pass AA normal text |
| Strengthened teal `#106B85` | Paper `#F7F9FB` | 5.74:1 | Pass AA normal text |
| Strengthened teal `#106B85` | White `#FFFFFF` | 6.06:1 | Pass AA normal text |
| Seller-claim brown `#7A5411` | Pale amber `#FFF4DD` | 6.20:1 | Pass AA normal text |
| Draft-source teal `#176681` | Pale cyan `#EAF8FF` | 5.95:1 | Pass AA normal text |
| Near-black CTA `#04131E` | Signal Cyan `#3BD6FF` | 10.97:1 | Pass AA/AAA normal text |

## Correction made

The original light-background teal `#147A99` measured 4.66:1 on Paper and 4.91:1 on White. It technically passed AA but left little practical margin for anti-aliasing or compression. It was replaced in the two affected social masters with `#106B85`, raising the ratios to 5.74:1 and 6.06:1. Both PNG proofs were regenerated.

## Non-text and color-independence review

- Confidence levels include explicit text labels; color strips are redundant cues.
- Seller claim, AI draft and Buyer Check states include written source labels; amber/cyan styling is not the only distinction.
- Safety panels contain explicit instructions; amber is not the sole warning.
- Number and question icons include visible characters or surrounding text.
- Decorative circles, waves, rules and brand-symbol points do not carry standalone instructions.
- Low-contrast card borders support grouping but are not the sole carrier of content or state.
- The one-color lockup remains available for contexts where color reproduction is unreliable.

## Remaining release checks

This calculation does not prove complete accessibility. Before public approval:

1. Test final native-size exports after platform compression.
2. Inspect at common mobile zoom and feed sizes.
3. Test app-icon masks and OS appearance modes.
4. Confirm text alternatives and long descriptions match final artwork.
5. Verify that any live HTML uses semantic text rather than raster text where practical.
6. Test forced-colors, zoom, reflow, focus indicators and high-contrast modes in the actual product/site.
7. Recalculate any palette, opacity, gradient, background image or font-weight change.

## Result

All tested text pairings in the current SVG review masters pass WCAG 2.2 AA for normal text. The assets remain `review`, not `approved` or `channel_ready`, because naming, platform, final compression, assistive-technology and founder approvals remain open.
