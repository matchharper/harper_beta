import "server-only";

import type { User } from "@supabase/supabase-js";
import { generateRoleCreationOutcomeReply } from "@/lib/org/agent/roleCreationChat";
import { buildRoleCreationCompletionMessage } from "@/lib/org/agent/roleCreationCompletionMessage";
import {
  canReclaimRoleCreationConfirmation,
  isRoleCreationConfirmationProcessing,
  type RoleCreationConfirmationIdentity,
  wasRoleCreationConfirmationHandled,
} from "@/lib/org/agent/roleCreationConfirmationState";
import {
  fetchRoleCreationState,
  getRoleCreationMissingFields,
  type RoleCreationConversationMetadata,
  updateRoleCreationConversationMetadata,
} from "@/lib/org/agent/roleCreationState";
import {
  fetchRecentOrgAgentPromptMessages,
  insertOrgAgentMessage,
} from "@/lib/org/agent/store";
import type {
  OrgAgentMessage,
  OrgAgentMessageMetadata,
  OrgRoleCreationChoice,
} from "@/lib/org/agent/types";
import { OrgHttpError } from "@/lib/org/server";
import { notifyOrgRoleCreatedSlack } from "@/lib/org/slack";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { Json } from "@/types/database.types";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadata(value: unknown): OrgAgentMessageMetadata {
  return record(value) as OrgAgentMessageMetadata;
}

function closeChoices(args: {
  choices: OrgRoleCreationChoice[];
  decision: "no" | "yes";
}) {
  return args.choices.map((choice) => ({
    ...choice,
    status:
      choice.value === args.decision && args.decision === "yes"
        ? ("confirmed" as const)
        : ("declined" as const),
  }));
}

function processingPatch(args: {
  identity: RoleCreationConfirmationIdentity;
  startedAt: string;
}): Partial<RoleCreationConversationMetadata> {
  return {
    confirmationProcessingActionId: args.identity.actionId,
    confirmationProcessingDecision: args.identity.decision,
    confirmationProcessingMessageId: args.identity.messageId,
    confirmationProcessingStartedAt: args.startedAt,
    phase: "confirmation_processing",
  };
}

function handledPatch(args: {
  identity: RoleCreationConfirmationIdentity;
  now: string;
  phase: "collecting" | "completed";
}): Partial<RoleCreationConversationMetadata> {
  return {
    confirmationProcessingActionId: null,
    confirmationProcessingDecision: null,
    confirmationProcessingMessageId: null,
    confirmationProcessingStartedAt: null,
    lastConfirmationActionId: args.identity.actionId,
    lastConfirmationDecision: args.identity.decision,
    lastConfirmationHandledAt: args.now,
    lastConfirmationMessageId: args.identity.messageId,
    pendingConfirmationMessageId: null,
    phase: args.phase,
  };
}

async function claimConfirmation(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  conversationId: string;
  current: RoleCreationConversationMetadata;
  identity: RoleCreationConfirmationIdentity;
  reclaim: boolean;
  startedAt: string;
}) {
  const next = {
    ...args.current,
    ...processingPatch({ identity: args.identity, startedAt: args.startedAt }),
    scope: "role_creation" as const,
  };
  let query = (args.admin.from("company_conversations" as any) as any)
    .update({
      metadata: next as unknown as Json,
      updated_at: args.startedAt,
    })
    .eq("id", args.conversationId);
  query = args.reclaim
    ? query
        .eq("metadata->>phase", "confirmation_processing")
        .eq(
          "metadata->>confirmationProcessingStartedAt",
          args.current.confirmationProcessingStartedAt
        )
    : query
        .eq("metadata->>phase", "confirmation_pending")
        .eq(
          "metadata->>pendingConfirmationMessageId",
          String(args.identity.messageId)
        );
  const { data, error } = await query.select("metadata").maybeSingle();
  if (error) throw error;
  return data ? next : null;
}

function isConfirmationMessage(args: {
  actionId: string;
  decision: "no" | "yes";
  kind: "assistant" | "user";
  message: { metadata: OrgAgentMessageMetadata };
  sourceMessageId: number;
}) {
  const marker = args.message.metadata.roleCreationConfirmation;
  return (
    marker?.actionId === args.actionId &&
    marker.decision === args.decision &&
    marker.kind === args.kind &&
    marker.sourceMessageId === args.sourceMessageId
  );
}

