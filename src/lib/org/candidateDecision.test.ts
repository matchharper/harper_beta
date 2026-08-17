import assert from "node:assert/strict";
import test from "node:test";
import {
  canInitiateOrgCandidateContact,
  canStopOrgCandidateProcess,
  isOrgInternalStage,
  requiresOrgIntroEmailRecipient,
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
