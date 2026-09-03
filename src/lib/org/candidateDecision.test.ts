import assert from "node:assert/strict";
import test from "node:test";
import {
  canInitiateOrgCandidateContact,
  canStopOrgCandidateProcess,
  isOrgInternalStage,
  currentOrgActiveCompanyPosition,
  requiresOrgIntroEmailRecipient,
  shouldSendOrgIntroEmail,
  shouldOpenOrgAcceptIntroDialog,
  shouldOpenOrgStopCandidateDialog,
} from "./candidateDecision";
import { isInternalDomainEmail } from "../internalAccess";

test("does not request an intro when moving to a terminal stage", () => {
  assert.equal(
    shouldOpenOrgAcceptIntroDialog("pending_connection", "archived"),
    false
  );
  assert.equal(
    shouldOpenOrgAcceptIntroDialog("pending_connection", "process_stopped"),
    false
  );
  assert.equal(canInitiateOrgCandidateContact("archived"), false);
  assert.equal(canInitiateOrgCandidateContact("process_stopped"), false);
});

test("marks accepted and archived as Harper-internal stages", () => {
  assert.equal(isOrgInternalStage("accepted"), true);
  assert.equal(isOrgInternalStage("archived"), true);
  assert.equal(isOrgInternalStage("pending_connection"), false);
  assert.equal(isOrgInternalStage("connected"), false);
});

test("allows candidate contact throughout an active company process", () => {
  assert.equal(canInitiateOrgCandidateContact("pending_connection"), true);
  assert.equal(canInitiateOrgCandidateContact("connected"), true);
  assert.equal(canInitiateOrgCandidateContact("custom:first-interview"), true);
  assert.equal(canInitiateOrgCandidateContact("final_offer"), true);
  assert.equal(canInitiateOrgCandidateContact("process_stopped"), false);
  assert.equal(canInitiateOrgCandidateContact("accepted"), false);
  assert.equal(canInitiateOrgCandidateContact("archived"), false);
});

test("selects the current active company position in one Role", () => {
  const position = currentOrgActiveCompanyPosition(
    [
      {
        recommendationId: "recommendation-old",
        roleId: "role-1",
        stage: "pending_connection" as const,
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        recommendationId: "recommendation-other-role",
        roleId: "role-2",
        stage: "custom:first-interview" as const,
        updatedAt: "2026-08-04T00:00:00.000Z",
      },
      {
        recommendationId: "recommendation-current",
        roleId: "role-1",
        stage: "custom:second-interview" as const,
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
    ],
    "role-1"
  );

  assert.equal(position?.recommendationId, "recommendation-current");
});

test("does not fall back to an older position after the process ends", () => {
  const position = currentOrgActiveCompanyPosition(
    [
      {
        recommendationId: "recommendation-old",
        roleId: "role-1",
        stage: "connected" as const,
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        recommendationId: "recommendation-stopped",
        roleId: "role-1",
        stage: "process_stopped" as const,
        updatedAt: "2026-08-03T00:00:00.000Z",
      },
    ],
    "role-1"
  );

  assert.equal(position, null);
});

test("requests an intro for an active stage after pending connection", () => {
  assert.equal(
    shouldOpenOrgAcceptIntroDialog("pending_connection", "connected"),
    true
  );
  assert.equal(
    shouldOpenOrgAcceptIntroDialog("pending_connection", "final_offer"),
    true
  );
  assert.equal(
    shouldOpenOrgAcceptIntroDialog("pending_connection", "accepted"),
    false
  );
  assert.equal(
    shouldOpenOrgAcceptIntroDialog("accepted", "connected"),
    false
  );
  assert.equal(
    shouldOpenOrgAcceptIntroDialog("process_stopped", "connected"),
    true
  );
});

test("requires at least one company recipient only for an emailed connection", () => {
  assert.equal(
    requiresOrgIntroEmailRecipient("pending_connection", "connected", false),
    true
  );
  assert.equal(
    requiresOrgIntroEmailRecipient("pending_connection", "connected", true),
    false
  );
  assert.equal(
    requiresOrgIntroEmailRecipient("connected", "final_offer", false),
    false
  );
  assert.equal(
    requiresOrgIntroEmailRecipient("process_stopped", "connected", false),
    true
  );
});

test("sends an intro only when a connection starts or resumes", () => {
  const shouldSend = (
    currentStage: Parameters<typeof shouldSendOrgIntroEmail>[0]["currentStage"],
    nextStage: Parameters<typeof shouldSendOrgIntroEmail>[0]["nextStage"],
    overrides: Partial<Parameters<typeof shouldSendOrgIntroEmail>[0]> = {}
  ) =>
    shouldSendOrgIntroEmail({
      contactDirectly: false,
      currentStage,
      nextStage,
      recipientCount: 1,
      scheduleInterview: false,
      skipAutomaticContact: false,
      ...overrides,
    });

  assert.equal(shouldSend("pending_connection", "custom:first-interview"), true);
  assert.equal(shouldSend("process_stopped", "connected"), true);
  assert.equal(
    shouldSend("custom:first-interview", "custom:second-interview"),
    false
  );
  assert.equal(shouldSend("connected", "final_offer"), false);
  assert.equal(
    shouldSend("pending_connection", "custom:first-interview", {
      scheduleInterview: true,
    }),
    false
  );
  assert.equal(
    shouldSend("pending_connection", "custom:first-interview", {
      skipAutomaticContact: true,
    }),
    false
  );
  assert.equal(
    shouldSend("pending_connection", "custom:first-interview", {
      contactDirectly: true,
    }),
    false
  );
  assert.equal(
    shouldSend("pending_connection", "custom:first-interview", {
      recipientCount: 0,
    }),
    false
  );
});

test("confirms stopping both waiting and already active company connections", () => {
  assert.equal(
    shouldOpenOrgStopCandidateDialog(
      "pending_connection",
      "process_stopped"
    ),
    true
  );
  assert.equal(
    shouldOpenOrgStopCandidateDialog("connected", "process_stopped"),
    true
  );
  assert.equal(
    shouldOpenOrgStopCandidateDialog("final_offer", "process_stopped"),
    true
  );
  assert.equal(
    shouldOpenOrgStopCandidateDialog("pending_connection", "archived"),
    false
  );
  assert.equal(canStopOrgCandidateProcess("custom:interview"), true);
  assert.equal(canStopOrgCandidateProcess("accepted"), false);
  assert.equal(canStopOrgCandidateProcess("process_stopped"), false);
});

test("recognizes matchharper.com login emails case-insensitively", () => {
  assert.equal(isInternalDomainEmail("chris@matchharper.com"), true);
  assert.equal(isInternalDomainEmail("  CHRIS@MATCHHARPER.COM  "), true);
  assert.equal(isInternalDomainEmail("chris@sub.matchharper.com"), false);
  assert.equal(isInternalDomainEmail("chris@notmatchharper.com"), false);
  assert.equal(isInternalDomainEmail(null), false);
});