async function persistConfirmationMessages(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  assistantMessageMetadata?: OrgAgentMessageMetadata;
  assistantContent?: string | null;
  confirmationUserMessage?: OrgAgentMessage | null;
  conversation: Parameters<typeof insertOrgAgentMessage>[0]["conversation"];
  identity: RoleCreationConfirmationIdentity;
  messageType?: "chat" | "slack";
  roleId: string;
  slackAssistantUserId?: string | null;
  slackThreadId?: string | null;
  slackUserId?: string | null;
  userId: string;
}) {
  const recent = await fetchRecentOrgAgentPromptMessages({
    admin: args.admin,
    conversationId: args.conversation.id,
    limit: 40,
    scope:
      args.messageType === "slack" && args.slackThreadId
        ? { kind: "slack", slackThreadId: args.slackThreadId }
        : { kind: "chat" },
  });
  const marker = {
    actionId: args.identity.actionId,
    decision: args.identity.decision,
    sourceMessageId: args.identity.messageId,
  };
  if (args.confirmationUserMessage) {
    const nextMetadata: OrgAgentMessageMetadata = {
      ...args.confirmationUserMessage.metadata,
      roleCreationConfirmation: { ...marker, kind: "user" },
    };
    const { data: updatedUserMessage, error: updateUserMessageError } = await (
      args.admin.from("company_messages" as any) as any
    )
      .update({ metadata: nextMetadata as unknown as Json })
      .eq("id", args.confirmationUserMessage.id)
      .eq("conversation_id", args.conversation.id)
      .eq("role_id", args.roleId)
      .eq("role", "user")
      .select("id")
      .maybeSingle();
    if (updateUserMessageError) throw updateUserMessageError;
    if (!updatedUserMessage) {
      throw new OrgHttpError(409, "Confirmation reply message not found");
    }
  } else if (
    !recent.messages.some((message) =>
      isConfirmationMessage({ ...marker, kind: "user", message })
    )
  ) {
    await insertOrgAgentMessage({
      admin: args.admin,
      content: args.identity.decision === "yes" ? "예" : "아니오",
      conversation: args.conversation,
      metadata: {
        roleCreationConfirmation: { ...marker, kind: "user" },
        source: "org_role_creation_confirmation_user",
      },
      messageType: args.messageType,
      role: "user",
      roleId: args.roleId,
      slackThreadId: args.slackThreadId,
      slackUserId: args.slackUserId,
      userId: args.userId,
    });
  }
  const assistantMessageExists = recent.messages.some((message) =>
    isConfirmationMessage({ ...marker, kind: "assistant", message })
  );
  if (args.assistantContent && !assistantMessageExists) {
    return insertOrgAgentMessage({
      admin: args.admin,
      content: args.assistantContent,
      conversation: args.conversation,
      metadata: {
        ...args.assistantMessageMetadata,
        roleCreationConfirmation: { ...marker, kind: "assistant" },
        source: "org_role_creation_confirmation_assistant",
      },
      messageType: args.messageType,
      role: "assistant",
      roleId: args.roleId,
      slackThreadId: args.slackThreadId,
      slackUserId: args.slackAssistantUserId,
    });
  }
  return null;
}

