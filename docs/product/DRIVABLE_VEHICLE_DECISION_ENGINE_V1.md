# Drivable Vehicle Decision Engine V1

## North Star

> Drivable gives everyday people clear, confidence-rated vehicle information so they can decide whether to drive, fix, sell, buy, or walk away.

Diagnosis is the front door. The core value is helping a person understand what the available information may indicate, what remains unknown, and what practical decision paths make sense next.

Drivable does not position AI as a replacement for a mechanic. Outputs must describe possible causes, likely causes, confidence, next checks, and decisions based on the information provided. The system must not claim certainty, guarantee a repair, or tell a user that an in-person mechanic is unnecessary.

## Product Principles

1. Separate observations from conclusions.
2. Present multiple possible causes when the evidence supports multiple explanations.
3. Explain what evidence supports each possible cause.
4. Show missing information that could materially change the result.
5. Express confidence explicitly and conservatively.
6. Put safety and urgency before cost or convenience.
7. Always give the user practical next checks and decision paths.
8. Make limitations clear using plain language.
9. Escalate uncertain, high-risk, or safety-critical cases to qualified in-person help.
10. Keep the user responsible for final driving, repair, purchase, sale, and inspection decisions.

## Product Modules

### Drivable Diagnose

Organizes symptoms, timing, vehicle details, scan codes, maintenance context, and safely collected evidence. It produces confidence-rated possible causes and identifies missing evidence or next checks.

### Drivable Decide

Turns the diagnostic picture into practical choices:

- Get it repaired professionally.
- Fix it yourself.
- Sell or list it as-is.
- Wait, monitor, or do nothing for now.
- Walk away or do not buy when evaluating a purchase.

Each path should explain why it may fit, key risks, what to verify, and what could change the recommendation.

### Drivable Buyer Check

Helps a buyer assess seller claims, observed condition, available evidence, inspection gaps, and purchase risk. It highlights red flags, questions to ask, evidence to request, and conditions that support walking away.

### Drivable Seller Report

Helps a seller organize vehicle condition, known issues, repair history, supporting evidence, and honest disclosures into an as-is listing package. It does not certify or guarantee vehicle condition.

### Drivable Garage

Maintains a user-controlled history of vehicles, symptoms, maintenance, repairs, evidence, reports, and prior decisions. Garage records can improve future context without converting past information into a guarantee of present condition.

## Intake Scenarios

- `current_problem`: The user owns or operates a vehicle with a current symptom or concern.
- `buying_vehicle`: The user is evaluating whether to buy a vehicle.
- `selling_vehicle`: The user is preparing to sell or list a vehicle.
- `ownership_health_check`: The user wants a general condition or maintenance-oriented review.
- `sitting_vehicle`: The vehicle has been parked, stored, or unused and may need recommissioning checks.

## Input Categories

### Symptoms

User descriptions of what the vehicle does, when it happens, how often it happens, and whether it is changing.

### Photos

Dashboard warnings, leaks, smoke residue, fluid condition, tire wear, visible damage, corrosion, wiring, engine-bay observations, and other safely captured visual evidence.

### Video

Cold starts, idle behavior, smoke, visible movement, warning displays, driving symptoms captured safely by a passenger, and other time-based observations.

### Audio

Knocks, ticks, rattles, squeals, grinding, start-up sounds, misfires, exhaust noises, and other sound evidence.

### Vibration

Where vibration is felt, operating conditions, speed or RPM relationship, braking or turning effects, severity, and safely captured motion evidence.

### Scan Codes

OBD-II or manufacturer-specific codes, status, freeze-frame context when available, and whether codes are current, pending, permanent, or previously cleared.

### Maintenance History

Known service dates, mileage, fluids, filters, wear items, scheduled maintenance, and gaps in records.

### Recent Repairs

Parts replaced, work performed, dates, mileage, who performed the work, and whether the concern began before or after the repair.

### Seller Claims

Statements about title, ownership, mileage, condition, repairs, accidents, usage, warning lights, drivability, and known defects. Claims remain unverified until supported by evidence or independent inspection.

### Buyer Questions

Questions about condition, ownership, title, maintenance, inspection access, test drives, price, disclosures, and transaction logistics.

### Vehicle Condition Observations

Exterior, interior, tires, brakes, battery, fluids, warning indicators, leaks, odors, corrosion, start/run behavior, road-test observations, and other non-invasive checks.

## Output Categories

### Possible Causes

A ranked set of plausible explanations based on the information provided. A possible cause is not a confirmed diagnosis.

### Supporting Evidence

The submitted facts, observations, media, codes, or history that increase support for a possible cause.

### Missing Evidence

Information that is absent, unclear, contradictory, or needed before confidence can increase.

### Confidence Rating

- `low`: Limited or conflicting evidence.
- `moderate`: Several facts support the result, but meaningful uncertainty remains.
- `high`: Strong, consistent evidence supports the result, while still requiring appropriate verification.
- `insufficient_information`: The available information cannot support a responsible conclusion.

