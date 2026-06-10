# Make Master Router Test Checklist V1

## Purpose

Use this checklist to prove each Drivable Master Intake Router branch independently before replacing any old Make scenario.

Test payloads are in `MAKE_MASTER_INTAKE_TEST_PAYLOADS_V1.md`. Field destinations are in `MAKE_MASTER_INTAKE_ROUTER_FIELD_MAPPING_V1.md`.

## Safety Rules

- Test one route at a time.
- Use Make's `Run once` mode.
- Use only the matching test payload.
- Send email only to a Glenn-owned test inbox.
- Keep customer email disabled or temporarily hard-coded to a Glenn-owned test inbox.
- Do not use real customer contact information.
- Do not turn off an old scenario until the replacement branch passes every required check.
- Preserve raw JSON in Make execution history, a Make Data Store, or another approved test archive. The V1 workbook does not currently have a dedicated raw JSON column.

## Test Order

1. `support-concierge-request`
2. `marketplace-seller`
3. `diagnosis`
4. `buyer-interest`
5. `internal-diagnosis-response`

## Test Record

- Tester: ________________________________________
- Make scenario: __________________________________
- Test date: ______________________________________
- Glenn-owned test inbox: _________________________
- Master webhook confirmed: Yes / No

## support-concierge-request

**Filter:** `intakeType` equals `support-concierge-request`

**Expected sheet tab:** `Support_Concierge`

**Expected default status:** `New Support Request`

- [ ] Set the Make scenario to `Run once`.
- [ ] Confirm admin email points only to a Glenn-owned test inbox.
- [ ] Confirm customer confirmation is disabled or temporarily points only to a Glenn-owned test inbox.
- [ ] Send the matching `support-concierge-request` test payload.
- [ ] Verify the webhook receives exactly one bundle.
- [ ] Verify only the `support-concierge-request` router branch fires.
- [ ] Verify no sibling router branch runs.
- [ ] Verify the branch's OpenAI module runs.
- [ ] Verify the OpenAI module returns a useful summary.
- [ ] Verify the summary comes from the OpenAI module in this branch.
- [ ] Verify one row is added to `Support_Concierge`.
- [ ] Verify `Submitted At`, `Intake Type`, and `Source` are populated.
- [ ] Verify customer name, email, phone, topic, urgency, and message are populated.
- [ ] Verify scenario and report type context are preserved.
- [ ] Verify related case/listing IDs are populated when supplied.
- [ ] Verify status is `New Support Request`.
- [ ] Verify the original raw JSON is saved in the approved test location.
- [ ] Verify the admin/test email arrives with the route name in its subject.
- [ ] Verify no real customer receives an email.
- [ ] Review the Make run history for mapping errors or unexpected bundles.

**Branch result:** PASS / FAIL

**Make run ID:** ___________________________________

**Notes/fixes needed:**

____________________________________________________________________

____________________________________________________________________

## marketplace-seller

**Filter:** `intakeType` equals `marketplace-seller`

**Expected sheet tab:** `Seller_Intake`

**Expected default status:** `New Seller Intake`

- [ ] Set the Make scenario to `Run once`.
- [ ] Confirm admin email points only to a Glenn-owned test inbox.
- [ ] Confirm customer confirmation is disabled or temporarily points only to a Glenn-owned test inbox.
- [ ] Confirm customer email is not mapped to `sellerEmail`.
- [ ] Send the matching `marketplace-seller` test payload.
- [ ] Verify the webhook receives exactly one bundle.
- [ ] Verify only the `marketplace-seller` router branch fires.
- [ ] Verify no sibling router branch runs.
- [ ] Verify the branch's OpenAI module runs.
- [ ] Verify the OpenAI module returns a seller/condition summary.
- [ ] Verify the summary comes from the OpenAI module in this branch.
- [ ] Verify one row is added to `Seller_Intake`.
- [ ] Verify `Submitted At`, `Intake Type`, `Source`, `App Brand`, and `Marketplace Brand` are populated.
- [ ] Verify seller name, email, and phone are populated.
- [ ] Verify vehicle year, make, model, trim, mileage, asking price, and title status are populated.
- [ ] Verify known issues, recent repairs, runs-and-drives status, and listing type are preserved.
- [ ] Verify status is `New Seller Intake`.
- [ ] Verify the original raw JSON is saved in the approved test location.
- [ ] Verify the admin/test email arrives with the route or vehicle in its subject.
- [ ] Verify no real seller receives an email.
- [ ] Review the Make run history for mapping errors or unexpected bundles.

**Branch result:** PASS / FAIL

**Make run ID:** ___________________________________

**Notes/fixes needed:**

____________________________________________________________________

____________________________________________________________________

## diagnosis

**Filter:** `intakeType` equals `diagnosis`

**Expected destination:** Existing diagnosis case flow

**Optional operational tab:** `Activity_Log`

- [ ] Set the Make scenario to `Run once`.
- [ ] Confirm admin email points only to a Glenn-owned test inbox.
- [ ] Confirm customer confirmation is disabled, draft-only, or temporarily points only to a Glenn-owned test inbox.
- [ ] Confirm customer email is not mapped to `customer.email`.
- [ ] Send the matching `diagnosis` test payload.
- [ ] Verify the webhook receives exactly one bundle.
- [ ] Verify only the `diagnosis` router branch fires.
- [ ] Verify no sibling router branch runs.
- [ ] Verify the branch's OpenAI module runs.
- [ ] Verify the OpenAI result uses possible-cause, confidence, missing-evidence, and next-check language.
- [ ] Verify the result does not claim certainty or a guaranteed repair.
- [ ] Verify the summary comes from the OpenAI module in this branch.
- [ ] Verify the existing diagnosis case flow remains intact.
- [ ] Verify a row is added to the intended diagnosis destination or `Activity_Log`, as configured.
- [ ] Verify contact, vehicle, scenario, report type, symptoms, timing, and notes are populated.
- [ ] Verify media fields are preserved when supplied.
- [ ] Verify the existing diagnosis status is not incorrectly overwritten.
- [ ] Verify the original raw JSON is saved in the approved test location.
- [ ] Verify the admin/test email arrives with the route or vehicle in its subject.
- [ ] Verify no real customer receives an email.
- [ ] Review the Make run history for mapping errors or unexpected bundles.

