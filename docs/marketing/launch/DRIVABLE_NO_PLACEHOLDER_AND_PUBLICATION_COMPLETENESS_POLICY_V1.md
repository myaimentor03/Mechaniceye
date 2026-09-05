# Drivable No-Placeholder and Publication Completeness Policy V1

## Rule

Drivable launch materials must never contain a human fill-in placeholder, invented fact, guessed contact, guessed URL, unapproved date, unapproved budget, anonymous owner field, or unfinished publication instruction.

An asset has only two acceptable states:

1. **Complete for its stated purpose:** every factual value is verified, the copy is final for that version, dependencies are satisfied, and approval is recorded.
2. **Blocked:** the asset is absent from publishable folders, the manifest states exactly what prevents completion, and no partially fillable public copy is retained.

`Drafted`, `review`, and `source` may describe a complete internal artifact—such as an editable SVG review master or a final production specification—but must never mean “someone still needs to replace brackets.”

## Runtime Data Exception

Personalization and case data may be inserted only by an implemented, tested system using a defined data contract. Examples include a recipient display name, submission identifier, report link, or requested evidence list. These values must not appear as informal brackets in marketing source files.

Before activation, the implementation must prove:

- field source and authorization;
- required versus optional behavior;
- escaping and injection safety;
- missing-value fallback that produces grammatical, truthful copy;
- privacy and analytics handling;
- signed-out and wrong-recipient access protection where relevant;
- rendering in HTML, plain text, mobile, dark mode, and assistive technology;
- test coverage preventing unresolved merge syntax from sending.

Until that system exists, lifecycle messages remain blocked and their incomplete bodies are not stored as production assets.

## Publication Preflight

Every candidate must pass automated and human checks for:

- bracketed fill-ins;
- `TODO`, `TBD`, `TK`, `fill in`, `insert`, or equivalent notes;
- fake example contacts, dates, metrics, prices, ratings, testimonials, and URLs;
- unresolved merge syntax;
- dead, redirecting, environment-specific, or unapproved links;
- unavailable product or roadmap-as-reality language;
- unverified evidence modalities;
- unsupported claims and missing disclosures;
- absent rights, approval, owner, stop condition, or rollback file.

If any item fails, the asset does not publish.

## Source-Fact Rule

Do not “complete” an asset by guessing. When a required fact is unknown, remove the incomplete public copy, mark the manifest item blocked, and name the authoritative evidence required to restart production.

## Current Application

On 2026-08-24, the launch studio was audited and human fill-in placeholders were removed. Incomplete lifecycle, outreach, worker-handoff, and press/founder drafts were deleted rather than preserved as deceptively ready copy. Their manifest entries now identify the verified facts and operating systems required before complete assets can be produced.

