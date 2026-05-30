import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = path.resolve("docs/marketplace-sheets");
const workbookPath = path.join(outputDir, "Mechanics_Eye_Marketplace_Seller_Leads.xlsx");

const sheets = [
  {
    name: "Seller_Intake",
    purpose: "Raw seller intake submissions from /marketplace/sell/intake.",
    headers: [
      "IntakeID", "SubmittedAt", "Source", "SubmissionStatus", "SellerName", "SellerEmail", "SellerPhone",
      "BestContactMethod", "City", "State", "ZIP", "VehicleYear", "Make", "Model", "Trim", "VIN",
      "Mileage", "AskingPrice", "MinimumAcceptablePrice", "ExteriorColor", "InteriorColor", "Transmission",
      "FuelType", "DriveType", "Engine", "TitleStatus", "LienStatus", "RegisteredOwnerName",
      "OwnerAuthorizedToList", "RunsAndDrives", "Starts", "CanBeTestDriven", "BuyerCanBringMechanic",
      "HasKeys", "OdometerAccurate", "KnownIssues", "RecentRepairs", "WarningLights",
      "AccidentHistoryKnown", "FloodOrSalvageHistoryKnown", "SmogOrEmissionsStatus", "TireCondition",
      "BrakeCondition", "BatteryCondition", "InteriorCondition", "ExteriorCondition", "PhotoLinks",
      "VideoLinks", "SoundLinks", "DiagnosticEvidenceLinks", "ListingType", "RequestedPackage",
      "InterestedInPricingHelp", "InterestedInMechanicReview", "InterestedInInspectionReferral",
      "InterestedInPaperworkGuidance", "InterestedInFeaturedListing", "WeekendOfferEventInterest",
      "SellerNotes", "AckOwnerOrAuthorized", "AckPlatformOnly", "AckSellerResponsibleForTransaction",
      "AckNoGuaranteeBuyerPayment", "AckNoGuaranteeVehicleCondition", "AckStateLawResponsibility",
      "IPAddress", "UserAgent", "InternalNotes", "AssignedTo", "NextAction", "FollowUpStatus",
      "FollowUpDate", "CreatedListingID"
    ],
    rows: []
  },
  {
    name: "Listings",
    purpose: "Approved marketplace listings shown publicly later.",
    headers: [
      "ListingID", "CreatedFromIntakeID", "ListingStatus", "PublicURL", "CreatedAt", "PublishedAt",
      "UpdatedAt", "ExpiresAt", "SellerName", "SellerEmail", "SellerPhone", "City", "State", "ZIP",
      "VehicleYear", "Make", "Model", "Trim", "VIN_Last6", "Mileage", "AskingPrice", "PriceType",
      "TitleStatus", "RunsAndDrives", "ListingHeadline", "ShortDescription", "SellerDescription",
      "KnownIssuesPublic", "RecentRepairsPublic", "MechanicEyeEvidenceSummary", "EvidenceScore",
      "EvidenceBadge", "PhotoGalleryLinks", "VideoLinks", "DiagnosticReportLink", "BuyerChecklistLink",
      "ListingPackage", "FeaturedListing", "FeaturedUntil", "WeekendOfferEventID", "ViewCount",
      "LeadCount", "BuyerInterestCount", "AdminNotes", "RemovalReason"
    ],
    rows: []
  },
  {
    name: "Buyer_Interest",
    purpose: "Future buyer contact/offer/intake records.",
    headers: [
      "BuyerInterestID", "SubmittedAt", "ListingID", "BuyerName", "BuyerEmail", "BuyerPhone",
      "BestContactMethod", "BuyerCity", "BuyerState", "InterestType", "MessageToSeller", "OfferAmount",
      "FinancingNeeded", "TradeOffer", "WantsTestDrive", "WantsMechanicInspection", "WantsMorePhotos",
      "WantsVideo", "WantsVehicleHistory", "BuyerAcknowledgedPlatformOnly", "BuyerAcknowledgedDueDiligence",
      "BuyerAcknowledgedNoGuarantee", "ForwardedToSeller", "ForwardedAt", "SellerResponseStatus",
      "InternalNotes", "SpamOrAbuseFlag"
    ],
    rows: []
  },
  {
    name: "Listing_Packages",
    purpose: "Define seller-facing marketplace products/packages.",
    headers: [
      "PackageID", "PackageName", "PackageStatus", "Price", "BillingType", "DurationDays",
      "IncludesBasicListing", "IncludesFeaturedPlacement", "IncludesPricingHelp", "IncludesMechanicReview",
      "IncludesInspectionReferral", "IncludesPaperworkChecklist", "IncludesWeekendOfferEvent",
      "IncludesDiagnosticEvidencePackage", "MaxPhotos", "MaxVideos", "Description", "PublicSalesCopy",
      "InternalNotes", "PaymentLink", "CreatedAt", "UpdatedAt"
    ],
    rows: [
      ["PKG_BASIC", "Basic Listing", "Active", "TBD", "Flat", "30", "Yes", "No", "No", "No", "No", "Yes", "No", "No", "TBD", "TBD", "", "", "", "", "", ""],
      ["PKG_FEATURED", "Featured Listing", "Active", "TBD", "Flat", "30", "Yes", "Yes", "No", "No", "No", "Yes", "No", "No", "TBD", "TBD", "", "", "", "", "", ""],
      ["PKG_MECHANIC_REVIEWED", "Mechanic-Reviewed Listing", "Active", "TBD", "Flat", "30", "Yes", "Optional", "Yes", "Yes", "Optional", "Yes", "Optional", "Yes", "TBD", "TBD", "", "", "", "", "", ""],
      ["PKG_WEEKEND_EVENT", "Weekend Offer Event Entry", "Active", "TBD", "Flat", "7", "Yes", "Optional", "Optional", "Optional", "Optional", "Yes", "Yes", "Optional", "TBD", "TBD", "", "", "", "", "", ""]
    ]
  },
  {
    name: "Payment_Tracking",
    purpose: "Track listing payments without building full payment automation yet.",
    headers: [
      "PaymentRecordID", "CreatedAt", "RelatedIntakeID", "RelatedListingID", "SellerEmail", "PackageID",
      "PackageName", "AmountDue", "AmountPaid", "PaymentStatus", "PaymentProvider", "PaymentLink",
      "StripePaymentIntentID", "StripeCheckoutSessionID", "PaidAt", "RefundStatus", "RefundReason", "InternalNotes"
    ],
    rows: []
  },
  {
    name: "Review_Workflow",
    purpose: "Admin workflow for converting seller intake to public listing.",
    headers: [
      "WorkflowID", "IntakeID", "ListingID", "CurrentStage", "Priority", "AssignedTo", "NeedsSellerFollowUp",
      "MissingInfo", "MissingPhotos", "MissingVIN", "MissingTitleInfo", "NeedsPayment", "NeedsMechanicReview",
      "NeedsLegalReview", "ApprovedForPublishing", "RejectedReason", "NextAction", "LastContactedAt",
      "FollowUpDueAt", "CompletedAt", "InternalNotes"
    ],
    rows: []
  },
  {
    name: "Mechanic_Review",
    purpose: "Future mechanic-reviewed listing/evidence package tracking.",
    headers: [
      "MechanicReviewID", "IntakeID", "ListingID", "RequestedAt", "ReviewStatus", "ReviewerName",
      "VehicleYear", "Make", "Model", "Trim", "SubmittedSymptoms", "SubmittedMediaLinks",
      "KnownIssuesReviewed", "LikelyConditionSummary", "SafetyConcerns", "SuggestedBuyerQuestions",
      "SuggestedSellerDisclosures", "RecommendedInspectionAreas", "EvidenceScore", "EvidenceBadge",
      "DiagnosticReportLink", "ReviewCompletedAt", "InternalNotes"
    ],
    rows: []
  },
  {
    name: "Legal_Acknowledgments",
    purpose: "Record seller/buyer legal acknowledgments separately for cleaner audit trail.",
    headers: [
      "AcknowledgmentID", "SubmittedAt", "RelatedIntakeID", "RelatedListingID", "RelatedBuyerInterestID",
      "UserType", "Name", "Email", "IPAddress", "UserAgent", "AckPlatformOnly",
      "AckNotDealerBrokerAuctioneer", "AckNoVehicleGuarantee", "AckNoPaymentGuarantee",
      "AckBuyerSellerResponsible", "AckStateLawResponsibility", "AckNoLegalAdvice",
      "AckIndependentInspectionRecommended", "AcknowledgmentTextVersion", "InternalNotes"
    ],
    rows: []
  },
  {
    name: "Marketplace_Settings",
    purpose: "Config values that Make/app/admin can reference later.",
    headers: ["SettingKey", "SettingValue", "Description", "UpdatedAt", "UpdatedBy"],
    rows: [
      ["marketplace_status", "active", "Controls whether marketplace intake is open.", "", ""],
      ["seller_intake_webhook_version", "v1", "Version of current seller intake webhook payload.", "", ""],
      ["legal_acknowledgment_version", "v1", "Version of legal acknowledgment language.", "", ""],
      ["default_listing_duration_days", "30", "Default public listing duration.", "", ""],
      ["weekend_offer_event_label", "Weekend Offer Event", "Approved public wording. Do not use prohibited event wording.", "", ""]
    ]
  },
  {
    name: "Status_Options",
    purpose: "Dropdown/status reference values.",
    headers: ["Category", "Value", "Description"],
    rows: [
      ["SubmissionStatus", "New", "New raw seller intake"],
      ["SubmissionStatus", "Needs Follow-Up", "Missing information"],
      ["SubmissionStatus", "Ready For Review", "Intake complete"],
      ["SubmissionStatus", "Converted To Listing", "Public listing created"],
      ["SubmissionStatus", "Rejected", "Not accepted or invalid"],
      ["SubmissionStatus", "Duplicate", "Duplicate submission"],
      ["ListingStatus", "Draft", "Not public yet"],
      ["ListingStatus", "Pending Payment", "Waiting on seller payment"],
      ["ListingStatus", "Pending Review", "Waiting internal review"],
      ["ListingStatus", "Active", "Public listing live"],
      ["ListingStatus", "Paused", "Temporarily hidden"],
      ["ListingStatus", "Expired", "Listing duration ended"],
      ["ListingStatus", "Removed", "Removed by admin or seller"],
      ["ListingStatus", "Sold/Closed", "Seller says vehicle is no longer available"],
      ["PaymentStatus", "Not Started", "No payment started"],
      ["PaymentStatus", "Pending", "Payment pending"],
      ["PaymentStatus", "Paid", "Payment completed"],
      ["PaymentStatus", "Failed", "Payment failed"],
      ["PaymentStatus", "Refunded", "Payment refunded"],
      ["PaymentStatus", "Waived", "Admin waived fee"],
      ["ReviewStatus", "Not Requested", "No mechanic review requested"],
      ["ReviewStatus", "Requested", "Seller requested review"],
      ["ReviewStatus", "In Review", "Review underway"],
      ["ReviewStatus", "Complete", "Review complete"],
      ["ReviewStatus", "Needs More Info", "More seller info required"]
    ]
  }
];