export async function confirmRoleCreationChoice(args: {
  actionId: string;
  assistantMessageMetadata?: OrgAgentMessageMetadata;
  confirmationUserMessage?: OrgAgentMessage | null;
  decision: "no" | "yes";
  messageId: number;
  messageType?: "chat" | "slack";
  roleId: string;
  slackAssistantUserId?: string | null;
  slackThreadId?: string | null;
  slackUserId?: string | null;
  user: User;
  workspaceId: string;
}) {
  const identity: RoleCreationConfirmationIdentity = {
    actionId: text(args.actionId),
    decision: args.decision,
    messageId: args.messageId,
  };
  const roleId = text(args.roleId);
  const workspaceId = text(args.workspaceId);
  if (
    !identity.actionId ||
    !roleId ||
    !workspaceId ||
    !Number.isSafeInteger(identity.messageId)
  ) {
    throw new OrgHttpError(400, "Invalid role confirmation request");
  }

  let state = await fetchRoleCreationState({
    allowCompletedRole: true,
    roleId,
    user: args.user,
    workspaceId,
  });
  if (wasRoleCreationConfirmationHandled(state.metadata, identity)) {
    return {
      alreadyHandled: true,
      completed: state.role.status === "active",
      roleId,
    };
  }

  const admin = getSupabaseAdmin();
  const { data: rawMessage, error: messageError } = await admin
    .from("company_messages")
    .select(
      "id, conversation_id, company_workspace_id, role_id, company_user_id, role, content, message_type, model, status, mentions, thinking_logs, metadata, created_at"
    )
    .eq("id", identity.messageId)
    .eq("conversation_id", state.conversation.id)
    .eq("role_id", roleId)
    .eq("role", "assistant")
    .maybeSingle();
  if (messageError) throw messageError;
  if (!rawMessage) {
    throw new OrgHttpError(404, "Confirmation message not found");
  }

  const sourceMetadata = metadata(rawMessage.metadata);
  const choices = sourceMetadata.roleCreation?.choices ?? [];
  const matchingChoice = choices.find(
    (choice) =>
      choice.actionId === identity.actionId &&
      choice.value === identity.decision
  );
  if (!matchingChoice) {
    throw new OrgHttpError(409, "This confirmation is no longer active");
  }

  const now = new Date().toISOString();
  const reclaim = canReclaimRoleCreationConfirmation({
    identity,
    metadata: state.metadata,
    nowMs: Date.parse(now),
  });
  const pending =
    state.metadata.phase === "confirmation_pending" &&
    state.metadata.pendingConfirmationMessageId === identity.messageId &&
    matchingChoice.status === "pending";
  if (!pending && !reclaim) {
    if (isRoleCreationConfirmationProcessing(state.metadata, identity)) {
      throw new OrgHttpError(409, "This confirmation is being processed");
    }
    throw new OrgHttpError(409, "This confirmation was already handled");
  }

  const claimedMetadata = await claimConfirmation({
    admin,
    conversationId: state.conversation.id,
    current: state.metadata,
    identity,
    reclaim,
    startedAt: now,
  });
  if (!claimedMetadata) {
    state = await fetchRoleCreationState({
      allowCompletedRole: true,
      roleId,
      user: args.user,
      workspaceId,
    });
    if (wasRoleCreationConfirmationHandled(state.metadata, identity)) {
      return {
        alreadyHandled: true,
        completed: state.role.status === "active",
        roleId,
      };
    }
    throw new OrgHttpError(409, "This confirmation is being processed");
  }

  const nextSourceMetadata: OrgAgentMessageMetadata = {
    ...sourceMetadata,
    roleCreation: sourceMetadata.roleCreation
      ? {
          ...sourceMetadata.roleCreation,
          choices: closeChoices({ choices, decision: args.decision }),
        }
      : undefined,
  };

  const refreshed = await fetchRoleCreationState({
    allowCompletedRole: true,
    roleId,
    user: args.user,
    workspaceId,
  });
  const missingFields =
    refreshed.role.status === "active"
      ? []
      : getRoleCreationMissingFields(refreshed);

  let completed = false;
  let outcome: "completed" | "declined" | "revalidation_failed" = "declined";
  if (args.decision === "yes" && missingFields.length > 0) {
    outcome = "revalidation_failed";
  } else if (args.decision === "yes") {
    if (refreshed.role.status !== "active") {
      const { data: activated, error: activateError } = await (
        admin.rpc as any
      )("complete_company_role_creation_v1", {
        p_role_id: roleId,
        p_workspace_id: workspaceId,
      });
      if (activateError) throw activateError;
      if (activated !== true) {
        throw new OrgHttpError(409, "Role was already updated");
      }
    }
    completed = true;
    outcome = "completed";
  }

  const { error: sourceUpdateError } = await admin
    .from("company_messages")
    .update({ metadata: nextSourceMetadata as unknown as Json })
    .eq("id", identity.messageId)
    .eq("conversation_id", state.conversation.id);
  if (sourceUpdateError) throw sourceUpdateError;

  await persistConfirmationMessages({
    admin,
    assistantMessageMetadata: args.assistantMessageMetadata,
    assistantContent: null,
    confirmationUserMessage: args.confirmationUserMessage,
    conversation: state.conversation,
    identity,
    messageType: args.messageType,
    roleId,
    slackAssistantUserId: args.slackAssistantUserId,
    slackThreadId: args.slackThreadId,
    slackUserId: args.slackUserId,
    userId: args.user.id,
  });

  const handledAt = new Date().toISOString();
  await updateRoleCreationConversationMetadata({
    admin,
    conversationId: state.conversation.id,
    current: claimedMetadata,
    patch: {
      ...handledPatch({
        identity,
        now: handledAt,
        phase: completed ? "completed" : "collecting",
      }),
      ...(completed
        ? { completedAt: handledAt, completedBy: args.user.id }
        : {}),
    },
  });

  let assistantMessage: OrgAgentMessage | null = null;
  try {
    const outcomeState = await fetchRoleCreationState({
      allowCompletedRole: true,
      roleId,
      user: args.user,
      workspaceId,
    });
    let slackNotificationDelivered: boolean | null = null;
    if (completed) {
      try {
        slackNotificationDelivered = await notifyOrgRoleCreatedSlack({
          actor: outcomeState.currentUser,
          roleId,
          roleName: outcomeState.role.name,
          workspace: {
            companyName: outcomeState.workspace.companyName,
            workspaceId: outcomeState.workspace.workspaceId,
          },
        });
      } catch (error) {
        slackNotificationDelivered = false;
        console.error("[org/role-creation] Slack completion notify failed", error);
      }
    }
    const assistantContent = completed
      ? buildRoleCreationCompletionMessage({
          companyName: outcomeState.workspace.companyName,
          roleName: outcomeState.role.name,
          slackNotificationDelivered,
          surface: args.messageType === "slack" ? "slack" : "chat",
          userName: outcomeState.currentUser.name,
        })
      : (
          await generateRoleCreationOutcomeReply({
            missingFields,
            model: sourceMetadata.model ?? rawMessage.model,
            outcome,
            surface: args.messageType === "slack" ? "slack" : "chat",
            state: outcomeState,
          })
        ).content;
    assistantMessage = await persistConfirmationMessages({
      admin,
      assistantMessageMetadata: args.assistantMessageMetadata,
      assistantContent,
      confirmationUserMessage: args.confirmationUserMessage,
      conversation: state.conversation,
      identity,
      messageType: args.messageType,
      roleId,
      slackAssistantUserId: args.slackAssistantUserId,
      slackThreadId: args.slackThreadId,
      slackUserId: args.slackUserId,
      userId: args.user.id,
    });
  } catch (error) {
    console.error("[org/agent/role-creation/confirmation-reply]", error);
  }
  if (!assistantMessage && args.messageType === "slack") {
    const assistantContent = completed
      ? "역할 등록을 완료했어요. 이제 Harper가 정리한 역할 설명과 매칭 기준을 바탕으로 적합한 인재를 살펴보기 시작합니다."
      : outcome === "revalidation_failed"
        ? "최종 등록 전에 아직 확인할 내용이 있어요. 이어서 필요한 내용을 함께 정리하겠습니다."
        : "알겠습니다. 아직 역할을 등록하지 않고, 이 스레드에서 내용을 더 수정할게요.";
    assistantMessage = await persistConfirmationMessages({
      admin,
      assistantMessageMetadata: args.assistantMessageMetadata,
      assistantContent,
      confirmationUserMessage: args.confirmationUserMessage,
      conversation: state.conversation,
      identity,
      messageType: args.messageType,
      roleId,
      slackAssistantUserId: args.slackAssistantUserId,
      slackThreadId: args.slackThreadId,
      slackUserId: args.slackUserId,
      userId: args.user.id,
    });
  }
  return { alreadyHandled: false, assistantMessage, completed, roleId };
}
