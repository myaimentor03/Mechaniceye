# Drivable Synthetic Evidence-Chain Demonstration V1

**Artifact type:** Complete launch demonstration specification  
**Data status:** Entirely synthetic; no real person, vehicle, seller, mechanic, shop, document, account, or outcome  
**Product status:** Target demonstration of the intended architecture—not proof that the current live product performs the workflow  
**Public-use gate:** Naming clearance, implemented end-to-end workflow, released-build capture, product/safety/privacy review, and visual QA

## 1. Demonstration Goal

Show the central Drivable position in one understandable story:

> Evidence can move through an owner concern, Buyer Check, seller disclosure, human review, mechanic handoff, and outcome without losing its source or turning an early possibility into a retroactive fact.

The demonstration must visibly distinguish:

- what a person states;
- what submitted evidence directly shows;
- what a device reports;
- what an uploaded document states;
- what a human reviewer observes;
- what a qualified in-person professional later reports;
- what remains unknown or conflicting;
- what Drivable infers as a possible cause.

## 2. Synthetic Vehicle Record

| Field | Synthetic value | Provenance label |
|---|---|---|
| Vehicle alias | Demo Sedan 01 | Synthetic system label |
| Model description | 2016 compact gasoline sedan | Synthetic user-entered context |
| Mileage | 112,400 miles | Synthetic owner-stated value; not verified |
| VIN | DEMO-NOT-A-VIN | Synthetic; deliberately invalid and non-identifying |
| Plate | DEMO | Synthetic; not a real registration |
| Owner identity | Demo Owner | Synthetic person |
| Seller identity | Demo Seller | Synthetic person |
| Mechanic identity | Demo Technician | Synthetic professional role; no implied credential |
| Location | Demo City | Synthetic; no real geography |

Every screen and frame must display `SYNTHETIC DEMONSTRATION — NOT A REAL VEHICLE OR RESULT`.

## 3. Initial Owner Concern

### Owner statement

`The engine sometimes feels uneven for about twenty seconds after a cold start. I noticed it twice this week. The check-engine light came on once and later turned off. I do not know the cause.`

**Provenance:** Owner stated.  
**What it proves:** The owner reported these observations.  
**What it does not prove:** That the symptom occurred, which component is involved, severity, safety, or whether the vehicle can be driven.

### Context supplied

- Symptom noticed after the vehicle sat overnight.
- No smoke or visible fluid leak reported.
- Fuel was purchased two days before the first event.
- Routine maintenance record not available in the demonstration.
- No attempt is made to recreate the symptom for filming.

Each item remains `Owner stated` unless separate evidence supports it.

## 4. Evidence Requests

The target guided intake requests only evidence with a defined purpose and a safe alternative.

| Request | Purpose | Safe instruction | Decline option |
|---|---|---|---|
| Exact dashboard message or light | Distinguish a reported warning from a remembered description | Photograph only while parked and the vehicle state permits safe capture | `I cannot provide this` |
| Symptom timing | Identify repeatable operating conditions | Write notes after parking; do not recreate the symptom | `I am not sure` |
| OBD diagnostic trouble code | Add device-reported structured context | Use a compatible device according to its instructions while parked; do not handle equipment while driving | `No compatible data available` |
| Recent fuel/service history | Identify contextual changes without treating them as causes | Provide only records the user is authorized to share | `Unknown / not available` |
| Audio/video/photo | Not requested in this demonstration | No modality claim is made until the implementation proves byte processing | Not applicable |
| Vibration | Never requested as sensor evidence | A written observation may say `felt uneven`; it is not vibration analysis | Not applicable |

## 5. Synthetic Submitted Evidence

### E-001 — Owner symptom statement

- Source: Demo Owner
- Type: Text statement
- State: Submitted
- Quality: Clear enough to describe timing; not independently observed
- Allowed reuse: Demo Owner concern workflow only until separate authorization is demonstrated

### E-002 — OBD code entry

- Synthetic payload: `P0301 — Cylinder 1 Misfire Detected`
- Source: Synthetic compatible-device entry
- Type: Device-reported structured value
- State: Submitted, not authenticated against a real vehicle
- Quality: Code is syntactically plausible for the demonstration
- Important limit: A code identifies a detected condition; it does not name the failed part or prove a repair

### E-003 — Fuel context

