import assert from "node:assert/strict";
import test from "node:test";
import {
  canReclaimRoleCreationConfirmation,
  isRoleCreationConfirmationProcessing,
  wasRoleCreationConfirmationHandled,
} from "@/lib/org/agent/roleCreationConfirmationState";
import type { RoleCreationConversationMetadata } from "@/lib/org/agent/roleCreationState";

const identity = { actionId: "action-1", decision: "yes" as const, messageId: 9 };
const base: RoleCreationConversationMetadata = {
  completedAt: null,
  completedBy: null,
  confirmationProcessingActionId: null,
  confirmationProcessingDecision: null,
  confirmationProcessingMessageId: null,
  confirmationProcessingStartedAt: null,
  confirmedAssigneeUserId: null,
  confirmedSlackChannelIds: [],
  lastConfirmationActionId: null,
  lastConfirmationDecision: null,
  lastConfirmationHandledAt: null,
  lastConfirmationMessageId: null,
  pendingConfirmationMessageId: 9,
  phase: "confirmation_pending",
  scope: "role_creation",
  slackRoleCreationThread: null,
};

test("recognizes only the exact handled confirmation identity", () => {
  const handled = {
    ...base,
    lastConfirmationActionId: identity.actionId,
    lastConfirmationDecision: identity.decision,
    lastConfirmationMessageId: identity.messageId,
  };
  assert.equal(wasRoleCreationConfirmationHandled(handled, identity), true);
  assert.equal(
    wasRoleCreationConfirmationHandled(handled, {
      ...identity,
      decision: "no",
    }),
    false
  );
});

test("a matching processing lease is busy until its timeout", () => {
  const processing: RoleCreationConversationMetadata = {
    ...base,
    confirmationProcessingActionId: identity.actionId,
    confirmationProcessingDecision: identity.decision,
    confirmationProcessingMessageId: identity.messageId,
    confirmationProcessingStartedAt: "2026-08-07T00:00:00.000Z",
    phase: "confirmation_processing",
  };
  assert.equal(isRoleCreationConfirmationProcessing(processing, identity), true);
  assert.equal(
    canReclaimRoleCreationConfirmation({
      identity,
      metadata: processing,
      nowMs: Date.parse("2026-08-07T00:00:59.999Z"),
    }),
    false
  );
  assert.equal(
    canReclaimRoleCreationConfirmation({
      identity,
      metadata: processing,
      nowMs: Date.parse("2026-08-07T00:01:00.000Z"),
    }),
    true
  );
});
