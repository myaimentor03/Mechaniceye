# Drivable Capability-Safe Copy Audit V1

**Audit date:** 2026-08-24  
**Scope:** Launch source files under `docs/marketing/launch`.  
**Authority:** Verified behavior and the claim-to-proof matrix override aspirational copy.

## Decision

Public source copy may describe written symptom details, timing, dashboard information, recent work, and user-entered OBD information. No asset may claim Drivable accepts, stores, analyzes, listens to, watches, interprets, or draws conclusions from photo, audio, video, document, vision, vibration, or other sensor bytes until a release-specific end-to-end test proves it.

This does not prohibit production photography/video, general capture-safety warnings, accurate competitor research, clearly gated future architecture, media-permission documents, or test plans describing proof requirements.

## Corrected assets

| Asset | Unsafe implication removed | Safe wording |
|---|---|---|
| Landing-page kits | Flow may request photos, audio, vibration or documents | Written symptom, timing, dashboard, recent-work and user-entered OBD information |
| Creative copy library | Photos, sound and video can be captured for Drivable | Describe supported written and user-entered information |
| Channel campaign pack | Testers may submit photos, audio, vibration or documents | Promoted release expressly does not claim those modalities |
| Beta recruitment campaign | Product organizes photos and sounds | Product organizes supported written and user-entered details |
| Video production kit | Walkthrough said photos and sound can help | Walkthrough shows only release-supported information |
| Master launch blueprint | Core message listed photos and audio | Core message states the modality proof gate |
| Brand foundation | Interface chips implied photo/audio inputs | Chips reflect supported information classes |
| Evidence-table asset copy | Body promised photos or sound | Body lists supported written and user-entered information |

## Copy classifier

### Approved now

- “Describe what changed and when it happens.”
- “Add the dashboard message or warning you observed.”
- “Enter OBD information if you already have it and can do so safely.”
- “Missing information remains visible.”
- “The current evidence is not enough to rank a possibility.”

### Blocked until proof

- “Upload a photo for analysis.”
- “Let Drivable listen to the sound.”
- “Record a video and AI will inspect it.”
- “Measure the vibration with your phone.”
- “Scan this repair document.”
- “Our vision model found damage.”
- Any icon, animation or screenshot implying these behaviors without words.

### Prohibited without validated instrumentation

- Treating “the steering wheel shakes” as measured vibration data.
- Presenting ordinary phone motion as an automotive vibration diagnosis.
- Calling a filename, upload acknowledgement, preview or metadata extraction analysis of underlying media.

## Proof required to unlock a modality

For each modality and release, retain evidence that:

1. The client accepts the actual payload, not only metadata.
2. The backend associates the bytes with the correct user, vehicle and case.
3. Storage, retention, deletion, export and access match approved policy and consent.
4. A demonstrably capable service receives the intended content.
5. Its result affects the report in a traceable, source-labeled way.
6. Missing, corrupt, unsafe, malicious, unsupported and contradictory inputs fail safely.
7. Cross-user and cross-vehicle isolation tests pass.
8. Human review and safety escalation behave as promised.
9. The exact claim has dated evidence and approval in the substantiation register.

Passing one modality does not approve another. Accepting a photo does not prove vision analysis; accepting audio does not prove sound diagnosis; a text description of shaking never proves vibration measurement.

## Production review

Before export, recording, ad upload, store submission or press delivery, compare spoken words, captions, interface capture, icons, animation and implied behavior against this audit. A visual implication counts as a claim even when the script avoids the word “analyze.”

## Current result

The corrected source system is suitable for internal production planning. Public release remains blocked by naming, policy, reliability, support and product-verification gates.