- Statement: `Fuel purchased two days before the first event`
- Source: Demo Owner
- State: Owner stated
- Important limit: Timing alone does not establish causation

### E-004 — Maintenance history

- Value: Not provided
- State: Missing evidence
- Effect: Reduces confidence and creates a follow-up question

No media file is represented as uploaded or analyzed.

## 6. Drivable Check Target Output

### Report heading

`Possible causes supported by the current synthetic evidence`

### Possibility 1 — Ignition-related misfire at cylinder 1

**Confidence label:** Moderate  
**Support:** Device-reported P0301 and owner-stated brief uneven cold start  
**Conflict:** No direct component test; no recurring active warning captured  
**Missing:** Maintenance history, freeze-frame data, repeat scan, physical inspection  
**Why not higher:** Multiple ignition, fuel, mechanical, wiring, or control conditions can produce a cylinder-specific misfire code  
**Next question:** `What tests would distinguish the ignition coil, spark plug, wiring, injector, compression, or another cause before replacing a part?`

### Possibility 2 — Fuel-delivery issue affecting cylinder 1

**Confidence label:** Low  
**Support:** Cylinder-specific misfire code; owner reported recent fuel purchase  
**Conflict:** Recent fuel timing is not proof; no fuel-quality, injector, pressure, or trim evidence  
**Missing:** Fuel-trim/freeze-frame information and in-person testing  
**Next question:** `Is there measured evidence of a cylinder-specific injector or fuel-delivery problem?`

### Possibility 3 — Mechanical condition affecting cylinder 1

**Confidence label:** Low  
**Support:** Cylinder-specific misfire can have a mechanical cause  
**Conflict:** Brief cold-start behavior alone is nonspecific; no compression, leak-down, or physical evidence  
**Missing:** Qualified mechanical testing  
**Next question:** `If ignition and fuel tests are inconclusive, what mechanical test is appropriate?`

### Safety boundary

`This synthetic report is not a confirmed diagnosis, repair instruction, or determination that a vehicle is safe to drive. A real user facing severe shaking, flashing warning lights, smoke, fire, fuel odor/leak, overheating, loss of power in traffic, or another potentially dangerous condition should stop using the vehicle and seek appropriate qualified or emergency help.`

### Honest insufficient-evidence behavior

The target product must be able to say:

`The current evidence is not sufficient to rank a responsible cause. Do not replace a part based only on this report.`

## 7. Human Review Target

The human review layer sees the same provenance and is not instructed to confirm a diagnosis from the remote evidence.

### Synthetic human-review note

`The available synthetic record supports a cylinder 1 misfire condition reported by the device entry, but it does not establish the failed component. The maintenance history and freeze-frame context are absent. An in-person professional should test before recommending parts.`

**Provenance:** Demo human-review note.  
**Scope:** Review of submitted synthetic evidence only.  
**Not allowed:** `Confirmed bad coil`, `safe to drive`, `replace the spark plug`, or `verified diagnosis`.

The live Mechanic's Eye Review route must not be used in final capture until its navigation defect and product contract are corrected.

## 8. Mechanic Handoff Target

The Demo Owner explicitly authorizes sharing these items with Demo Technician:

- E-001 symptom statement;
- E-002 OBD code entry;
- Drivable possible-cause summary;
- human-review note;
- missing-evidence list;
- prepared questions.

The handoff excludes account contact data, unrelated documents, analytics, marketing consent, and any evidence not needed for the service request.

### Handoff summary

`Demo Owner reports an intermittent uneven cold start lasting about twenty seconds. Synthetic device entry reports P0301. No maintenance history, freeze-frame data, media, or physical test is available. Drivable ranked ignition-related causes as moderate and fuel/mechanical causes as low, without confirming a failed component. Please perform appropriate in-person tests and record what was directly observed or measured.`

## 9. Synthetic Professional Outcome

### Demo Technician report

`During the synthetic in-person workflow, the technician records that the ignition coil from cylinder 1 was exchanged with another cylinder for testing. The misfire code moved with the coil during the synthetic test. The technician reports that this supports a failed ignition coil.`

**Provenance:** Demo Technician reported.  
**Verification level:** Synthetic professional test report, not independently verified by Drivable.  
**Important:** This later result does not transform Drivable's earlier moderate possibility into an earlier confirmed fact.

### Demo repair outcome

`The synthetic record states that the coil was replaced and the symptom was not observed during the defined synthetic follow-up period.`

