# Make Roadside Intake Payload V1

## Purpose

Provide copy/paste diagnosis payloads for testing roadside-oriented Drivable guidance in Make. These are test records and must use test-only contact information and destinations.

## Safety Warnings

- Do not collect precise location unless it is operationally needed and the customer has consented.
- Use non-precise `locationContext` text such as road type, general area, parking lot, shoulder, or distance from services.
- Do not tell the user to drive, reproduce a symptom, or create evidence.
- High-risk symptoms require human review or qualified in-person/roadside help.
- These payloads do not establish that a vehicle is safe to drive.
- Keep customer email disabled or redirected only to a Glenn-owned test inbox.

## `roadside_now`

```json
{
  "intakeType": "diagnosis",
  "mode": "roadside",
  "roadsideMode": "roadside_now",
  "scenario": "current_problem",
  "reportType": "roadside_guidance",
  "submittedAt": "2026-06-10T18:00:00.000Z",
  "source": "drivable-roadside",
  "customer": {
    "name": "Roadside Test Customer",
    "email": "roadside-test@example.com",
    "phone": "555-010-2001",
    "preferredContactMethod": "email"
  },
  "contact": {
    "name": "Roadside Test Customer",
    "email": "roadside-test@example.com",
    "phone": "555-010-2001"
  },
  "vehicle": {
    "year": 2015,
    "make": "Toyota",
    "model": "Camry",
    "trim": "SE",
    "mileage": 138000
  },
  "locationContext": "Stopped in a well-lit retail parking lot near a main road; no precise location submitted.",
  "symptoms": [
    "Engine lost power and began shaking",
    "Vehicle is currently stopped and turned off"
  ],
  "warningLights": ["check engine light flashing"],
  "riskSignals": ["flashing warning light", "loss of power", "rough running"],
  "customerGoal": "Understand the safest immediate next step while waiting for help.",
  "message": "The engine started shaking and the check engine light flashed, so I pulled into a parking lot and shut it off.",
  "media": {
    "photoLinks": ["TEST_PHOTO_URL_PLACEHOLDER"],
    "videoLinks": [],
    "audioLinks": [],
    "scanCodeScreenshots": []
  },
  "safetyAcknowledgments": {
    "vehicleStopped": true,
    "willNotDriveForEvidence": true,
    "understandsInPersonHelpMayBeRequired": true,
    "preciseLocationNotProvided": true
  },
  "rawNotes": "Test only. Require conservative stop-and-review language and do not instruct the customer to restart or drive."
}
```

## `can_i_keep_driving`

```json
{
  "intakeType": "diagnosis",
  "mode": "roadside",
  "roadsideMode": "can_i_keep_driving",
  "scenario": "current_problem",
  "reportType": "drivability_risk_review",
  "submittedAt": "2026-06-10T18:05:00.000Z",
  "source": "drivable-roadside",
  "customer": {
    "name": "Drive Risk Test Customer",
    "email": "drive-risk-test@example.com",
    "phone": "555-010-2002"
  },
  "contact": {
    "name": "Drive Risk Test Customer",
    "email": "drive-risk-test@example.com",
    "phone": "555-010-2002"
  },
  "vehicle": {
    "year": 2012,
    "make": "Honda",
    "model": "CR-V",
    "trim": "EX",
    "mileage": 164000
  },
  "locationContext": "Parked at a neighborhood shopping center about several miles from home; no street address provided.",
  "symptoms": ["Temperature gauge rose above normal", "Sweet smell after parking"],
  "warningLights": ["temperature warning"],
  "riskSignals": ["possible overheating", "possible coolant loss"],
  "customerGoal": "Decide whether to keep the vehicle stopped and arrange help.",
  "message": "The temperature rose while driving. I parked and turned the engine off before it reached the red zone.",
  "media": {
    "photoLinks": ["TEST_GAUGE_PHOTO_PLACEHOLDER"],
    "videoLinks": [],
    "audioLinks": [],
    "scanCodeScreenshots": []
  },
  "safetyAcknowledgments": {
    "vehicleStopped": true,
    "willNotOpenHotCoolingSystem": true,
    "willNotDriveForEvidence": true,
    "understandsInPersonHelpMayBeRequired": true
  },
  "rawNotes": "Test only. Do not provide permission to drive. Escalate possible overheating for human or in-person help."
}
```

