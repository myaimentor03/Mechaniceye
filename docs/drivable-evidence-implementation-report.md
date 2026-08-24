# Drivable Evidence Implementation Report

## 1. Executive Summary

The active Drivable Check now sends real photo bytes as multipart form data. The Express server validates count, declared MIME type, byte size, and image signatures; assigns server-controlled attachment IDs and extensions; stores each case under a case-scoped evidence manifest; and returns attachment metadata that explicitly says `uploaded_not_analyzed`.

The same shared TypeScript evidence intake supports `diagnose`, `buy`, and `sell`. VIN, mileage, and normalized manual OBD-II codes are available to the active diagnosis intake. Audio, video, and sensor capture remain deliberately disabled in this photo-first slice rather than pretending filenames or simulated readings are evidence.

Production-durable media storage and real image analysis are not complete. Runtime filesystem storage works locally, but an ordinary Render filesystem is ephemeral unless a persistent disk or external object store is configured. The current Drivable AI implementation is mock/report-boundary logic and does not send image bytes to a vision-capable model.

## 2. Confirmed Active Runtime

- `client/src/main.tsx` renders `client/src/TestBackend.tsx`.
- The active Drivable Check and submit handler live in `TestBackend.tsx`.
- Buyer Check is routed to `client/src/components/BuyerCheckPreview.tsx`.
- The live intake route is `POST /api/diagnoses` in `server/routes.ts`.
- Multer is already installed and is used for multipart parsing.
- The case layer is the local operations case store when available, with the existing public database path used for hosted fallback.
- The current Drivable AI mode does not contain a verified live vision request.

## 3. Files Changed

- `client/src/TestBackend.tsx`: added mobile capture/choose controls, local previews, removal, client limits, VIN/mileage/OBD fields, structured shared intake mapping, and multipart photo-byte submission.
- `client/src/app.css`: added responsive preview layout and mobile tap targets without adding a UI framework.
- `client/src/lib/queryClient.ts`: allows existing API helpers to carry `FormData` without incorrectly forcing a JSON content type.
- `shared/drivableEvidence.ts`: defines the shared Diagnose/Buy/Sell vehicle, situation, OBD, provenance, and attachment contract without browser `File` objects.
- `server/evidence-storage.ts`: validates image signatures, creates server IDs/keys, writes case manifests, cleans partial writes, and exposes case cleanup.
- `server/evidence-storage.test.ts`: tests shared-mode readiness, byte persistence, traversal defense, renamed executable rejection, MIME/signature mismatch, storage failure, and cleanup.
- `server/routes.ts`: accepts multipart intake, validates shared metadata, associates stored attachments with the generated case, preserves text-only local behavior, reports persistence honestly, forwards attachment references to the report/AI boundary, and cleans hosted media when required database persistence fails.
- `package.json`: adds `npm run test:evidence`.

## 4. Photo Pipeline

Phone/browser → camera capture or photo chooser → local object-URL preview → client count/type/size checks → multipart `photos` fields → Multer memory receipt → server MIME/limit checks → actual signature verification → server-generated UUID and type-derived extension → `uploads/evidence/<caseId>/` → `attachments.json` manifest → attachment metadata in the case response and public report packet.

The packet makes provenance explicit and reports `analysisStatus: uploaded_not_analyzed`. Filename text is never treated as a visual finding.

## 5. Storage Reality

- Local development: photo bytes and attachment manifests survive application restarts as long as the local project filesystem remains intact.
- Local operations case store: the attachment manifest is independently case-associated by the same server case ID. The existing case store remains unchanged because database/schema changes were prohibited.
- Render without a persistent disk: media is ephemeral and must not be described as durable.
- Production beta requirement: configure a Render persistent disk mounted at the evidence root or, preferably for scale and retention controls, an object store with private access, encryption, deletion, and signed retrieval. Credentials and infrastructure are still required.
- Hosted database failure: stored runtime media is deleted before a failure response to reduce orphan evidence.

## 6. AI Reality

Image bytes are **not** analyzed by the current AI path. Attachment IDs, storage keys, MIME types, sizes, provenance, and `uploaded_not_analyzed` status reach the report/AI boundary. A later vision integration must retrieve private bytes, send them to a vision-capable model, record the model/request/version, and change status to `analyzed` only after a successful response.

## 7. Mobile Changes

- Separate “Take photo” and “Choose photos” actions.
- Rear-camera capture hint on supported mobile browsers.
- 44-pixel minimum action targets.
- Two-column phone preview grid and four-column larger-screen grid.
- Viewport-contained images and ellipsized filenames.
- Full-width removal control per preview.
- Visible submission/error state through the existing form alert and submit button.
- Client rejection for more than eight photos, unsupported types, or files above 12 MB.

## 8. Shared Evidence Contract

The contract separates vehicle identity, situation evidence, OBD evidence, attachment metadata, provenance, persistence status, and analysis status. It supports Diagnose, Buyer Check, and Seller Check/ClearSale without embedding browser-only file objects or promoting seller claims into observed facts.

## 9. Tests Run

- `npm run check` — PASS.
- Focused evidence tests compiled with TypeScript NodeNext and executed with Node's test runner — 5/5 PASS.
- `npm run test:evidence` — the installed `tsx` launcher fails before loading tests on this Windows machine with `uv_os_get_passwd returned ENOMEM`; the alternate TypeScript-compile plus Node test path proves the tests themselves pass.
- `npm run build` — reached Vite transformation but did not complete on this resource-constrained machine. No new `dist` artifact was used as evidence. This remains a verification blocker before deployment.
- `git diff --check` — evidence files clean; the only reported blank-line warning belongs to the pre-existing, excluded NHTSA workstream file.

## 10. Blockers

### P0

- Configure durable private production media storage.
- Complete a production build on a healthy runner.
- Add a real private attachment retrieval path and access controls before any external customer can retrieve media.
- Run owner-operated end-to-end tests against the deployed beta environment.

### P1

- Implement and evaluate a real vision-capable analysis path with honest model/request provenance.
- Add authentication, consent versions, retention/deletion workflow, and reviewer authorization.
- Add route-level integration tests for Multer oversize/count errors and database failure cleanup.

### P2

- Add guided audio/video capture and processing.
- Design controlled, mounted-phone vibration sessions after collection protocols and labeled outcomes exist.

## 11. Remaining Work

- Migrate Buyer Check UI onto the shared intake contract.
- Add Seller Check guided evidence and transparent AI listing composition.
- Build accounts, saved vehicles, reviewer queue, consent, privacy, and retention controls.
- Add private object storage and attachment lifecycle operations.
- Implement audio/video evidence, followed later by calibrated sensor sessions.
- Link real inspection/repair outcomes to evidence and recommendations.
- Expand mechanic matching only after the human-reviewed Drivable service is reliable.

## 12. Recommended Next Codex Task

Implement the paid-beta identity, consent, and human-review case workflow foundation without changing the NHTSA pipeline: passwordless account entry, saved case ownership, versioned media consent, reviewer-only status transitions, `approved_to_send` enforcement, private attachment authorization, and retention/deletion interfaces. Add tests proving one user cannot access another user's case or attachment, mock/unreviewed output cannot be sent, and consent is recorded before media persistence.
