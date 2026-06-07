# Drivable Master Operations Workbook Schema V1

This document defines the exact V1 worksheet names and Row 1 headers used by Drivable by Mechanic's Eye automation. Make scenarios should map to these names without renaming workbook tabs or headers.

## Workbook Rules

- Keep every header on Row 1.
- Do not merge cells.
- Do not manually rename headers after Make mappings are configured.
- Store timestamps in ISO 8601 format where possible.
- Keep secrets, webhook URLs, credentials, and raw private tokens out of this workbook.
- Treat admin-only and system-only tabs as internal operational records.

## Seller_Intake

**Purpose:** Captures ClearSale seller listing requests for admin review and listing preparation.

**Exact header row:** `Submitted At` | `Intake Type` | `Source` | `App Brand` | `Marketplace Brand` | `Seller Name` | `Seller Email` | `Seller Phone` | `Vehicle Year` | `Make` | `Model` | `Trim` | `Mileage` | `VIN` | `Title Status` | `Asking Price` | `Location` | `Condition Summary` | `Known Issues` | `Drivable Status` | `Listing Goal` | `Photos Available` | `Acknowledgments` | `Status` | `Admin Notes`

**Default/status values:** `New Seller Intake`, `Needs Review`, `Approved For Draft Listing`, `Rejected`

**intakeType:** `marketplace-seller`

**Make route/scenario:** Marketplace Seller Intake

**Visibility:** Admin-only; sourced from a customer-facing form

## Listings

**Purpose:** Stores admin-managed listing records prepared from approved seller intakes.

**Exact header row:** `Listing ID` | `Created At` | `Updated At` | `Status` | `Seller Intake ID` | `Seller Name` | `Seller Email` | `Vehicle Year` | `Make` | `Model` | `Trim` | `Mileage` | `VIN` | `Asking Price` | `Location` | `Title Status` | `Drivable Status` | `Condition Summary` | `Known Issues` | `Listing Summary` | `Photos URLs` | `Featured` | `Package` | `Published At` | `Admin Notes`

**Default/status values:** `DRAFT`, `REVIEW`, `PUBLISHED`, `PAUSED`, `SOLD/REMOVED`

**intakeType:** `Derived from marketplace-seller`

**Make route/scenario:** Listing Draft and Publishing Workflow

**Visibility:** Admin-managed; selected fields may become customer-facing

## Buyer_Interest

**Purpose:** Captures buyer interest submitted against a marketplace listing.

**Exact header row:** `Submitted At` | `Intake Type` | `Source` | `Listing ID` | `Vehicle Label` | `Buyer Name` | `Buyer Email` | `Buyer Phone` | `Preferred Contact Method` | `Buyer Message` | `Financing Needed` | `Trade In` | `Urgency` | `Acknowledgments` | `Status` | `Admin Notes`

**Default/status values:** `New Buyer Interest`

**intakeType:** `marketplace-buyer-interest`

**Make route/scenario:** Marketplace Buyer Interest

**Visibility:** Admin-only; sourced from a customer-facing form

## Listing_Packages

**Purpose:** Defines launch and later ClearSale listing package options used by operations.

**Exact header row:** `Package Name` | `Launch Price` | `Later Price` | `Included Listings` | `Featured` | `Review Level` | `Notes` | `Active`

**Default/status values:** `Active TRUE or FALSE`

**intakeType:** `None; reference data`

**Make route/scenario:** Listing Package Selection and Admin Reference

**Visibility:** Admin-only reference data

## Payment_Tracking

**Purpose:** Tracks expected and recorded payments without processing payments in the workbook.

**Exact header row:** `Submitted At` | `Related Customer Email` | `Related Listing ID` | `Related Case ID` | `Product` | `Package` | `Amount Expected` | `Amount Paid` | `Payment Status` | `Payment Reference` | `Admin Notes`

**Default/status values:** `Pending`, `Paid`, `Failed`, `Refunded`, `Not Required`

**intakeType:** `marketplace-package-selected`, `admin-action`