Confidence applies to the quality of the current inference, not to a guarantee that the cause or outcome is correct.

### Safety/Urgency Rating

- `low`: No immediate safety indicator identified from the information provided.
- `medium`: Timely attention is appropriate; continued use may worsen cost or reliability.
- `high`: Limit driving and seek qualified inspection or repair promptly.
- `critical`: Stop driving or operating the vehicle and arrange safe professional assistance.
- `unknown`: The information provided is insufficient to assess safety.

### Decision Paths

Every applicable report should consider:

1. `professional_repair`: Seek a qualified shop, mobile mechanic, specialist, or inspection.
2. `diy_repair`: Consider a user-performed check or repair only when risk, complexity, tools, and skill requirements are appropriate.
3. `sell_as_is`: Prepare an honest seller report or listing when repair is not the preferred path.
4. `monitor_wait`: Monitor a lower-risk concern with defined warning signs and a follow-up point.
5. `walk_away`: Do not buy, pause the transaction, or leave the situation when evidence, access, disclosures, or risk are unacceptable.

### Mechanic Script

A concise summary the user can give a mechanic, including symptoms, timing, evidence, scan codes, recent repairs, safety concerns, and specific checks to request.

### DIY Caution Level

An assessment of whether a check or repair appears suitable for basic DIY work, requires advanced tools or experience, or should be left to a professional.

### Sell/List Recommendation

Guidance on whether an as-is listing path may be practical, what should be disclosed, what evidence could improve buyer understanding, and what transaction responsibilities remain with the parties.

### Buyer Red Flags

Contradictory claims, missing title or ownership evidence, inaccessible inspections, recently cleared codes, active safety symptoms, suspicious payment requests, material undisclosed damage, or pressure to skip due diligence.

### Next Questions

The smallest useful set of follow-up questions that could improve confidence, expose a safety issue, or change the recommended path.

## Decision Path Presentation

Decision paths should be presented as options with tradeoffs, not commands based on false certainty. Each path may include:

- Why this path may fit.
- Confidence and evidence supporting it.
- Immediate safety considerations.
- Expected next checks.
- Cost, effort, skill, and time considerations when known.
- Conditions that should cause the user to stop or choose another path.
- What remains uncertain.

## Safety Language

All reports and guidance are informational only and based on the information provided. They are not a substitute for in-person inspection, hands-on testing, manufacturer procedures, emergency services, or qualified professional judgment.

### Stop-Driving Triggers

Recommend stopping operation and arranging safe professional assistance when submitted information suggests:

- Brake failure, severe braking loss, or unsafe brake behavior.
- Steering loss, binding, separation, or severe control problems.
- Overheating, active coolant loss, or severe temperature warnings.
- Fuel leaks, strong fuel odor, or suspected fire risk.
- Active smoke or fire from the vehicle.
- Severe electrical overheating, arcing, burning odor, or battery thermal risk.
- Wheel, tire, hub, bearing, suspension, or fastener conditions that suggest separation risk.
- Any condition where the vehicle cannot be driven predictably or safely.

When safety evidence is incomplete, the system should say so. It must not reassure a user that a vehicle is safe merely because a submitted symptom does not prove danger.

## Approved Language Pattern

Use language such as:

- "Possible causes include..."
- "The information provided most strongly supports..."
- "This is a likely cause, not a confirmed diagnosis."
- "Confidence is moderate because..."
- "The next useful checks are..."
- "An in-person inspection is recommended before..."
- "Based on the information provided..."
- "There is not enough information to assess..."

Avoid language such as:

- "This is definitely the problem."
- "This repair is guaranteed to fix it."
- "The vehicle is safe."
- "You do not need a mechanic."
- "There is no risk."

## Report Types

### First Look Report

A concise initial review of submitted information with possible causes, confidence, immediate safety flags, missing evidence, and the next best questions or checks.

### Full Decision Report

A fuller evidence-based report covering possible causes, supporting and missing evidence, confidence, safety/urgency, all applicable decision paths, mechanic script, DIY caution, selling considerations, and next questions.

### Human Review Add-On

An optional qualified human review of the submitted record. Human review may improve context and quality but does not certify condition, guarantee diagnosis, or replace physical inspection.

### Buyer Remote Risk Review

A buyer-focused review of listing information, seller claims, submitted evidence, inspection gaps, red flags, next questions, and walk-away conditions. It is not a pre-purchase inspection.

### Seller As-Is Listing Pack

A structured seller-facing package containing condition notes, known issues, repair history, evidence summary, disclosure prompts, buyer questions to expect, and listing-ready language. It is not a certification or warranty.

## V1 Boundaries

V1 defines product language, content structure, decision paths, safety triggers, scenarios, and report types. It does not:

- Store reports in a database.
- Change webhook behavior.
- Make automated repair approvals or purchase decisions.
- Replace professional inspection.
- Certify vehicles, mechanics, sellers, buyers, titles, payments, or transaction outcomes.
- Add customer-facing UI by itself.

