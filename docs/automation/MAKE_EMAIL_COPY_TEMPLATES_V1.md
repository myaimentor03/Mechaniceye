# Make Email Copy Templates V1

## Purpose

Provide safe, copy/paste starting points for Drivable Make admin notifications and customer confirmations.

These templates do not approve a listing, publish a vehicle, confirm a diagnosis, guarantee a repair, or promise a transaction outcome.

## Make Placeholder Rules

The examples use Make-style placeholders such as:

- `{{1.intakeType}}`
- `{{1.name}}`
- `{{1.email}}`
- `{{1.phone}}`
- `{{1.sellerName}}`
- `{{1.sellerEmail}}`
- `{{1.buyerName}}`
- `{{1.buyerEmail}}`
- `{{1.vehicleYear}}`
- `{{1.make}}`
- `{{1.model}}`
- `{{1.scenario}}`
- `{{1.reportType}}`
- `{{OpenAI route result}}`

Replace a placeholder only with the matching field exposed by the module in that route. The OpenAI result placeholder must come from the OpenAI module in that same route. For example, use `{{2.result}}` only if Module 2 is the correct OpenAI module for that branch.

During testing, customer confirmations must remain disabled or be sent only to a Glenn-owned test inbox.

## Shared Customer Safety Footer

Keep this footer, or equivalent reviewed language, in every customer confirmation:

> Drivable provides informational, confidence-rated guidance based on the information provided. Your request has been received, but it has not been approved, published, inspected, or diagnosed yet. Drivable is not a substitute for an in-person inspection. We do not guarantee a sale, buyer interest, vehicle condition, repair result, or legal/title outcome. Major safety, title, structural, or high-cost decisions may require an in-person inspection and qualified professional help.

## Admin Notifications

### support-concierge-request

**Subject**

```text
[Drivable] {{1.intakeType}} - {{1.name}} - {{1.scenario}}
```

**Body**

```text
A new Drivable concierge request was received.

Intake type: {{1.intakeType}}
Name: {{1.name}}
Email: {{1.email}}
Phone: {{1.phone}}
Scenario: {{1.scenario}}
Report type: {{1.reportType}}
Topic: {{1.topic}}
Urgency: {{1.urgency}}
Message:
{{1.message}}

AI route summary:
{{OpenAI route result}}

Review the original intake and missing evidence before responding. Any customer-facing guidance must use possible-cause, confidence, and next-step language based on the information provided.
```

### marketplace-seller

**Subject**

```text
[Drivable] {{1.intakeType}} - {{1.vehicleYear}} {{1.make}} {{1.model}} - {{1.sellerName}}
```

**Body**

```text
A new Drivable Marketplace seller intake was received.

Intake type: {{1.intakeType}}
Seller: {{1.sellerName}}
Seller email: {{1.sellerEmail}}
Seller phone: {{1.phone}}
Vehicle: {{1.vehicleYear}} {{1.make}} {{1.model}}
Asking price: {{1.askingPrice}}
Title status: {{1.titleStatus}}
Runs and drives: {{1.runsAndDrives}}
Listing type: {{1.listingType}}

Known issues:
{{1.knownIssues}}

Recent repairs:
{{1.recentRepairs}}

AI route summary:
{{OpenAI route result}}

This intake is not an approval or publication decision. Verify ownership, title information, disclosures, and required listing details before proceeding.
```

### diagnosis

**Subject**

```text
[Drivable] {{1.intakeType}} - {{1.vehicleYear}} {{1.make}} {{1.model}} - {{1.name}}
```

**Body**

```text
A new Drivable diagnosis intake was received.

Intake type: {{1.intakeType}}
Customer: {{1.name}}
Email: {{1.email}}
Phone: {{1.phone}}
Vehicle: {{1.vehicleYear}} {{1.make}} {{1.model}}
Scenario: {{1.scenario}}
Report type: {{1.reportType}}

Symptoms or concern:
{{1.message}}

AI route summary:
{{OpenAI route result}}

Confirm that the summary describes possible causes, supporting and missing evidence, confidence, safety/urgency, and next checks. It must not state that a cause or repair is guaranteed. Escalate safety-critical information for prompt human review.
```

### buyer-interest

**Subject**

```text
[Drivable] {{1.intakeType}} - {{1.vehicleYear}} {{1.make}} {{1.model}} - {{1.buyerName}}
```

**Body**

```text
A new buyer-interest request was received.

Intake type: {{1.intakeType}}
Buyer: {{1.buyerName}}
Buyer email: {{1.buyerEmail}}
Buyer phone: {{1.phone}}
Vehicle: {{1.vehicleYear}} {{1.make}} {{1.model}}
Scenario: {{1.scenario}}
Report type: {{1.reportType}}
Listing ID: {{1.listingId}}

Buyer message or questions:
{{1.message}}

AI route summary:
{{OpenAI route result}}

This request does not confirm vehicle availability, seller response, buyer qualification, title status, vehicle condition, inspection access, or transaction outcome.
```