## `limp_to_safe_place`

```json
{
  "intakeType": "diagnosis",
  "mode": "roadside",
  "roadsideMode": "limp_to_safe_place",
  "scenario": "current_problem",
  "reportType": "immediate_safety_path",
  "submittedAt": "2026-06-10T18:10:00.000Z",
  "source": "drivable-roadside",
  "customer": {
    "name": "Safe Place Test Customer",
    "email": "safe-place-test@example.com",
    "phone": "555-010-2003"
  },
  "contact": {
    "name": "Safe Place Test Customer",
    "email": "safe-place-test@example.com",
    "phone": "555-010-2003"
  },
  "vehicle": {
    "year": 2017,
    "make": "Ford",
    "model": "Escape",
    "trim": "SE",
    "mileage": 101000
  },
  "locationContext": "Stopped on a wide shoulder of a low-speed road with hazard lights on; exact location withheld.",
  "symptoms": ["Tire pressure dropped suddenly", "Vehicle began pulling to the right"],
  "warningLights": ["tire pressure warning"],
  "riskSignals": ["possible tire failure", "vehicle control concern", "roadside exposure"],
  "customerGoal": "Get guidance focused on personal safety and roadside assistance.",
  "message": "I am already stopped on the shoulder. I do not want to move the vehicle unless emergency personnel direct me.",
  "media": {
    "photoLinks": ["TEST_TIRE_PHOTO_PLACEHOLDER"],
    "videoLinks": [],
    "audioLinks": [],
    "scanCodeScreenshots": []
  },
  "safetyAcknowledgments": {
    "vehicleStopped": true,
    "hazardLightsOn": true,
    "willNotDriveForEvidence": true,
    "understandsEmergencyOrRoadsideHelpMayBeRequired": true
  },
  "rawNotes": "Test only. Prioritize occupant and roadside safety. Do not instruct movement of the vehicle."
}
```

## `tow_or_stop_now`

```json
{
  "intakeType": "diagnosis",
  "mode": "roadside",
  "roadsideMode": "tow_or_stop_now",
  "scenario": "current_problem",
  "reportType": "stop_or_tow_review",
  "submittedAt": "2026-06-10T18:15:00.000Z",
  "source": "drivable-roadside",
  "customer": {
    "name": "Tow Test Customer",
    "email": "tow-test@example.com",
    "phone": "555-010-2004"
  },
  "contact": {
    "name": "Tow Test Customer",
    "email": "tow-test@example.com",
    "phone": "555-010-2004"
  },
  "vehicle": {
    "year": 2010,
    "make": "Chevrolet",
    "model": "Malibu",
    "trim": "LT",
    "mileage": 188000
  },
  "locationContext": "Vehicle is parked off the roadway at a public facility; no precise location provided.",
  "symptoms": ["Brake pedal suddenly feels soft", "Longer stopping distance before parking"],
  "warningLights": ["brake warning light"],
  "riskSignals": ["braking concern", "warning light", "reduced stopping performance"],
  "customerGoal": "Determine whether tow or qualified in-person help is the appropriate next step.",
  "message": "The brake pedal felt much softer than normal, so I stopped using the vehicle.",
  "media": {
    "photoLinks": ["TEST_DASH_PHOTO_PLACEHOLDER"],
    "videoLinks": [],
    "audioLinks": [],
    "scanCodeScreenshots": []
  },
  "safetyAcknowledgments": {
    "vehicleStopped": true,
    "willNotDriveForEvidence": true,
    "understandsBrakingSymptomsRequireInPersonHelp": true,
    "customerEmailIsTestOnly": true
  },
  "rawNotes": "Test only. Require stop/tow escalation and human review. Do not suggest a test drive."
}
```

## `temporary_fix`

