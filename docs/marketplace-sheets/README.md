# Mechanic's Eye Marketplace Seller Leads

Spreadsheet name: `Mechanic’s Eye Marketplace Seller Leads`

Recommended Google Drive folder: `Mechanic's Eye / Drivable / Marketplace`

This folder contains a Google Sheets-ready workbook plus individual CSV files for each tab. The workbook is the easiest import path because it preserves all ten tabs in one upload.

## Files

- `Mechanics_Eye_Marketplace_Seller_Leads.xlsx`
- `Seller_Intake.csv`
- `Listings.csv`
- `Buyer_Interest.csv`
- `Listing_Packages.csv`
- `Payment_Tracking.csv`
- `Review_Workflow.csv`
- `Mechanic_Review.csv`
- `Legal_Acknowledgments.csv`
- `Marketplace_Settings.csv`
- `Status_Options.csv`

## Google Sheets Import Instructions

1. Open Google Drive.
2. Create or open this folder path: `Mechanic's Eye / Drivable / Marketplace`.
3. Click `New`.
4. Click `File upload`.
5. Upload `C:\projects\Mechaniceye_canonical\docs\marketplace-sheets\Mechanics_Eye_Marketplace_Seller_Leads.xlsx`.
6. Open the uploaded spreadsheet.
7. Rename it exactly: `Mechanic’s Eye Marketplace Seller Leads`.
8. Confirm these tabs exist:
   - `Seller_Intake`
   - `Listings`
   - `Buyer_Interest`
   - `Listing_Packages`
   - `Payment_Tracking`
   - `Review_Workflow`
   - `Mechanic_Review`
   - `Legal_Acknowledgments`
   - `Marketplace_Settings`
   - `Status_Options`
9. On each tab, confirm row 1 is frozen. If it is not frozen after import, click `View > Freeze > 1 row`.
10. Leave the seller, listing, buyer, payment, review, mechanic review, and legal tabs empty except for their header rows.

## CSV Fallback Import Instructions

Use this only if the `.xlsx` upload does not preserve tabs correctly.

1. Create a blank Google Sheet named `Mechanic’s Eye Marketplace Seller Leads`.
2. Rename the first tab to `Seller_Intake`.
3. Import `Seller_Intake.csv` into the current sheet.
4. For each remaining CSV file, create a new tab with the same name as the CSV file without `.csv`.
5. Import each CSV into its matching tab.
6. Freeze row 1 on every tab with `View > Freeze > 1 row`.

## Make Webhook Mapping For Seller_Intake

Webhook destination tab: `Seller_Intake`

Recommended Make action: Google Sheets `Add a Row`

Expected incoming webhook shape:

```json
{
  "type": "mechanics_eye_marketplace_seller_intake",
  "receivedAt": "2026-05-30T00:00:00.000Z",
  "source": "marketplace-seller-intake",
  "intake": {
    "sellerName": "",
    "sellerEmail": "",
    "sellerPhone": "",
    "bestContactMethod": "",
    "city": "",
    "state": "",
    "zip": "",
    "vehicleYear": "",
    "make": "",
    "model": "",
    "trim": "",
    "vin": "",
    "mileage": "",
    "askingPrice": "",
    "exteriorColor": "",
    "transmission": "",
    "fuelType": "",
    "titleStatus": "",
    "lienStatus": "",
    "runsAndDrives": "",
    "hasKeys": "",
    "knownIssues": "",
    "recentRepairs": "",
    "listingType": "",
    "sellerNotes": "",
    "acknowledgments": {
      "ownerAuthorized": true,
      "platformOnly": true,
      "sellerResponsibilities": true,
      "noGuarantee": true
    }
  }
}
```

Use these mappings in the Make `Add a Row` step:

