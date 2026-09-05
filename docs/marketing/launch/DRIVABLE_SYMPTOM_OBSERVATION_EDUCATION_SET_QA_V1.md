# Drivable Symptom Observation Education Set QA V1

**Created:** 2026-09-01  
**Status:** Internal organic-content review; not approved for publication  
**Family:** SO-001 — What Changed?

## 1. Complete Four-Card Multi-Format Set

| Sequence | Concept | Portrait master | Story/reel master |
|---:|---|---|---|
| 1 | When does it happen? | `assets/social/DRV_SO-001_symptom-card_when-does-it-happen_4x5_v01_review.svg` | `assets/social/DRV_SO-001_symptom-card_when-does-it-happen_9x16_v01_review.svg` |
| 2 | Describe what changed | `assets/social/DRV_SO-001_symptom-card_describe-what-changed_4x5_v01_review.svg` | `assets/social/DRV_SO-001_symptom-card_describe-what-changed_9x16_v01_review.svg` |
| 3 | What makes it change? | `assets/social/DRV_SO-001_symptom-card_what-makes-it-change_4x5_v01_review.svg` | `assets/social/DRV_SO-001_symptom-card_what-makes-it-change_9x16_v01_review.svg` |
| 4 | What happened before? | `assets/social/DRV_SO-001_symptom-card_what-happened-before_4x5_v01_review.svg` | `assets/social/DRV_SO-001_symptom-card_what-happened-before_9x16_v01_review.svg` |

Each master has a 2× PNG review export. Every portrait card has a native 1080 × 1350 JPEG quality-82 compression simulation, and every vertical card has a native 1080 × 1920 JPEG quality-82 compression simulation under `assets/proofs/channel-simulation/`.

## 2. Complete Organic Captions

### Card 1 — When does it happen?

When a vehicle changes, timing can be useful context. Was it at startup, while idling, during braking, while turning, or under load? Was the vehicle cold, warm, or recently parked?

Write down only what you already noticed. Pull over and park before typing or recording anything. Never continue driving or recreate a symptom to make a note more complete.

Educational information only. Not a diagnosis, inspection, emergency service, or vehicle-safety determination.

### Card 2 — Describe what changed

A useful observation separates before, now, and unknown. Describe what was normal for this vehicle, what you can safely notice now, and what the observation does not establish.

Plain language is enough. “I do not know what caused the change” is more accurate than guessing at a failed part.

Write from memory after parking. Educational information only; not a diagnosis or repair recommendation.

### Card 3 — What makes it change?

Context can help organize the next conversation: temperature, vehicle action, road or weather conditions, load, accessories, or time spent sitting.

Use only what you already noticed safely. Do not repeat a maneuver, continue driving, or approach a hazard to run a test for Drivable. “I do not know” and “I could not observe this safely” are valid answers.

Educational information only. Not a diagnosis, inspection, emergency service, or instruction to operate an unsafe vehicle.

### Card 4 — What happened before?

Recent service, fuel or charging, a battery event, weather, road impact, load, accessories, route, or storage can be useful context when their timing is recorded honestly.

Sequence does not prove cause. Use records when available, label details remembered by the user as memory, and keep unknowns visible. Do not assign blame or convert one event into a conclusion without evidence.

Educational information only. Not a diagnosis, causation finding, or repair recommendation.

## 3. Alt Text

- **Card 1:** Dark Drivable educational card titled “When does it happen?” Six panels ask about startup, idling, braking, turning, load, and uncertainty. A safety panel says to notice conditions only when safe, park before recording, and never recreate a symptom.
- **Card 2:** Light Drivable educational card titled “Describe what changed.” Three rows organize a written observation into before, now, and unknown, followed by a reminder that a clear note is not a diagnosis and should be written from memory after parking.
- **Card 3:** Dark Drivable educational card titled “What makes it change?” Four panels cover temperature, action, conditions, and vehicle state. A safety panel says to use memory, not run a test, and accepts “I could not observe this safely.”
- **Card 4:** Light Drivable educational card titled “What happened before?” Four rows cover service or repair; fuel, charging, or battery events; weather, road, or impact events; and load, accessory, or routine changes. A callout states that sequence is context, not proof of cause.

## 4. Capability, Causation, and Safety Review

- The set asks for written or remembered observations and user-supplied context only.
- It does not state or imply that Drivable receives or analyzes photo, audio, video, document, computer-vision, sound, or vibration bytes.
- Timing and sequence remain context. Neither is treated as proof of a failed part, responsible person, repair need, or causal relationship.
- Synthetic example sentences are generic educational writing examples, not reports from a real user or vehicle.
- Unknown, unavailable, and unsafe-to-observe details remain unresolved rather than being inferred.
- Every card avoids declaring the vehicle safe, roadworthy, repaired, or ready to drive.
- The set instructs the user to park before writing and never continue driving, recreate a symptom, repeat a maneuver, approach a hazard, or handle equipment while driving for evidence collection.
- The set does not tell a user to ignore warning signs or wait for Drivable when qualified or emergency help may be needed.

## 5. Visual and Compression QA

Cards 2–4 were rendered locally at 2× to lossless PNG and visually inspected. The first pass identified one clipped `UNKNOWN` rail label on card 2. Its type size was corrected in the editable SVG, the PNG was regenerated, and the corrected master was re-inspected.

All four portrait cards have native 1080 × 1350 JPEG quality-82 simulations. The three new portrait simulations were visually inspected and retain readable headings, supporting copy, safety language, labels, and footer limitations without material compression artifacts.

Four independently composed 1080 × 1920 vertical masters were then rendered to lossless 2× PNG and native quality-82 JPEG simulations. Each vertical layout preserves conservative top and bottom safe areas, places essential meaning above the footer region, and retains the relevant no-diagnosis, no-testing, or no-causation boundary without depending on audio, animation, or a platform caption. All four PNGs and all four compressed simulations were visually inspected. No clipping, overflow, panel collision, or material compression artifact was observed.

The renderer reported unavailable writable font-cache directories, but rendering completed with the declared `Inter, Arial, sans-serif` stack. Final production export must repeat font and layout QA in the approved production environment.

## 6. Publication Gates

- owner and naming approval;
- final channel crop, compression, feed, and device preview;
- destination, caption, alt-text, and moderation approval;
- verification that the destination repeats the same safety, uncertainty, and capability boundaries;
- approved account ownership and publication authorization;
- a released product state that does not contradict the written-input boundary; and
- final in-account story/reel overlay and crop preview before vertical placement.

## 7. Review Result

The complete four-card portrait and story/reel set passes internal capability, causation, safety, provenance, visual, caption, alt-text, safe-area, and compression review. Status remains **review — not publish-ready**.
