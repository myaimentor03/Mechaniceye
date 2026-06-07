# Make Intake Type Routing Map V1

Use the exact `intakeType` as the primary router filter. Source values are stable recommendations matching the current Drivable flow naming; do not expose webhook URLs or environment values in Make notes or workbook cells.

| intakeType | source | Make route/scenario | Google Sheet tab | default status | Gmail draft needed | OpenAI draft/summary later | admin review required |
|---|---|---|---|---|---|---|---|
| marketplace-seller | drivable-marketplace-seller-intake | Marketplace Seller Intake | Seller_Intake | New Seller Intake | No | Yes | Yes |
| marketplace-buyer-interest | drivable-marketplace-buyer-interest | Marketplace Buyer Interest | Buyer_Interest | New Buyer Interest | Yes | Yes | Yes |
| mechanic-match-request | drivable-mechanic-match-request | Mechanic Match Request Intake | Mechanic_Match_Requests | New Match Request | No | Yes | Yes |
| mechanic-provider-claim | drivable-mechanic-provider-claim | Mechanic Provider Claim and Review | Mechanic_Match_Providers | New Claim | No | Yes | Yes |
| provider-outreach-log | drivable-provider-outreach | Provider Outreach Logging | Mechanic_Outreach_Log | Contacted | No | No | Yes |
| internal-diagnosis-response | drivable-internal-review | Internal Review Desk to Gmail Draft | Internal_Review_Log | New Internal Review | Yes | Yes | Yes |
| support-concierge-request | drivable-concierge | Drivable Concierge Support Intake | Support_Concierge | New Support Request | Yes | Yes | Yes |
| marketplace-guide-request | drivable-marketplace-guide-request | Marketplace Guide Request | Guide_Requests | New | Yes | Yes | Yes |
| admin-action | drivable-internal-admin | Admin Action Audit Log | Admin_Actions | Logged | No | No | Yes |
| security-event | drivable-security-event | Security Event Intake and Alerting | Security_Events | New Security Event | No | Yes | Yes |
| watchtower-health-check | drivable-watchtower | Watchtower Health Monitoring | Watchtower_Health_Checks | Healthy | No | No | Only warnings/failures |
| webhook-failure | drivable-webhook-failure | Webhook Failure Logging and Alerting | Webhook_Failures | New | No | Yes | Yes |
| scenario-run-log | drivable-make-scenario-log | Make Scenario Run Logging | Scenario_Run_Log | Success | No | No | Only warnings/failures |

## Routing Notes

- Create Gmail drafts rather than automatically sending sensitive diagnosis, support, buyer, or guide responses.
- Log cross-flow activity in `Activity_Log` when useful, but keep each intake's primary record in its mapped tab.
- `marketplace-package-selected` may update `Payment_Tracking` later; it is not included as a V1 intake route because it was not requested in this routing set.
- System routes should store safe summaries only. Never write webhook URLs, environment variables, credentials, private tokens, or stack traces to the workbook.