**Provenance:** Synthetic combined technician/owner outcome statement.  
**Limit:** Absence during a defined period is not a lifetime guarantee and must not become an accuracy or repair-success statistic without a real study.

## 10. Buyer Check Reuse Target

Months later, Demo Owner chooses to sell Demo Sedan 01 and separately authorizes selected evidence for Buyer Check.

### Seller disclosure

`Seller states that an intermittent cylinder 1 misfire was investigated and an ignition coil was replaced.`

**Label:** Seller stated.  
**Supporting items:** Synthetic earlier code record and synthetic technician report are available.  
**Not claimed:** Accident history, title status, current mechanical condition, future reliability, or complete repair history.

### Buyer Check display

| Field | Display |
|---|---|
| Seller statement | `Seller states an ignition coil was replaced after a cylinder 1 misfire investigation.` |
| Submitted device record | `Synthetic P0301 entry exists in the evidence record.` |
| Professional report supplied | `Synthetic technician report describes a coil-swap test and replacement.` |
| Current condition | `Unknown; no current independent inspection supplied.` |
| Independent verification | `Not performed by Drivable.` |
| Buyer next step | `Request current service documentation and an independent pre-purchase inspection.` |

The AI-generated listing may summarize the record only with these labels. It must not say `problem fixed`, `runs perfectly`, `verified repair`, `no issues`, or `mechanically sound`.

## 11. Marketplace Listing Target

Because ClearSale is a provisional name pending legal/owner review, final filmed narration and permanent graphics use the generic label `Drivable evidence-forward listing demonstration`.

### Approved synthetic listing copy

`The seller reports that an intermittent cylinder 1 misfire was investigated and an ignition coil was replaced. A synthetic device-code entry and synthetic technician report are supplied in this demonstration. Drivable has not independently verified the repair or current vehicle condition. An independent pre-purchase inspection is recommended.`

### Mandatory disclosure

`AI-generated demonstration text based on synthetic seller information and synthetic submitted evidence. Seller claims remain attributed to the seller. This is not a real listing, inspection, title report, or transaction.`

## 12. Version and Correction Demonstration

The evidence chain must show:

- original owner statement retained;
- later correction appended without silently replacing the original;
- report version and timestamp;
- which evidence each version used;
- human-review addition as a separate source;
- professional outcome as later evidence;
- seller-authorized reuse scope;
- current withdrawal/deletion state;
- audit record for material label changes.

## 13. Launch Film / Walkthrough Sequence

| Time | Screen/story | Required spoken idea |
|---|---|---|
| 0–8s | Synthetic owner concern | `Start with what changed—not a guessed part.` |
| 8–18s | Evidence request and source labels | `Every item keeps its source.` |
| 18–30s | Three bounded possibilities | `Confidence shows support, conflict, and missing evidence.` |
| 30–40s | Human review and mechanic handoff | `Human and hands-on help add evidence without rewriting the past.` |
| 40–52s | Later professional report and outcome | `A later outcome is new evidence—not proof the first answer was certain.` |
| 52–65s | Seller disclosure and Buyer Check reuse | `The seller's statement remains a claim; the buyer sees what supports it and what is unknown.` |
| 65–75s | Evidence-chain overview | `One authorized evidence chain across the next vehicle decision.` |
| 75–82s | Boundary and brand | `Synthetic demonstration. Not a diagnosis, inspection, or safety determination.` |

Do not film or render this walkthrough from concept screens. Capture only the verified release build after it performs the complete flow.

## 14. Acceptance Criteria

- Synthetic banner appears on every frame and export.
- No real VIN, plate, person, contact, vehicle, shop, document, location, or outcome is used.
- Owner statements, device entries, model inferences, human notes, professional reports, seller claims, and system labels remain distinct.
- No photo, audio, video, vision, or vibration analysis appears.
- Possible causes remain possible after the later synthetic outcome.
- Buyer Check does not imply inspection, title verification, current condition, or future reliability.
- Seller disclosure does not become a Drivable fact.
- Reuse requires an explicit demonstrated authorization event.
- Removal/withdrawal and correction behavior appear.
- The release build, privacy, terms, and consent support every shown behavior.
- Accessibility, mobile, captions, transcript, alt text, contrast, focus, zoom, and reduced-motion review pass.
- Naming clearance determines the final marketplace label before permanent media production.