function columnName(index) {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function writeCsvFiles() {
  for (const sheet of sheets) {
    const rows = [sheet.headers, ...sheet.rows];
    const csv = `${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`;
    await fs.writeFile(path.join(outputDir, `${sheet.name}.csv`), csv, "utf8");
  }
}

async function writeWorkbook() {
  const workbook = Workbook.create();

  for (const spec of sheets) {
    const sheet = workbook.worksheets.add(spec.name);
    const colCount = spec.headers.length;
    const rowCount = Math.max(2, spec.rows.length + 1);
    const lastCol = columnName(colCount - 1);
    const rows = [spec.headers, ...spec.rows];

    sheet.showGridLines = false;
    sheet.freezePanes.freezeRows(1);
    sheet.getRangeByIndexes(0, 0, rows.length, colCount).values = rows;

    const headerRange = sheet.getRange(`A1:${lastCol}1`);
    headerRange.format.fill.color = "#10243f";
    headerRange.format.font.color = "#ffffff";
    headerRange.format.font.bold = true;
    headerRange.format.wrapText = true;
    headerRange.format.rowHeightPx = 42;

    const usedRange = sheet.getRange(`A1:${lastCol}${rowCount}`);
    usedRange.format.font.name = "Arial";
    usedRange.format.font.size = 10;
    usedRange.format.wrapText = true;

    for (let i = 0; i < colCount; i += 1) {
      const width = Math.min(Math.max(spec.headers[i].length * 8, 110), 230);
      sheet.getRange(`${columnName(i)}:${columnName(i)}`).format.columnWidthPx = width;
    }
  }

  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(workbookPath);

  const inspect = await workbook.inspect({
    kind: "sheet",
    include: "name",
    range: "Seller_Intake!A1:E2"
  });
  console.log(inspect.ndjson);
}

await fs.mkdir(outputDir, { recursive: true });
await writeCsvFiles();
await writeWorkbook();
console.log(`Wrote ${workbookPath}`);