```json
{
  "intakeType": "diagnosis",
  "mode": "roadside",
  "roadsideMode": "temporary_fix",
  "scenario": "current_problem",
  "reportType": "temporary_action_review",
  "submittedAt": "2026-06-10T18:20:00.000Z",
  "source": "drivable-roadside",
  "customer": {
    "name": "Temporary Fix Test Customer",
    "email": "temporary-fix-test@example.com",
    "phone": "555-010-2005"
  },
  "contact": {
    "name": "Temporary Fix Test Customer",
    "email": "temporary-fix-test@example.com",
    "phone": "555-010-2005"
  },
  "vehicle": {
    "year": 2016,
    "make": "Subaru",
    "model": "Outback",
    "trim": "Premium",
    "mileage": 122000
  },
  "locationContext": "Parked at home in a driveway; no precise address submitted.",
  "symptoms": ["Battery appears discharged", "Interior light was left on"],
  "warningLights": [],
  "riskSignals": ["vehicle will not start", "battery handling risk"],
  "customerGoal": "Understand safe temporary options and what should be checked afterward.",
  "message": "The engine does not crank and the lights are dim. I want safe options without bypassing a proper inspection.",
  "media": {
    "photoLinks": ["TEST_BATTERY_PHOTO_PLACEHOLDER"],
    "videoLinks": [],
    "audioLinks": ["TEST_START_ATTEMPT_AUDIO_PLACEHOLDER"],
    "scanCodeScreenshots": []
  },
  "safetyAcknowledgments": {
    "vehicleParkedSafely": true,
    "willNotDriveForEvidence": true,
    "willFollowBatteryManufacturerSafetyInformation": true,
    "understandsTemporaryActionIsNotACompleteRepair": true
  },
  "rawNotes": "Test only. Any temporary action must include limits, contraindications, and a complete follow-up path."
}
```

## `complete_repair_path`

```json
{
  "intakeType": "diagnosis",
  "mode": "roadside",
  "roadsideMode": "complete_repair_path",
  "scenario": "current_problem",
  "reportType": "complete_repair_path",
  "submittedAt": "2026-06-10T18:25:00.000Z",
  "source": "drivable-roadside",
  "customer": {
    "name": "Repair Path Test Customer",
    "email": "repair-path-test@example.com",
    "phone": "555-010-2006"
  },
  "contact": {
    "name": "Repair Path Test Customer",
    "email": "repair-path-test@example.com",
    "phone": "555-010-2006"
  },
  "vehicle": {
    "year": 2013,
    "make": "Nissan",
    "model": "Altima",
    "trim": "SV",
    "mileage": 151000
  },
  "locationContext": "Vehicle is parked at home after being transported from a repair shop; no precise address provided.",
  "symptoms": ["Intermittent no-start", "Starter clicks once", "Battery tested good according to customer"],
  "warningLights": [],
  "riskSignals": ["intermittent immobilization", "electrical diagnosis needed"],
  "customerGoal": "Plan the evidence, inspection, repair approval, and outcome follow-up steps.",
  "message": "I want a complete path from confirming the cause through repair verification, not only a temporary workaround.",
  "media": {
    "photoLinks": [],
    "videoLinks": ["TEST_NO_START_VIDEO_PLACEHOLDER"],
    "audioLinks": ["TEST_CLICK_AUDIO_PLACEHOLDER"],
    "scanCodeScreenshots": ["TEST_SCAN_SCREENSHOT_PLACEHOLDER"]
  },
  "safetyAcknowledgments": {
    "vehicleParkedSafely": true,
    "willNotDriveForEvidence": true,
    "understandsCauseIsNotConfirmed": true,
    "understandsQualifiedInspectionMayBeRequired": true
  },
  "rawNotes": "Test only. Return possible causes, evidence gaps, confidence, inspection sequence, approval checkpoints, and outcome capture plan."
}
```

## Make Verification

- The `diagnosis` branch fires exactly once for every payload.
- `roadsideMode`, `scenario`, and `reportType` remain available to the route.
- Contact and vehicle fields map from the same payload shape.
- `locationContext` remains non-precise.
- Symptoms, warning lights, risk signals, message, media placeholders, acknowledgments, and raw notes are preserved.
- The same-route AI result uses uncertainty-aware language and does not authorize driving.
- High-risk examples trigger human review or in-person/roadside escalation.
- Raw JSON is stored in the approved secure location.
- Customer email is disabled or goes only to a Glenn-owned test inbox.
