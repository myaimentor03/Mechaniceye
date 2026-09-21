import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createNotification,
  getCustomerNotifications,
  getUnreadCount,
  getCaseUnreadCount,
  markAsRead,
  markNotificationRead,
  notifyStateTransition,
  clearNotificationsForTests,
} from "./journey-notifications";

const CUSTOMER_A = "cust-test-a";
const CUSTOMER_B = "cust-test-b";
const CASE_1 = "JRN-test-001";
const CASE_2 = "JRN-test-002";

describe("journey-notifications", () => {
  beforeEach(() => {
    clearNotificationsForTests();
  });

  describe("createNotification", () => {
    it("creates a notification with correct fields", async () => {
      const n = await createNotification({
        caseId: CASE_1,
        customerId: CUSTOMER_A,
        kind: "case_started",
        message: "Your case has been started.",
        caseState: "intake",
      });

      assert.ok(n.notificationId.startsWith("ntf-"), `Expected ntf- prefix, got ${n.notificationId}`);
      assert.equal(n.caseId, CASE_1);
      assert.equal(n.customerId, CUSTOMER_A);
      assert.equal(n.kind, "case_started");
      assert.equal(n.title, "Case Started");
      assert.equal(n.message, "Your case has been started.");
      assert.equal(n.caseState, "intake");
      assert.equal(n.readAt, null);
      assert.ok(n.createdAt instanceof Date);
    });

    it("generates unique notification IDs", async () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const n = await createNotification({
          caseId: CASE_1,
          customerId: CUSTOMER_A,
          kind: "state_changed",
          message: `Test ${i}`,
          caseState: "triage",
        });
        ids.add(n.notificationId);
      }
      assert.equal(ids.size, 50, "All notification IDs should be unique");
    });
  });

  describe("getCustomerNotifications", () => {
    it("returns notifications for the correct customer only", async () => {
      await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "case_started", message: "A started", caseState: "intake" });
      await createNotification({ caseId: CASE_2, customerId: CUSTOMER_B, kind: "case_started", message: "B started", caseState: "intake" });
      await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "state_changed", message: "A updated", caseState: "triage" });

      const aNotifs = getCustomerNotifications(CUSTOMER_A);
      assert.equal(aNotifs.length, 2, "Customer A should have 2 notifications");

      const bNotifs = getCustomerNotifications(CUSTOMER_B);
      assert.equal(bNotifs.length, 1, "Customer B should have 1 notification");
    });

    it("returns newest first", async () => {
      const n1 = await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "case_started", message: "First", caseState: "intake" });
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 5));
      const n2 = await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "state_changed", message: "Second", caseState: "triage" });

      const notifs = getCustomerNotifications(CUSTOMER_A);
      assert.equal(notifs.length, 2);
      assert.equal(notifs[0].notificationId, n2.notificationId, "Newest should be first");
      assert.equal(notifs[1].notificationId, n1.notificationId, "Oldest should be last");
    });

    it("filters unread only", async () => {
      const n1 = await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "case_started", message: "First", caseState: "intake" });
      await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "state_changed", message: "Second", caseState: "triage" });
      markNotificationRead(n1.notificationId, CUSTOMER_A);

      const unread = getCustomerNotifications(CUSTOMER_A, { unreadOnly: true });
      assert.equal(unread.length, 1, "Should have 1 unread notification");
      assert.equal(unread[0].message, "Second");
    });

    it("respects limit", async () => {
      for (let i = 0; i < 10; i++) {
        await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "state_changed", message: `N${i}`, caseState: "triage" });
      }
      const limited = getCustomerNotifications(CUSTOMER_A, { limit: 3 });
      assert.equal(limited.length, 3, "Should return only 3 notifications");
    });
  });

  describe("getUnreadCount", () => {
    it("returns 0 when no notifications exist", () => {
      assert.equal(getUnreadCount(CUSTOMER_A), 0);
    });

    it("counts only unread notifications for the customer", async () => {
      await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "case_started", message: "1", caseState: "intake" });
      await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "state_changed", message: "2", caseState: "triage" });
      await createNotification({ caseId: CASE_2, customerId: CUSTOMER_B, kind: "case_started", message: "3", caseState: "intake" });

      assert.equal(getUnreadCount(CUSTOMER_A), 2, "Customer A should have 2 unread");
      assert.equal(getUnreadCount(CUSTOMER_B), 1, "Customer B should have 1 unread");
    });

    it("decreases after marking read", async () => {
      await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "case_started", message: "1", caseState: "intake" });
      await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "state_changed", message: "2", caseState: "triage" });
      assert.equal(getUnreadCount(CUSTOMER_A), 2);

      markAsRead(CUSTOMER_A, CASE_1);
      assert.equal(getUnreadCount(CUSTOMER_A), 0, "All should be read after markAsRead");
    });
  });

  describe("getCaseUnreadCount", () => {
    it("counts only unread notifications for a specific case", async () => {
      await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "case_started", message: "1", caseState: "intake" });
      await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "state_changed", message: "2", caseState: "triage" });
      await createNotification({ caseId: CASE_2, customerId: CUSTOMER_A, kind: "case_started", message: "3", caseState: "intake" });

      assert.equal(getCaseUnreadCount(CUSTOMER_A, CASE_1), 2, "Case 1 should have 2 unread");
      assert.equal(getCaseUnreadCount(CUSTOMER_A, CASE_2), 1, "Case 2 should have 1 unread");
    });
  });

  describe("markAsRead", () => {
    it("marks all notifications for a customer as read", async () => {
      await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "case_started", message: "1", caseState: "intake" });
      await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "state_changed", message: "2", caseState: "triage" });

      const count = markAsRead(CUSTOMER_A);
      assert.equal(count, 2, "Should mark 2 notifications");
      assert.equal(getUnreadCount(CUSTOMER_A), 0);
    });

    it("marks only notifications for a specific case when caseId provided", async () => {
      await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "case_started", message: "1", caseState: "intake" });
      await createNotification({ caseId: CASE_2, customerId: CUSTOMER_A, kind: "case_started", message: "2", caseState: "intake" });

      const count = markAsRead(CUSTOMER_A, CASE_1);
      assert.equal(count, 1, "Should mark only 1 notification for case 1");
      assert.equal(getCaseUnreadCount(CUSTOMER_A, CASE_1), 0, "Case 1 should have 0 unread");
      assert.equal(getCaseUnreadCount(CUSTOMER_A, CASE_2), 1, "Case 2 should still have 1 unread");
    });

    it("does not mark already-read notifications again", async () => {
      await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "case_started", message: "1", caseState: "intake" });
      markAsRead(CUSTOMER_A);
      const count = markAsRead(CUSTOMER_A);
      assert.equal(count, 0, "Should not re-mark already-read notifications");
    });
  });

  describe("markNotificationRead", () => {
    it("marks a specific notification as read", async () => {
      const n = await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "case_started", message: "1", caseState: "intake" });
      assert.equal(getUnreadCount(CUSTOMER_A), 1);

      const marked = markNotificationRead(n.notificationId, CUSTOMER_A);
      assert.equal(marked, true);
      assert.equal(getUnreadCount(CUSTOMER_A), 0);
    });

    it("returns false for non-existent notification", () => {
      const marked = markNotificationRead("ntf-nonexistent", CUSTOMER_A);
      assert.equal(marked, false);
    });

    it("returns false when already read", async () => {
      const n = await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "case_started", message: "1", caseState: "intake" });
      markNotificationRead(n.notificationId, CUSTOMER_A);
      const again = markNotificationRead(n.notificationId, CUSTOMER_A);
      assert.equal(again, false, "Should return false for already-read notification");
    });

    it("returns false when customer ID does not match", async () => {
      const n = await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "case_started", message: "1", caseState: "intake" });
      const marked = markNotificationRead(n.notificationId, CUSTOMER_B);
      assert.equal(marked, false, "Wrong customer should not be able to mark read");
      assert.equal(getUnreadCount(CUSTOMER_A), 1, "Original should still be unread");
    });
  });

  describe("notifyStateTransition", () => {
    it("creates notification for diagnosis_ready state", async () => {
      const n = await notifyStateTransition({
        caseId: CASE_1,
        customerId: CUSTOMER_A,
        fromState: "evaluating",
        toState: "diagnosis_ready",
        transition: "ready_diagnosis",
        safetyTriggered: false,
      });

      assert.ok(n, "Should create notification");
      assert.equal(n!.kind, "state_changed");
      assert.equal(n!.caseState, "diagnosis_ready");
      assert.ok(n!.message.includes("results are ready"));
    });

    it("creates safety_escalated notification when safety triggered", async () => {
      const n = await notifyStateTransition({
        caseId: CASE_1,
        customerId: CUSTOMER_A,
        fromState: "triage",
        toState: "escalation_required",
        transition: "escalate",
        safetyTriggered: true,
      });

      assert.ok(n, "Should create notification");
      assert.equal(n!.kind, "safety_escalated");
      assert.ok(n!.message.includes("safety concern"));
    });

    it("creates case_resolved notification", async () => {
      const n = await notifyStateTransition({
        caseId: CASE_1,
        customerId: CUSTOMER_A,
        fromState: "diagnosis_ready",
        toState: "resolved",
        transition: "resolve",
        safetyTriggered: false,
        outcome: "fix",
      });

      assert.ok(n, "Should create notification");
      assert.equal(n!.kind, "case_resolved");
      assert.ok(n!.message.includes("resolved"));
      assert.ok(n!.message.includes("fix"));
    });

    it("creates review_requested notification for human_review", async () => {
      const n = await notifyStateTransition({
        caseId: CASE_1,
        customerId: CUSTOMER_A,
        fromState: "diagnosis_ready",
        toState: "human_review",
        transition: "request_human_review",
        safetyTriggered: false,
      });

      assert.ok(n, "Should create notification");
      assert.equal(n!.kind, "review_requested");
    });

    it("returns null for silent transitions", async () => {
      const n = await notifyStateTransition({
        caseId: CASE_1,
        customerId: CUSTOMER_A,
        fromState: "evidence_received",
        toState: "evidence_received",
        transition: "add_more_evidence",
        safetyTriggered: false,
      });

      assert.equal(n, null, "add_more_evidence should not create notification");
    });

    it("creates notification for evidence_requested", async () => {
      const n = await notifyStateTransition({
        caseId: CASE_1,
        customerId: CUSTOMER_A,
        fromState: "triage",
        toState: "evidence_requested",
        transition: "request_evidence",
        safetyTriggered: false,
      });

      assert.ok(n, "Should create notification");
      assert.equal(n!.kind, "state_changed");
      assert.ok(n!.message.includes("need a bit more information"));
    });
  });

  describe("clearNotificationsForTests", () => {
    it("clears all notifications", async () => {
      await createNotification({ caseId: CASE_1, customerId: CUSTOMER_A, kind: "case_started", message: "1", caseState: "intake" });
      await createNotification({ caseId: CASE_2, customerId: CUSTOMER_B, kind: "case_started", message: "2", caseState: "intake" });

      clearNotificationsForTests();
      assert.equal(getCustomerNotifications(CUSTOMER_A).length, 0);
      assert.equal(getCustomerNotifications(CUSTOMER_B).length, 0);
    });
  });
});
