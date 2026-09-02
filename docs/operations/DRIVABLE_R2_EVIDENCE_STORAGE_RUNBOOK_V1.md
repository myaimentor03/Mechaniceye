# Drivable R2 Evidence Storage Runbook V1

**Status:** Owner-approved provider and retention policy; credentials and production verification pending  
**Bucket:** `mechanicseye-evidence`  
**Approved budget:** Up to $10/month  
**Approved retention:** 30 days  

This runbook configures private storage for customer evidence. It does not authorize external paid testers by itself. Customer/reviewer authentication, case-level authorization, deletion verification, incident response, and mobile-device testing remain launch gates.

## Implemented behavior

- The diagnosis intake sends media as multipart file bytes.
- The server stores configured media in private Cloudflare R2 using case-scoped object keys.
- Object keys do not contain the customer's original filename.
- Case IDs are sanitized to a safe alphanumeric segment before being used in an object key, so a case value can never inject path segments or sibling prefixes.
- Stored objects are marked `uploaded_not_analyzed`; the application does not claim that AI analyzed an image.
- Temporary server files are removed after an R2 upload attempt.
- A partial R2 upload is rolled back by deleting objects uploaded during that failed request.
- If R2 credentials are missing, media intake fails closed with HTTP 503 and the temporary media is removed.
- The legacy local file route returns 404 unless `DRIVABLE_ALLOW_LOCAL_FILE_ACCESS=true` is explicitly set. Do not enable it in production.

## Required owner action: create least-privilege credentials

In Cloudflare Dashboard, open **Storage & databases > R2 > Overview > Manage API Tokens** and create an R2 token with **Object Read & Write** permission limited to the `mechanicseye-evidence` bucket only.

Record the Access Key ID and Secret Access Key in the deployment platform's secret environment-variable controls. Never paste either value into a repository file, issue, chat transcript, screenshot, or client-side configuration.

Configure these server-only variables:

| Variable | Value |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account ID that owns the bucket |
| `R2_ACCESS_KEY_ID` | R2 token Access Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 token Secret Access Key |
| `R2_BUCKET_NAME` | `mechanicseye-evidence` |

Do not set `DRIVABLE_ALLOW_LOCAL_FILE_ACCESS` in production.

## Required owner action: enforce 30-day deletion

The application's `delete_after` object metadata is an evidence log; it does not delete the object. Configure a bucket lifecycle rule in the R2 bucket settings:

- Rule name: `delete-drivable-evidence-after-30-days`
- Prefix: `cases/`
- Action: expire/delete objects after 30 days
- Status: enabled

After saving, verify the lifecycle rule is visible and applies to the `cases/` prefix. Cloudflare documents that lifecycle deletion can occur after the expiration time rather than instantly, so operations must allow for processing delay when auditing deletion.

## Pre-Gate-A verification

Use synthetic media and a test case only.

1. Confirm all four R2 variables are configured server-side.
2. Confirm the bucket remains private and has no public development URL or custom public domain enabled.
3. Submit one supported photo from a mobile browser.
4. Verify the API accepts the case and the object appears under `cases/<case-id>/photos/`.
5. Verify the object name is generated and does not contain the original filename.
6. Verify object metadata includes `evidence_status=uploaded_not_analyzed`, the case ID, evidence type, and a 30-day `delete_after` timestamp.
7. Confirm the server's temporary upload directory does not retain the uploaded file.
8. Submit a photo while one required R2 variable is absent in a non-production test environment. Verify HTTP 503 and confirm neither R2 nor local disk retains the file.
9. Submit a photo larger than 12 MB. Verify HTTP 413 and confirm it is not retained.
10. Force an R2 upload failure after at least one object succeeds. Verify the request fails and the objects from that request are removed.
11. Confirm `/api/files/<known-local-filename>` returns 404 in the production configuration.
12. Record screenshots/log evidence without displaying credentials, customer information, or signed URLs.

## Deletion request process

Until an authenticated deletion workflow is implemented, an owner handles deletion requests manually:

1. Verify the requester's identity and case ownership outside the public intake endpoint.
2. Locate only the object prefix for the verified case: `cases/<case-id>/`.
3. Record the case ID, request time, verifier, deletion time, object count, and result in the private operations log.
4. Delete the case prefix from R2.
5. Verify the prefix no longer lists any objects.
6. Send a plain-language confirmation that media was deleted. Do not claim deletion of unrelated operational records unless that was separately verified.

Manual deletion is an owner-only controlled-beta process, not a scalable production workflow.

## Incident rollback

Stop external evidence intake immediately if any of the following occurs:

- the bucket becomes public;
- credentials appear in source control, logs, screenshots, or customer-visible output;
- one customer or reviewer can access another case's evidence;
- files remain on local disk after upload processing;
- lifecycle configuration is missing or changed unexpectedly;
- deletion cannot be completed and verified;
- the application reports media as analyzed when it was only uploaded.

Rollback actions:

1. Remove or disable the R2 credentials in the deployment environment to make new media submissions fail closed.
2. Rotate the affected R2 token if exposure is suspected.
3. Disable any public bucket access or public domain.
4. Preserve non-sensitive incident evidence and identify affected case prefixes.
5. Delete unauthorized copies only after the affected scope is established.
6. Resume owner-only testing only after access, deletion, and logging controls are reverified.

## Evidence required before external testers

- Passing TypeScript and production build output for the exact deployed commit.
- Private-bucket configuration screenshot with secrets excluded.
- Least-privilege token scope evidence with secrets excluded.
- Enabled 30-day lifecycle rule evidence.
- Successful mobile upload evidence for at least one iPhone Safari and one Android Chrome device.
- Cross-customer and unauthorized-reviewer access-denial tests after authentication is implemented.
- Successful deletion-request rehearsal with object-count verification.
- Proof that temporary local files are removed on success, rejection, and R2 failure.
- Human reviewer workflow evidence showing media remains `uploaded_not_analyzed` unless a future separately approved analysis path is implemented.

Do not open external paid testing until every item above is recorded and the paid-beta go/no-go gate is approved.
