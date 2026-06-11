# Make Email Module Mapping Shortlist V1

## Testing Rule

During testing, the customer recipient must be a hard-coded Glenn-owned test inbox, not `sellerEmail`, `buyerEmail`, `customer.email`, `customerEmail`, or `email`. Keep the customer module disabled or draft-only when a reliable test inbox is unavailable.

## Practical Mapping Cheat Sheet

| Email element | Safe mapping |
|---|---|
| Admin notification recipient | Hard-coded monitored admin inbox or Glenn-owned test inbox; never incoming customer data |
| Customer confirmation recipient during testing | Hard-coded Glenn-owned test inbox only |
| Subject line fields | `[TEST]`, exact `intakeType`, plus route identifier such as contact name, vehicle, `caseId`, or `listingId` |
| AI result field | Output from the OpenAI module inside the same router branch |
| Route-specific contact fields | Use the route table below |
| Route-specific vehicle fields | Use structured fields below; leave blank when unavailable |
| Safety copy field | Reviewed static safety footer or route-specific reviewed safety text; never unreviewed model output |
| Status field | Controlled route status from the successful destination write or route constant |

## Route Field Shortlist

| Route | Contact fields | Vehicle fields | Useful subject identifier | Status |
|---|---|---|---|---|
| `support-concierge-request` | `customerName`, `customerEmail`, `customerPhone` | None unless separately supplied | `customerName`, `scenario`, or related case/listing ID | `New Support Request` |
| `marketplace-seller` | `sellerName`, `sellerEmail`, `sellerPhone` | `vehicleYear`, `make`, `model`, `trim`, `mileage` | Vehicle plus `sellerName` | `New Seller Intake` |
| `diagnosis` | `customer.name`, `customer.email`, `customer.phone` | `vehicle.year`, `vehicle.make`, `vehicle.model`, `vehicle.trim`, `vehicle.mileage` | Vehicle plus customer name or case ID | Existing diagnosis status; do not overwrite |
| `buyer-interest` | `customer.name`, `customer.email`, `customer.phone` | `vehicle.year`, `vehicle.make`, `vehicle.model`, `vehicle.trim`, `vehicle.mileage` | `listingId` or vehicle | `New Buyer Interest` |
| `internal-diagnosis-response` | `customerName`/`customerEmail` when present; internal reviewer fields stay internal | `vehicle.year`/`vehicleYear`, `vehicle.make`/`make`, `vehicle.model`/`model` | `caseId` | `New Internal Review` |

## Module Check Before Every Test

- Confirm the branch filter and exact `intakeType`.
- Re-open the email module and inspect `To`, `Cc`, and `Bcc`.
- Prefix the subject with `[TEST]`.
- Confirm the AI token comes from the current branch.
- Confirm internal notes are absent from customer copy.
- Confirm reviewed safety copy is present where applicable.
- Confirm a failed sheet write or failed review does not send a success email.
- Confirm the recorded status matches the route result.

## Production Recipient Gate

Do not map a real customer recipient until the route, workbook write, duplicate behavior, admin email, customer template, and error path all pass. Enable one route at a time and verify it immediately with a Glenn-owned address before allowing customer data to control the recipient.