**Branch result:** PASS / FAIL

**Make run ID:** ___________________________________

**Notes/fixes needed:**

____________________________________________________________________

____________________________________________________________________

## buyer-interest

**Filter:** `intakeType` equals `buyer-interest`

**Expected sheet tab:** `Buyer_Interest`

**Expected default status:** `New Buyer Interest`

Compatibility warning: current application documentation also references `marketplace-buyer-interest`. Prove which value the live application emits before production cutover. Do not silently combine the two contracts.

- [ ] Set the Make scenario to `Run once`.
- [ ] Confirm admin email points only to a Glenn-owned test inbox.
- [ ] Confirm customer confirmation is disabled or temporarily points only to a Glenn-owned test inbox.
- [ ] Confirm customer email is not mapped to `buyerEmail`, `customer.email`, or another incoming email field.
- [ ] Send the matching `buyer-interest` test payload.
- [ ] Verify the webhook receives exactly one bundle.
- [ ] Verify only the `buyer-interest` router branch fires.
- [ ] Verify no sibling router branch runs.
- [ ] Verify the branch's OpenAI module runs.
- [ ] Verify the OpenAI module returns a buyer-risk summary.
- [ ] Verify the summary comes from the OpenAI module in this branch.
- [ ] Verify one row is added to `Buyer_Interest`.
- [ ] Verify `Submitted At`, `Intake Type`, `Source`, and `Listing ID` are populated.
- [ ] Verify buyer name, email, and phone are populated.
- [ ] Verify the vehicle label is built from the supplied vehicle fields.
- [ ] Verify buyer questions, scenario, and report type are preserved.
- [ ] Verify status is `New Buyer Interest`.
- [ ] Verify the original raw JSON is saved in the approved test location.
- [ ] Verify the admin/test email arrives with the route or listing ID in its subject.
- [ ] Verify no real buyer receives an email.
- [ ] Review the Make run history for mapping errors or unexpected bundles.

**Branch result:** PASS / FAIL

**Make run ID:** ___________________________________

**Notes/fixes needed:**

____________________________________________________________________

____________________________________________________________________

## internal-diagnosis-response

**Filter:** `intakeType` equals `internal-diagnosis-response`

**Expected sheet tab:** `Internal_Review_Log`

**Expected default status:** `New Internal Review`

- [ ] Set the Make scenario to `Run once`.
- [ ] Confirm admin email or draft points only to a Glenn-owned test inbox.
- [ ] Confirm customer email is disabled.
- [ ] Send the matching `internal-diagnosis-response` test payload.
- [ ] Verify the webhook receives exactly one bundle.
- [ ] Verify only the `internal-diagnosis-response` router branch fires.
- [ ] Verify no sibling router branch runs.
- [ ] Verify the branch's OpenAI module runs when configured.
- [ ] Verify the OpenAI module returns the intended internal draft or summary.
- [ ] Verify the result comes from the OpenAI module in this branch.
- [ ] Verify one row is added to `Internal_Review_Log`.
- [ ] Verify `Submitted At`, `Intake Type`, `Source`, and `Case ID` are populated.
- [ ] Verify reviewer, confidence, recommendation, decision paths, and customer-ready summary are preserved.
- [ ] Verify internal notes remain internal.
- [ ] Verify status is `New Internal Review`.
- [ ] Verify draft-created status changes only after the draft module succeeds.
- [ ] Verify the original raw JSON is saved in the approved test location.
- [ ] Verify the admin/test email or draft appears with the route or case ID in its subject.
- [ ] Verify no real customer receives an email.
- [ ] Review the Make run history for mapping errors or unexpected bundles.

**Branch result:** PASS / FAIL

**Make run ID:** ___________________________________

**Notes/fixes needed:**

____________________________________________________________________

____________________________________________________________________

## Do Not Turn Off Old Scenario Until

For each intake type, keep its old scenario active until:

- [ ] The matching router branch passes.
- [ ] The expected sheet row is verified.
- [ ] Required fields and status values are verified.
- [ ] Raw JSON retention is verified.
- [ ] Admin and customer/test email behavior is verified.
- [ ] No real customer received test mail.
- [ ] The live app environment and webhook target are confirmed.
- [ ] One real-ish manual test is completed with a Glenn-owned email.
- [ ] The master route handles errors without exposing secrets or sending a false success message.
- [ ] Duplicate processing and duplicate email behavior have been checked.
- [ ] The old and new scenarios cannot both contact a real customer.

**Old scenario retirement approved by:** ____________________________

**Approval date:** _________________________________________________

## Final Router Sign-Off

| Route | PASS/FAIL | Sheet verified | Raw JSON verified | Email verified | Live target confirmed | Notes |
|---|---|---|---|---|---|---|
| `support-concierge-request` |  |  |  |  |  |  |
| `marketplace-seller` |  |  |  |  |  |  |
| `diagnosis` |  |  |  |  |  |  |
| `buyer-interest` |  |  |  |  |  |  |
| `internal-diagnosis-response` |  |  |  |  |  |  |
