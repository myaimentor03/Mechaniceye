export const DRIVABLE_REPORT_STATUS_IDS = [
  "intake_received",
  "needs_more_info",
  "ai_draft_ready",
  "needs_human_review",
  "customer_ready_draft",
  "approved_to_send",
  "sent_to_customer",
  "do_not_send",
  "archived"
] as const;

export type DrivableReportStatus =
  (typeof DRIVABLE_REPORT_STATUS_IDS)[number];

export type DrivableReportStatusDefinition = {
  id: DrivableReportStatus;
  label: string;
  description: string;
};

export const DRIVABLE_REPORT_STATUSES: readonly DrivableReportStatusDefinition[] = [
  {
    id: "intake_received",
    label: "Intake Received",
    description: "The customer intake has been received but report work has not started."
  },
  {
    id: "needs_more_info",
    label: "Needs More Information",
    description: "Additional customer details or evidence are needed before a useful report can be prepared."
  },
  {
    id: "ai_draft_ready",
    label: "AI Draft Ready",
    description: "A confidence-rated draft is available for internal review."
  },
  {
    id: "needs_human_review",
    label: "Needs Human Review",
    description: "A qualified reviewer must evaluate the draft, risk language, and recommendation."
  },
  {
    id: "customer_ready_draft",
    label: "Customer-Ready Draft",
    description: "The report has been edited for the customer but is not yet approved for delivery."
  },
  {
    id: "approved_to_send",
    label: "Approved to Send",
    description: "The report has passed the required review and is authorized for customer delivery."
  },
  {
    id: "sent_to_customer",
    label: "Sent to Customer",
    description: "The approved report has been delivered to the customer."
  },
  {
    id: "do_not_send",
    label: "Do Not Send",
    description: "The report must not be delivered because of safety, quality, consent, or other concerns."
  },
  {
    id: "archived",
    label: "Archived",
    description: "The report record is retained but no longer active in the fulfillment workflow."
  }
] as const;

export const CUSTOMER_VISIBLE_STATUSES: readonly DrivableReportStatus[] = [
  "approved_to_send",
  "sent_to_customer"
] as const;

export const INTERNAL_ONLY_STATUSES: readonly DrivableReportStatus[] = [
  "intake_received",
  "needs_more_info",
  "ai_draft_ready",
  "needs_human_review",
  "customer_ready_draft",
  "do_not_send",
  "archived"
] as const;

export const HIGH_RISK_REVIEW_REQUIRED_STATUSES: readonly DrivableReportStatus[] = [
  "ai_draft_ready",
  "needs_human_review",
  "customer_ready_draft"
] as const;

export function isCustomerSendAllowed(status: DrivableReportStatus): boolean {
  return status === "approved_to_send";
}
