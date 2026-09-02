# Drivable Web and Install Icon Package QA V1

Status: internal review assets; not approved for deployment  
Source: `assets/brand/DRV_BR-003_app-icon_dark_v01_review.svg`

## Package contents

All files are stored in `assets/web/icons/`.

| Purpose | File | Dimensions/contents |
|---|---|---|
| Browser favicon | `DRV_WB-012_favicon-16_v01_review.png` | 16 x 16 PNG |
| Browser/favicon fallback | `DRV_WB-012_favicon-32_v01_review.png` | 32 x 32 PNG |
| Browser/favicon fallback | `DRV_WB-012_favicon-48_v01_review.png` | 48 x 48 PNG |
| Multi-size browser icon | `DRV_WB-012_favicon_v01_review.ico` | 16, 32, and 48 px entries |
| Apple touch icon | `DRV_WB-012_apple-touch-icon-180_v01_review.png` | 180 x 180 PNG |
| PWA icon | `DRV_WB-012_pwa-icon-192_v01_review.png` | 192 x 192 PNG |
| PWA icon | `DRV_WB-012_pwa-icon-512_v01_review.png` | 512 x 512 PNG |
| Maskable PWA icon | `DRV_WB-012_pwa-maskable-192_v01_review.png` | 192 x 192 PNG |
| Maskable PWA icon | `DRV_WB-012_pwa-maskable-512_v01_review.png` | 512 x 512 PNG |
| Small-size QA proof | `DRV_WB-012_small-icon-pixel-review_v01_review.png` | Enlarged nearest-neighbor comparison of 16, 32, and 48 px renders |

## Mask-safe construction

The source has a full-bleed dark background and keeps the meaningful D-shaped evidence path within the central mask-safe region. The same rendered artwork is therefore suitable for both standard and maskable PWA declarations; separate filenames prevent an implementer from assigning the wrong manifest purpose. Previous circle and squircle simulations are retained under `assets/proofs/channel-simulation/`.

The three colored points communicate source or evidence states, not vehicle condition or safety. The mark contains no certification badge, checkmark, shield, wrench, warning-light imitation, or claim text.

## Visual review

- The 512 px source-derived export is crisp and balanced.
- The 180 and 192 px exports preserve the D path, center line, and all three points.
- The 48 and 32 px exports remain recognizable without manual pixel editing.
- At 16 px, antialiasing compresses the curved path and the evidence points become coarse, but the high-contrast D structure remains distinguishable.
- The enlarged small-size proof is a diagnostic artifact, not a public asset.
- Existing circle and squircle simulations show no exposed perimeter, corner gap, or clipped evidence point after the earlier full-bleed correction.

## Deployment gate

Do not copy these files into the application or reference them from a manifest until:

- the Drivable naming/trademark decision is recorded;
- the owner approves the mark;
- the target browser/PWA/mobile distribution plan is confirmed;
- actual browser tabs, bookmarks, home-screen installs, and adaptive masks are previewed on supported devices;
- the application manifest, theme color, background color, and icon-purpose declarations are reviewed together;
- final approved filenames are versioned without overwriting these review files.

## Review result

The package passes internal format, small-size legibility, and simulated-mask review. Status remains **review — not deployment-ready**.