### internal-diagnosis-response

**Subject**

```text
[Drivable Internal Review] {{1.intakeType}} - Case {{1.caseId}}
```

**Body**

```text
An internal diagnosis response is ready for review.

Intake type: {{1.intakeType}}
Case ID: {{1.caseId}}
Customer: {{1.name}}
Customer email: {{1.email}}
Vehicle: {{1.vehicleYear}} {{1.make}} {{1.model}}
Scenario: {{1.scenario}}
Report type: {{1.reportType}}
Confidence: {{1.confidence}}

Recommended response:
{{1.recommendation}}

OpenAI route result:
{{OpenAI route result}}

DO NOT AUTO-SEND. INTERNAL ONLY.

Review safety language, uncertainty, supporting evidence, missing evidence, and recommended next checks before approving any customer-facing response. Remove internal notes from the final customer draft.
```

## Customer Confirmations

### support-concierge-request

**Subject**

```text
Drivable received your help request
```

**Body**

```text
Hi {{1.name}},

We received your Drivable help request.

Selected situation: {{1.scenario}}
Selected report type: {{1.reportType}}

Your request has been submitted for routing and review. It has not been approved, inspected, or diagnosed yet.

Drivable provides informational, confidence-rated guidance based on the information provided. It is not a substitute for an in-person inspection. We do not guarantee a sale, buyer interest, vehicle condition, repair result, or legal/title outcome. Major safety, title, structural, or high-cost decisions may require an in-person inspection and qualified professional help.

Drivable
```

### marketplace-seller

**Subject**

```text
Drivable received your seller intake
```

**Body**

```text
Hi {{1.sellerName}},

We received your seller intake for the {{1.vehicleYear}} {{1.make}} {{1.model}}.

This confirms receipt only. The vehicle and listing have not been approved, published, inspected, certified, or guaranteed. Mechanic's Eye and Drivable do not own or sell the vehicle.

Drivable provides informational guidance based on the information provided and is not a substitute for an in-person inspection. We do not guarantee a sale, buyer interest, vehicle condition, repair result, payment, or legal/title outcome. Sellers remain responsible for disclosures, ownership, title transfer, payment, pickup or shipping, taxes, registration, and state-specific requirements.

Major safety, title, structural, or high-cost decisions may require an in-person inspection and qualified professional or legal help.

Drivable Marketplace
```

### diagnosis

**Subject**

```text
Drivable received your vehicle information
```

**Body**

```text
Hi {{1.name}},

We received the information you submitted about your {{1.vehicleYear}} {{1.make}} {{1.model}}.

Selected situation: {{1.scenario}}
Selected report type: {{1.reportType}}

This confirms receipt only. Your vehicle has not been inspected or diagnosed, and no repair has been approved or guaranteed.

Drivable provides informational, confidence-rated guidance based on the information provided. It is not a substitute for an in-person inspection. We do not guarantee vehicle condition, a diagnosis, repair result, sale, buyer interest, or legal/title outcome.

If the vehicle has braking, steering, overheating, fuel-leak, smoke, severe electrical, wheel/tire separation, or unsafe-drivability symptoms, stop using it and seek qualified in-person help. Major safety, title, structural, or high-cost decisions may require an in-person inspection.

Drivable
```

### buyer-interest

**Subject**

```text
Drivable received your buyer-interest request
```

**Body**

```text
Hi {{1.buyerName}},

We received your interest or questions about the {{1.vehicleYear}} {{1.make}} {{1.model}}.

Selected situation: {{1.scenario}}
Selected report type: {{1.reportType}}

This confirms receipt only. It does not confirm seller response, vehicle availability, title status, vehicle condition, inspection access, financing, or transaction approval.

Drivable provides informational, confidence-rated guidance based on the information provided. It is not a substitute for an in-person inspection. We do not guarantee a sale, buyer interest, vehicle condition, repair result, or legal/title outcome.

Verify ownership and title before paying. Major safety, title, structural, or high-cost decisions may require an independent in-person inspection and qualified professional or legal help.

Drivable Marketplace
```

### internal-diagnosis-response

**DO NOT AUTO-SEND; INTERNAL ONLY**

There is no automatic customer confirmation template for `internal-diagnosis-response`. This route exists for internal review and customer-draft preparation. A human must review and approve any separate customer response before sending.

## Pre-Send Checklist

- Confirm the email belongs to the correct router branch.
- Confirm `{{1.intakeType}}` matches the branch filter.
- Confirm every placeholder maps to a real field or has a safe fallback.
- Confirm `{{OpenAI route result}}` comes from the OpenAI module in the same route.
- Keep internal notes out of customer emails.
- During testing, send only to a Glenn-owned test inbox.
- Confirm customer email does not promise approval, publication, diagnosis, certification, repair success, sale, buyer interest, vehicle condition, or legal/title outcome.