| Seller_Intake column | Make value |
| --- | --- |
| IntakeID | `MEI-{{formatDate(now; "YYYYMMDD-HHmmss")}}` |
| SubmittedAt | `{{1.receivedAt}}` |
| Source | `{{1.source}}` |
| SubmissionStatus | `New` |
| SellerName | `{{1.intake.sellerName}}` |
| SellerEmail | `{{1.intake.sellerEmail}}` |
| SellerPhone | `{{1.intake.sellerPhone}}` |
| BestContactMethod | `{{1.intake.bestContactMethod}}` |
| City | `{{1.intake.city}}` |
| State | `{{1.intake.state}}` |
| ZIP | `{{1.intake.zip}}` |
| VehicleYear | `{{1.intake.vehicleYear}}` |
| Make | `{{1.intake.make}}` |
| Model | `{{1.intake.model}}` |
| Trim | `{{1.intake.trim}}` |
| VIN | `{{1.intake.vin}}` |
| Mileage | `{{1.intake.mileage}}` |
| AskingPrice | `{{1.intake.askingPrice}}` |
| MinimumAcceptablePrice | leave blank |
| ExteriorColor | `{{1.intake.exteriorColor}}` |
| InteriorColor | leave blank |
| Transmission | `{{1.intake.transmission}}` |
| FuelType | `{{1.intake.fuelType}}` |
| DriveType | leave blank |
| Engine | leave blank |
| TitleStatus | `{{1.intake.titleStatus}}` |
| LienStatus | `{{1.intake.lienStatus}}` |
| RegisteredOwnerName | leave blank |
| OwnerAuthorizedToList | `{{1.intake.acknowledgments.ownerAuthorized}}` |
| RunsAndDrives | `{{1.intake.runsAndDrives}}` |
| Starts | leave blank |
| CanBeTestDriven | `{{1.intake.buyerTestDriveAllowed}}` |
| BuyerCanBringMechanic | `{{1.intake.buyerMechanicAllowed}}` |
| HasKeys | `{{1.intake.hasKeys}}` |
| OdometerAccurate | leave blank |
| KnownIssues | `{{1.intake.knownIssues}}` |
| RecentRepairs | `{{1.intake.recentRepairs}}` |
| WarningLights | leave blank |
| AccidentHistoryKnown | leave blank |
| FloodOrSalvageHistoryKnown | leave blank |
| SmogOrEmissionsStatus | leave blank |
| TireCondition | leave blank |
| BrakeCondition | leave blank |
| BatteryCondition | leave blank |
| InteriorCondition | leave blank |
| ExteriorCondition | leave blank |
| PhotoLinks | leave blank until uploads are wired |
| VideoLinks | leave blank until uploads are wired |
| SoundLinks | leave blank until uploads are wired |
| DiagnosticEvidenceLinks | leave blank until evidence package links are wired |
| ListingType | `{{1.intake.listingType}}` |
| RequestedPackage | leave blank |
| InterestedInPricingHelp | leave blank |
| InterestedInMechanicReview | leave blank |
| InterestedInInspectionReferral | leave blank |
| InterestedInPaperworkGuidance | leave blank |
| InterestedInFeaturedListing | leave blank |
| WeekendOfferEventInterest | map `Yes` when `{{1.intake.listingType}}` equals `Weekend Offer Event`, otherwise blank |
| SellerNotes | `{{1.intake.sellerNotes}}` |
| AckOwnerOrAuthorized | `{{1.intake.acknowledgments.ownerAuthorized}}` |
| AckPlatformOnly | `{{1.intake.acknowledgments.platformOnly}}` |
| AckSellerResponsibleForTransaction | `{{1.intake.acknowledgments.sellerResponsibilities}}` |
| AckNoGuaranteeBuyerPayment | `{{1.intake.acknowledgments.noGuarantee}}` |
| AckNoGuaranteeVehicleCondition | `{{1.intake.acknowledgments.noGuarantee}}` |
| AckStateLawResponsibility | leave blank until this checkbox is added |
| IPAddress | map from webhook request metadata if available |
| UserAgent | map from webhook request headers if available |
| InternalNotes | leave blank |
| AssignedTo | leave blank |
| NextAction | `Review seller intake` |
| FollowUpStatus | `New` |
| FollowUpDate | leave blank |
| CreatedListingID | leave blank |

## Recommended Next Step

Build or confirm `POST /api/marketplace/seller-intake`, then set its forwarding webhook to the Make webhook URL with the backend environment variable:

`MARKETPLACE_SELLER_INTAKE_WEBHOOK_URL`