**Make route/scenario:** Payment Status Logging

**Visibility:** Admin-only

## Review_Workflow

**Purpose:** Tracks internal review steps for cases and marketplace listings.

**Exact header row:** `Submitted At` | `Review Type` | `Related Listing ID` | `Related Case ID` | `Assigned To` | `Current Step` | `Status` | `Admin Notes`

**Default/status values:** `New`, `In Review`, `Waiting For Information`, `Complete`

**intakeType:** `Derived from review-required intake routes`

**Make route/scenario:** Review Queue Workflow

**Visibility:** Admin-only

## Mechanic_Review

**Purpose:** Stores structured mechanic or diagnostic authority review notes.

**Exact header row:** `Submitted At` | `Related Case ID` | `Related Listing ID` | `Reviewer Name` | `Reviewer Email` | `Vehicle Year` | `Make` | `Model` | `Review Summary` | `Concerns` | `Recommendation` | `Status` | `Admin Notes`

**Default/status values:** `New`, `In Review`, `Complete`, `Declined`

**intakeType:** `internal-diagnosis-response`, `admin-action`

**Make route/scenario:** Mechanic's Eye Review Workflow

**Visibility:** Admin-only; approved summaries may support customer communication

## Legal_Acknowledgments

**Purpose:** Records acceptance of platform acknowledgments tied to an intake, case, or listing.

**Exact header row:** `Submitted At` | `Related Intake Type` | `Related Case ID` | `Related Listing ID` | `Customer Email` | `Acknowledgment Type` | `Acknowledgment Text` | `Accepted` | `IP Address Safe Hash` | `Admin Notes`

**Default/status values:** `Accepted TRUE or FALSE`

**intakeType:** `All customer intake types with acknowledgments`

**Make route/scenario:** Legal Acknowledgment Logging

**Visibility:** Admin-only audit record

## Marketplace_Settings

**Purpose:** Stores Make-safe operational settings for marketplace workflows.

**Exact header row:** `Setting Key` | `Setting Value` | `Description` | `Active` | `Updated At` | `Admin Notes`

**Default/status values:** `Active TRUE or FALSE`

**intakeType:** `None; reference data`

**Make route/scenario:** Marketplace Settings Lookup

**Visibility:** Admin-only reference data

## Status_Options

**Purpose:** Provides controlled status values for Make routes and admin workflows.

**Exact header row:** `Status Type` | `Status Value` | `Description` | `Active`

**Default/status values:** `Active TRUE or FALSE`

**intakeType:** `None; reference data`

**Make route/scenario:** Status Validation and Admin Reference

**Visibility:** Admin-only reference data

## Mechanic_Match_Requests

**Purpose:** Captures customer requests for the right type of mechanic, shop, mobile provider, specialist, or inspector.

**Exact header row:** `Submitted At` | `Intake Type` | `Source` | `Customer Name` | `Customer Email` | `Customer Phone` | `City` | `State` | `ZIP` | `Vehicle Year` | `Make` | `Model` | `Mileage` | `Problem Category` | `Symptoms` | `Can Drive` | `Preferred Help Type` | `Urgency` | `Budget Range` | `Photos Or Video Available` | `Existing Diagnosis Case ID` | `Drivable Check Used` | `Permission To Share Case` | `Acknowledgments` | `Status` | `Admin Notes`

**Default/status values:** `New Match Request`, `Needs Review`, `Provider Search`, `Closed`

**intakeType:** `mechanic-match-request`

**Make route/scenario:** Mechanic Match Request Intake

**Visibility:** Admin-only; sourced from a customer-facing form

## Mechanic_Match_Providers

**Purpose:** Stores provider claim or onboarding data for internal matching operations.

**Exact header row:** `Submitted At` | `Intake Type` | `Source` | `Provider Name` | `Provider Email` | `Provider Phone` | `Business Name` | `City` | `State` | `ZIP` | `Service Area` | `Services Offered` | `Mobile Service` | `Shop Service` | `Diagnostic Capability` | `Availability` | `Status` | `Admin Notes`

