import type { RoleCreationConversationMetadata } from "@/lib/org/agent/roleCreationState";

export const ROLE_CREATION_CONFIRMATION_LEASE_MS = 60_000;

export type RoleCreationConfirmationIdentity = {
  actionId: string;
  decision: "no" | "yes";
  messageId: number;
};

export function wasRoleCreationConfirmationHandled(
  metadata: RoleCreationConversationMetadata,
  identity: RoleCreationConfirmationIdentity
) {
  return (
    metadata.lastConfirmationActionId === identity.actionId &&
    metadata.lastConfirmationDecision === identity.decision &&
    metadata.lastConfirmationMessageId === identity.messageId
  );
}

export function isRoleCreationConfirmationProcessing(
  metadata: RoleCreationConversationMetadata,
  identity: RoleCreationConfirmationIdentity
) {
  return (
    metadata.phase === "confirmation_processing" &&
    metadata.confirmationProcessingActionId === identity.actionId &&
    metadata.confirmationProcessingDecision === identity.decision &&
    metadata.confirmationProcessingMessageId === identity.messageId
  );
}

export function canReclaimRoleCreationConfirmation(args: {
  identity: RoleCreationConfirmationIdentity;
  metadata: RoleCreationConversationMetadata;
  nowMs: number;
}) {
  if (!isRoleCreationConfirmationProcessing(args.metadata, args.identity)) {
    return false;
  }
  const startedAt = Date.parse(
    args.metadata.confirmationProcessingStartedAt ?? ""
  );
  return (
    Number.isFinite(startedAt) &&
    args.nowMs - startedAt >= ROLE_CREATION_CONFIRMATION_LEASE_MS
  );
}