**Default/status values:** `New Claim`, `Needs Verification`, `Active`, `Inactive`, `Declined`

**intakeType:** `mechanic-provider-claim`

**Make route/scenario:** Mechanic Provider Claim and Review

**Visibility:** Admin-only provider record

## Mechanic_Outreach_Log

**Purpose:** Logs provider outreach and follow-up activity.

**Exact header row:** `Submitted At` | `Provider Name` | `Business Name` | `Contact Method` | `Contact Detail` | `City` | `State` | `Outreach Status` | `Follow Up Date` | `Notes` | `Admin Notes`

**Default/status values:** `Planned`, `Contacted`, `Interested`, `Follow Up`, `Not Interested`, `Closed`

**intakeType:** `provider-outreach-log`

**Make route/scenario:** Provider Outreach Logging

**Visibility:** Admin-only

## Support_Concierge

**Purpose:** Captures AI-assisted Drivable Guide requests and escalation preferences.

**Exact header row:** `Submitted At` | `Intake Type` | `Source` | `Guide Requested` | `Help Topic` | `Customer Name` | `Customer Email` | `Customer Phone` | `Related Case ID` | `Related Listing ID` | `Current Page` | `Urgency` | `Preferred Contact Method` | `Message` | `Stuck Step` | `Wants Human Review` | `Acknowledgments` | `Status` | `Admin Notes`

**Default/status values:** `New Support Request`, `Needs Human Review`, `Resolved`

**intakeType:** `support-concierge-request`

**Make route/scenario:** Drivable Concierge Support Intake

**Visibility:** Admin-only; sourced from a customer-facing form

## Guide_Requests

**Purpose:** Captures requests for marketplace, title, safety, or process guidance.

**Exact header row:** `Submitted At` | `Intake Type` | `Source` | `Guide Type` | `Customer Name` | `Customer Email` | `Related Flow` | `Related Listing ID` | `Related Case ID` | `Question` | `Status` | `Admin Notes`

**Default/status values:** `New`, `Drafting Guidance`, `Needs Official Source`, `Complete`

**intakeType:** `marketplace-guide-request`

**Make route/scenario:** Marketplace Guide Request

**Visibility:** Admin-only; sourced from a customer-facing form

## Help_FAQ_Feedback

**Purpose:** Collects feedback on whether self-help FAQ content resolved a user's question.

**Exact header row:** `Submitted At` | `Customer Email` | `Page` | `FAQ Topic` | `Was Helpful` | `Feedback` | `Status` | `Admin Notes`

**Default/status values:** `New`, `Reviewed`, `Content Update Needed`, `Closed`

**intakeType:** `Derived from support feedback`

**Make route/scenario:** Help FAQ Feedback

**Visibility:** Admin-only; sourced from customer feedback

## Internal_Review_Log

**Purpose:** Stores internal diagnosis response drafts and review decisions before customer delivery.

**Exact header row:** `Submitted At` | `Intake Type` | `Source` | `Case ID` | `Customer Name` | `Customer Email` | `Vehicle Year` | `Make` | `Model` | `Diagnosis Summary` | `Recommended Response` | `Confidence Level` | `Needs Human Review` | `Draft Created` | `Status` | `Admin Notes`

**Default/status values:** `New Internal Review`, `Draft Created`, `Needs Human Review`, `Approved`, `Closed`

**intakeType:** `internal-diagnosis-response`

**Make route/scenario:** Internal Review Desk to Gmail Draft

**Visibility:** Admin-only

## Admin_Actions

**Purpose:** Creates an append-only record of sensitive admin actions and audit-chain metadata.

**Exact header row:** `Submitted At` | `Intake Type` | `Source` | `Audit Event ID` | `Audit Hash` | `Previous Audit Hash` | `Admin Name` | `Admin Email` | `Action Type` | `Related Case ID` | `Related Listing ID` | `Related Customer Email` | `Amount` | `Reason` | `Notes` | `Requested Follow Up` | `Draft Only` | `Status`

**Default/status values:** `Logged`, `Needs Follow Up`, `Complete`

**intakeType:** `admin-action`

**Make route/scenario:** Admin Action Audit Log

**Visibility:** Admin-only

## Customer_Credits

**Purpose:** Tracks approved customer credits without creating a payment system.

**Exact header row:** `Submitted At` | `Related Customer Email` | `Related Case ID` | `Related Listing ID` | `Credit Type` | `Credit Amount` | `Reason` | `Approved By` | `Status` | `Admin Notes`

**Default/status values:** `Pending`, `Approved`, `Applied`, `Cancelled`

**intakeType:** `admin-action`

**Make route/scenario:** Customer Credit Logging

**Visibility:** Admin-only

## Refund_Log

**Purpose:** Logs refund decisions and external payment references without processing refunds.

**Exact header row:** `Submitted At` | `Related Customer Email` | `Related Case ID` | `Related Listing ID` | `Payment Reference` | `Refund Amount` | `Refund Reason` | `Refund Status` | `Logged By` | `Admin Notes`

**Default/status values:** `Requested`, `Approved`, `Processed Externally`, `Declined`

**intakeType:** `admin-action`

**Make route/scenario:** Refund Decision Logging

**Visibility:** Admin-only

## Activity_Log

**Purpose:** Provides a concise cross-flow activity trail for operations monitoring.

**Exact header row:** `Submitted At` | `Activity Type` | `Related Intake Type` | `Related Case ID` | `Related Listing ID` | `Customer Email` | `Summary` | `Status` | `Admin Notes`

**Default/status values:** `Logged`, `Warning`, `Failed`

**intakeType:** `All routed intake types; generated by Make`

**Make route/scenario:** Shared Activity Logging

**Visibility:** Admin-only

## Security_Events

**Purpose:** Stores safe, non-secret security and abuse event summaries for admin review.

**Exact header row:** `Submitted At` | `Intake Type` | `Source` | `Event Type` | `Severity` | `Related Route` | `Related Intake Type` | `Message` | `Raw Status Code` | `Safe Details` | `Recommended Action` | `Status` | `Admin Notes`

**Default/status values:** `New Security Event`, `Investigating`, `Resolved`, `False Positive`

**intakeType:** `security-event`

**Make route/scenario:** Security Event Intake and Alerting

**Visibility:** System-only and admin-only

## Watchtower_Health_Checks

**Purpose:** Records scheduled route and automation health checks.

**Exact header row:** `Checked At` | `Intake Type` | `Source` | `Check Type` | `Route Or Service` | `Status` | `Response Code` | `Message` | `Recommended Action` | `Admin Notes`

**Default/status values:** `Healthy`, `Warning`, `Failed`

**intakeType:** `watchtower-health-check`

**Make route/scenario:** Watchtower Health Monitoring

**Visibility:** System-only and admin-only

## Webhook_Failures

**Purpose:** Records safe webhook failure details and retry recommendations without exposing secrets.

**Exact header row:** `Submitted At` | `Intake Type` | `Source` | `Failed Intake Type` | `Related Route` | `Status Code` | `Safe Error` | `Retry Recommended` | `Status` | `Admin Notes`

**Default/status values:** `New`, `Retry Recommended`, `Resolved`, `Ignored`

**intakeType:** `webhook-failure`

**Make route/scenario:** Webhook Failure Logging and Alerting

**Visibility:** System-only and admin-only

## Scenario_Run_Log

**Purpose:** Records Make scenario execution summaries for operational monitoring.

**Exact header row:** `Run At` | `Scenario Name` | `Intake Type` | `Source` | `Status` | `Bundles Processed` | `Error Message` | `Related Sheet Tab` | `Admin Notes`

**Default/status values:** `Success`, `Warning`, `Failed`

**intakeType:** `scenario-run-log`

**Make route/scenario:** Make Scenario Run Logging

**Visibility:** System-only and admin-only
