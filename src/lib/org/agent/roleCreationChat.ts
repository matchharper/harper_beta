import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  createChatCompletionWithFallback,
  usesMaxCompletionTokensForModel,
} from "@/lib/llm/llm";
import {
  DEFAULT_ORG_AGENT_MODEL,
  getOrgAgentFallbackModel,
  ORG_AGENT_GROK_MODEL,
  isOrgAgentModelId,
  resolveOrgAgentModel,
  type OrgAgentModelId,
} from "@/lib/org/agent/modelConfig";
import {
  buildRoleCreationOutcomePrompt,
  buildRoleCreationSystemPrompt,
  buildRoleCreationUserPrompt,
} from "@/lib/org/agent/roleCreationPrompt";
import {
  ROLE_CREATION_TOOLS,
  executeRoleCreationTool,
  isRoleCreationToolName,
} from "@/lib/org/agent/roleCreationTools";
import {
  createOrResumeDraftRole,
  fetchRoleCreationState,
  type RoleCreationState,
  updateRoleCreationConversationMetadata,
} from "@/lib/org/agent/roleCreationState";
import {
  fetchRecentOrgAgentSlackThreadPromptMessages,
  fetchRecentOrgAgentPromptMessages,
  findOrgAgentSlackUserMessage,
  insertOrgAgentMessage,
} from "@/lib/org/agent/store";
import { upsertOrgAgentThinkingLog } from "@/lib/org/agent/thinkingLogs";
import { filterOrgAgentMentionsForWorkspace } from "@/lib/org/agent/context";
import type {
  OrgAgentMention,
  OrgAgentMessage,
  OrgAgentMessageAttachment,
  OrgAgentMessageMetadata,
  OrgAgentThinkingLog,
} from "@/lib/org/agent/types";
import type { ChatAttachmentPayload } from "@/types/chat";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  MAX_ROLE_CREATION_FILE_BYTES,
  MAX_ROLE_CREATION_FILES,
  MAX_ROLE_CREATION_TOTAL_FILE_BYTES,
  isRoleCreationFileMimeAllowed,
  isRoleCreationFileNameAllowed,
  isRoleCreationMediaMime,
} from "@/lib/org/agent/roleCreationDocumentTypes";

type RoleCreationChatEventName =
  | "assistant_message"
  | "role_created"
  | "text_delta"
  | "tool_status"
  | "user_message";

export type RoleCreationChatEmitter = (
  event: RoleCreationChatEventName,
  data: unknown
) => void;

type LlmToolCall = {
  function: { arguments: string; name: string };
  id: string;
  type: "function";
};

type LlmMessage = {
  content: string;
  role: "assistant" | "system" | "tool" | "user";
  tool_call_id?: string;
  tool_calls?: LlmToolCall[];
};

const MAX_TOOL_LOOPS = 5;
const MAX_TOOL_CALLS = 7;
const MAX_ATTACHMENT_TEXT_CHARS = 18_000;
const ROLE_CREATION_MAX_OUTPUT_TOKENS = 4_800;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getResponseMessage(response: unknown) {
  const root = record(response);
  const choices = Array.isArray(root.choices) ? root.choices : [];
  return record(record(choices[0]).message);
}

function assistantText(message: Record<string, unknown>) {
  if (typeof message.content === "string") return text(message.content);
  if (!Array.isArray(message.content)) return "";
  return text(
    message.content
      .map((part) => {
        const item = record(part);
        return typeof item.text === "string"
          ? item.text
          : typeof item.content === "string"
            ? item.content
            : "";
      })
      .join("")
  );
}

function toolCalls(message: Record<string, unknown>): LlmToolCall[] {
  if (!Array.isArray(message.tool_calls)) return [];
  return message.tool_calls.flatMap((raw, index) => {
    const item = record(raw);
    const fn = record(item.function);
    const name = text(fn.name);
    if (!name) return [];
    return [
      {
        function: {
          arguments:
            typeof fn.arguments === "string"
              ? fn.arguments
              : JSON.stringify(fn.arguments ?? {}),
          name,
        },
        id:
          text(item.id) || `role_creation_tool_${index}_${crypto.randomUUID()}`,
        type: "function" as const,
      },
    ];
  });
}

function parseArguments(value: string) {
  const parsed = JSON.parse(value || "{}") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be an object");
  }
  return parsed as Record<string, unknown>;
}

function validateAttachments(value: ChatAttachmentPayload[] | undefined) {
  const attachments = Array.isArray(value) ? value : [];
  if (attachments.length > MAX_ROLE_CREATION_FILES) {
    throw new Error("한 번에 파일을 3개까지만 첨부할 수 있습니다.");
  }
  const totalBytes = attachments.reduce(
    (total, attachment) => total + Number(attachment.size ?? 0),
    0
  );
  if (
    !Number.isFinite(totalBytes) ||
    totalBytes > MAX_ROLE_CREATION_TOTAL_FILE_BYTES
  ) {
    throw new Error("첨부 파일의 전체 크기는 25MB 이하여야 합니다.");
  }
  return attachments.map((attachment) => {
    const name = text(attachment.name).slice(0, 240);
    const content = text(attachment.text);
    const size = Number(attachment.size ?? 0);
    if (
      attachment.kind !== "file" ||
      !name ||
      !isRoleCreationFileNameAllowed(name) ||
      !isRoleCreationFileMimeAllowed(name, attachment.mime) ||
      isRoleCreationMediaMime(attachment.mime)
    ) {
      throw new Error("지원하지 않는 첨부 파일입니다.");
    }
    if (
      !Number.isFinite(size) ||
      size <= 0 ||
      size > MAX_ROLE_CREATION_FILE_BYTES
    ) {
      throw new Error("파일은 10MB 이하여야 합니다.");
    }
    if (!content) {
      throw new Error("첨부 파일에 읽을 수 있는 텍스트가 없습니다.");
    }
    return {
      kind: "file" as const,
      mime: text(attachment.mime) || undefined,
      name,
      size,
      text: content.slice(0, MAX_ATTACHMENT_TEXT_CHARS),
      truncated:
        Boolean(attachment.truncated) ||
        content.length > MAX_ATTACHMENT_TEXT_CHARS,
    };
  });
}

function attachmentMetadata(
  attachments: ChatAttachmentPayload[]
): OrgAgentMessageAttachment[] {
  return attachments.map((attachment) => ({
    kind: attachment.kind,
    mime: attachment.mime,
    name: attachment.name,
    size: attachment.size,
    truncated: attachment.truncated,
    url: attachment.url,
  }));
}

function statusLabel(
  status: NonNullable<OrgAgentThinkingLog["status"]>,
  labels: { done: string; error: string; running: string }
) {
  return labels[status];
}

function toolLabel(
  name: string,
  status: NonNullable<OrgAgentThinkingLog["status"]>
) {
  if (name === "open_url") {
    return statusLabel(status, {
      done: "링크 확인 완료",
      error: "링크 확인 실패",
      running: "링크 읽는 중",
    });
  }
  if (name === "web_search") {
    return statusLabel(status, {
      done: "웹 확인 완료",
      error: "웹 확인 실패",
      running: "웹에서 확인하는 중",
    });
  }
  if (name === "research_role_description_sources") {
    return statusLabel(status, {
      done: "역할 설명 참고자료 확인 완료",
      error: "역할 설명 참고자료 확인 실패",
      running: "역할 설명 참고자료를 찾는 중",
    });
  }
  if (name === "read_other_roles") {
    return statusLabel(status, {
      done: "이전 역할 기준 확인 완료",
      error: "이전 역할 기준 확인 실패",
      running: "이전 역할 기준을 살펴보는 중",
    });
  }
  if (name === "set_role_notification") {
    return statusLabel(status, {
      done: "알림 채널과 담당자 반영 완료",
      error: "알림 채널과 담당자 반영 실패",
      running: "알림 채널과 담당자 반영 중",
    });
  }
  if (name === "request_role_creation_confirmation") {
    return statusLabel(status, {
      done: "완료 조건 확인 완료",
      error: "완료 조건 확인 실패",
      running: "완료 조건 확인 중",
    });
  }
  if (name === "confirm_pending_role_creation") {
    return statusLabel(status, {
      done: "역할 등록 완료",
      error: "역할 등록 실패",
      running: "역할 등록 중",
    });
  }
  if (name === "update_company_context") {
    return statusLabel(status, {
      done: "회사 정보 반영 완료",
      error: "회사 정보 반영 실패",
      running: "회사 정보 반영 중",
    });
  }
  return statusLabel(status, {
    done: "역할 정보 반영 완료",
    error: "역할 정보 반영 실패",
    running: "역할 정보 반영 중",
  });
}

function emitText(emit: RoleCreationChatEmitter | undefined, value: string) {
  for (let index = 0; index < value.length; index += 32) {
    emit?.("text_delta", { delta: value.slice(index, index + 32) });
  }
}

async function completion(args: {
  allowPendingConfirmation: boolean;
  allowTools: boolean;
  messages: LlmMessage[];
  model: OrgAgentModelId;
}) {
  return createChatCompletionWithFallback({
    anthropicOverloadFallbackModel: ORG_AGENT_GROK_MODEL,
    buildRequest: (model) => ({
      ...(usesMaxCompletionTokensForModel(model)
        ? { max_completion_tokens: ROLE_CREATION_MAX_OUTPUT_TOKENS }
        : { max_tokens: ROLE_CREATION_MAX_OUTPUT_TOKENS }),
      messages: args.messages,
      temperature: 0.15,
      ...(args.allowTools
        ? {
            tool_choice: "auto" as const,
            tools: args.allowPendingConfirmation
              ? ROLE_CREATION_TOOLS
              : ROLE_CREATION_TOOLS.filter(
                  (tool) =>
                    tool.function.name !== "confirm_pending_role_creation"
                ),
          }
        : {}),
    }),
    debugLabel: "org/agent:role-creation",
    deepSeekThinking: { reasoningEffort: "high" },
    fallbackModel: getOrgAgentFallbackModel(args.model),
    model: args.model,
    openAIResponses: { reasoningEffort: "high" },
  });
}

export async function generateRoleCreationOutcomeReply(args: {
  missingFields: string[];
  model?: OrgAgentModelId | string | null;
  outcome: "completed" | "declined" | "revalidation_failed";
  surface?: "chat" | "slack";
  state: RoleCreationState;
}) {
  const selectedModel = isOrgAgentModelId(args.model)
    ? args.model
    : resolveOrgAgentModel(DEFAULT_ORG_AGENT_MODEL).model;
  const result = await createChatCompletionWithFallback({
    anthropicOverloadFallbackModel: ORG_AGENT_GROK_MODEL,
    buildRequest: (model) => ({
      ...(usesMaxCompletionTokensForModel(model)
        ? { max_completion_tokens: ROLE_CREATION_MAX_OUTPUT_TOKENS }
        : { max_tokens: ROLE_CREATION_MAX_OUTPUT_TOKENS }),
      messages: [
        {
          content: buildRoleCreationSystemPrompt({ surface: args.surface }),
          role: "system" as const,
        },
        {
          content: buildRoleCreationOutcomePrompt({
            missingFields: args.missingFields,
            outcome: args.outcome,
            state: args.state,
          }),
          role: "user" as const,
        },
      ],
      temperature: 0.15,
    }),
    debugLabel: "org/agent:role-creation-outcome",
    deepSeekThinking: { reasoningEffort: "high" },
    fallbackModel: getOrgAgentFallbackModel(selectedModel),
    model: selectedModel,
    openAIResponses: { reasoningEffort: "high" },
  });
  const content = assistantText(getResponseMessage(result.response));
  if (!content) {
    throw new Error("Role creation outcome assistant returned no content");
  }
  return { content, model: result.model as OrgAgentModelId };
}

export async function runOrgRoleCreationChat(args: {
  assistantMessageMetadata?: OrgAgentMessageMetadata;
  attachments?: ChatAttachmentPayload[];
  draftRoleId?: string | null;
  emit?: RoleCreationChatEmitter;
  mentions?: OrgAgentMention[];
  llmUserMessage?: string;
  message: string;
  messageType?: string;
  messageUserId?: string | null;
  model?: OrgAgentModelId | string | null;
  roleId?: string | null;
  slackAssistantUserId?: string | null;
  slackThreadId?: string | null;
  slackUserId?: string | null;
  slackUserMessageTs?: string | null;
  surface?: "chat" | "slack";
  user: User;
  userMessageMetadata?: OrgAgentMessageMetadata;
  workspaceId: string;
}) {
  const attachments = validateAttachments(args.attachments);
  const requestedRoleId = text(args.roleId);
  const persistedMessage =
    text(args.message) ||
    (attachments.length > 0
      ? requestedRoleId
        ? "첨부한 자료를 바탕으로 역할 정보를 수정할게요."
        : "첨부한 자료를 바탕으로 새 역할 등록을 시작할게요."
      : "");
  if (!persistedMessage) throw new Error("메시지 또는 첨부 파일이 필요합니다.");
  const message = text(args.llmUserMessage) || persistedMessage;
  const surface = args.surface ?? (args.slackThreadId ? "slack" : "chat");

  let roleId = requestedRoleId;
  let created = false;
  if (!roleId) {
    roleId = await createOrResumeDraftRole({
      draftRoleId: text(args.draftRoleId),
      user: args.user,
      workspaceId: args.workspaceId,
    });
    created = true;
  }

  const state = await fetchRoleCreationState({
    allowCompletedRole: true,
    roleId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  if (created) args.emit?.("role_created", { roleId });

  const admin = getSupabaseAdmin();
  let mentions: OrgAgentMention[] = [];
  try {
    mentions = await filterOrgAgentMentionsForWorkspace({
      admin,
      mentions: args.mentions ?? [],
      user: args.user,
      workspaceId: args.workspaceId,
    });
  } catch (error) {
    console.warn("[org/agent:role-creation-mention-filter]", error);
  }

  const selectedModel = isOrgAgentModelId(args.model)
    ? args.model
    : resolveOrgAgentModel(DEFAULT_ORG_AGENT_MODEL).model;
  const userMetadata: OrgAgentMessageMetadata = {
    attachments: attachmentMetadata(attachments),
    roleCreationAttachments: attachments,
    ...args.userMessageMetadata,
    source:
      surface === "slack"
        ? "org_role_creation_slack_user"
        : "org_role_creation_user",
  };
  let userMessage =
    surface === "slack" && args.slackThreadId && args.slackUserMessageTs
      ? await findOrgAgentSlackUserMessage({
          adoptInto: {
            conversation: state.conversation,
            roleId,
            userId:
              args.messageUserId === undefined
                ? args.user.id
                : args.messageUserId,
          },
          admin,
          slackMessageTs: args.slackUserMessageTs,
          slackThreadId: args.slackThreadId,
          workspaceId: args.workspaceId,
        })
      : null;
  if (userMessage) {
    const mergedMetadata = { ...userMessage.metadata, ...userMetadata };
    const { error: metadataError } = await (
      admin.from("company_messages" as any) as any
    )
      .update({ metadata: mergedMetadata })
      .eq("id", userMessage.id);
    if (metadataError) throw metadataError;
    userMessage = { ...userMessage, metadata: mergedMetadata };
  } else {
    userMessage = await insertOrgAgentMessage({
      admin,
      content: persistedMessage,
      conversation: state.conversation,
      mentions,
      metadata: userMetadata,
      messageType: surface === "slack" ? "slack" : args.messageType,
      model: selectedModel,
      role: "user",
      roleId,
      slackMessageTs: args.slackUserMessageTs,
      slackThreadId: args.slackThreadId,
      slackUserId: args.slackUserId,
      userId:
        args.messageUserId === undefined ? args.user.id : args.messageUserId,
    });
  }
  args.emit?.("user_message", userMessage);

  const historyPage =
    surface === "slack" && args.slackThreadId
      ? await fetchRecentOrgAgentSlackThreadPromptMessages({
          admin,
          limit: 20,
          slackThreadId: args.slackThreadId,
          workspaceId: args.workspaceId,
        })
      : await fetchRecentOrgAgentPromptMessages({
          admin,
          conversationId: state.conversation.id,
          limit: 20,
          scope: { kind: "chat" },
        });
  const previousAssistantMessage =
    historyPage.messages
      .filter((item) => item.id !== userMessage.id && item.role === "assistant")
      .at(-1)?.content ?? "";
  const previousMessage = historyPage.messages
    .filter((item) => item.id !== userMessage.id)
    .at(-1);
  const pendingConfirmationMessageId =
    state.metadata.phase === "confirmation_pending"
      ? state.metadata.pendingConfirmationMessageId
      : null;
  const pendingConfirmationMessage =
    pendingConfirmationMessageId &&
    previousMessage?.id === pendingConfirmationMessageId &&
    previousMessage.role === "assistant"
      ? previousMessage
      : null;
  const pendingConfirmationChoice =
    pendingConfirmationMessage?.metadata.roleCreation?.choices?.find(
      (choice) => choice.value === "yes" && choice.status === "pending"
    ) ?? null;
  const canConfirmPendingRole =
    attachments.length === 0 && Boolean(pendingConfirmationChoice);
  const messages: LlmMessage[] = [
    {
      content: buildRoleCreationSystemPrompt({
        editingRegisteredRole: state.role.status !== "draft",
        surface,
      }),
      role: "system",
    },
    {
      content: buildRoleCreationUserPrompt({
        attachments,
        history: historyPage.messages
          .filter((item) => item.id !== userMessage.id)
          .map((item) => ({
            attachments: item.metadata.roleCreationAttachments,
            content: item.content,
            role: item.role,
          })),
        mentions,
        state,
        userMessage: message,
      }),
      role: "user",
    },
  ];

  let activeModel = selectedModel;
  let totalCalls = 0;
  let reply = "";
  let lastAssistantText = "";
  let confirmationRequested = false;
  let pendingConfirmationAccepted = false;
  let confirmationNarrativeGenerated = false;
  let confirmationState: Awaited<
    ReturnType<typeof fetchRoleCreationState>
  > | null = null;
  const updateSummaries: string[] = [];
  let logs: OrgAgentThinkingLog[] = [];
  const toolResults: NonNullable<OrgAgentMessageMetadata["toolResults"]> = [];

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
    const result = await completion({
      allowPendingConfirmation: canConfirmPendingRole,
      allowTools: !confirmationRequested,
      messages,
      model: activeModel,
    });
    activeModel = result.model as OrgAgentModelId;
    const responseMessage = getResponseMessage(result.response);
    const responseText = assistantText(responseMessage);
    if (responseText) lastAssistantText = responseText;
    const calls = toolCalls(responseMessage);
    if (calls.length === 0) {
      reply = responseText;
      confirmationNarrativeGenerated = confirmationRequested && Boolean(reply);
      break;
    }
    messages.push({
      content: responseText,
      role: "assistant",
      tool_calls: calls,
    });

    for (const call of calls) {
      if (totalCalls >= MAX_TOOL_CALLS) {
        messages.push({
          content: JSON.stringify({ error: "tool_budget_reached" }),
          role: "tool",
          tool_call_id: call.id,
        });
        continue;
      }
      totalCalls += 1;
      const startedLog = {
        at: new Date().toISOString(),
        id: call.id,
        label: toolLabel(call.function.name, "running"),
        status: "running" as const,
      };
      logs = upsertOrgAgentThinkingLog(logs, startedLog);
      args.emit?.("tool_status", startedLog);
      try {
        if (!isRoleCreationToolName(call.function.name)) {
          throw new Error("Unknown role creation tool");
        }
        if (
          call.function.name === "confirm_pending_role_creation" &&
          calls.length !== 1
        ) {
          throw new Error(
            "Final role confirmation must be the only tool call in this turn"
          );
        }
        const execution = await executeRoleCreationTool({
          actorLabel: state.currentUser.name,
          allowCompletedRole: true,
          input: parseArguments(call.function.arguments),
          name: call.function.name,
          previousAssistantMessage,
          roleId,
          user: args.user,
          userMessage: message,
          workspaceId: args.workspaceId,
        });
        if (execution.updateSummary) {
          updateSummaries.push(execution.updateSummary);
        }
        confirmationRequested =
          confirmationRequested || Boolean(execution.confirmationRequested);
        pendingConfirmationAccepted =
          pendingConfirmationAccepted ||
          Boolean(
            "confirmationAccepted" in execution &&
              execution.confirmationAccepted
          );
        const doneLog = {
          at: new Date().toISOString(),
          id: call.id,
          label: toolLabel(call.function.name, "done"),
          status: "done" as const,
        };
        logs = upsertOrgAgentThinkingLog(logs, doneLog);
        args.emit?.("tool_status", doneLog);
        toolResults.push({
          callId: call.id,
          name: call.function.name,
          status: "success",
          summary: execution.updateSummary ?? doneLog.label,
        });
        messages.push({
          content: JSON.stringify(execution.result),
          role: "tool",
          tool_call_id: call.id,
        });
      } catch (error) {
        const failedLog = {
          at: new Date().toISOString(),
          id: call.id,
          label: toolLabel(call.function.name, "error"),
          status: "error" as const,
        };
        logs = upsertOrgAgentThinkingLog(logs, failedLog);
        args.emit?.("tool_status", failedLog);
        toolResults.push({
          callId: call.id,
          name: call.function.name,
          status: "error",
          summary: failedLog.label,
        });
        messages.push({
          content: JSON.stringify({
            error: error instanceof Error ? error.message : "tool_failed",
            ok: false,
          }),
          role: "tool",
          tool_call_id: call.id,
        });
      }
      if (confirmationRequested || pendingConfirmationAccepted) break;
    }
    if (pendingConfirmationAccepted) break;
  }

  if (
    pendingConfirmationAccepted &&
    pendingConfirmationMessage &&
    pendingConfirmationChoice
  ) {
    const { confirmRoleCreationChoice } = await import(
      "@/lib/org/agent/roleCreationConfirmation"
    );
    const confirmed = await confirmRoleCreationChoice({
      actionId: pendingConfirmationChoice.actionId,
      assistantMessageMetadata: args.assistantMessageMetadata,
      confirmationUserMessage: userMessage,
      decision: "yes",
      messageId: pendingConfirmationMessage.id,
      messageType: surface === "slack" ? "slack" : "chat",
      roleId,
      slackAssistantUserId: args.slackAssistantUserId,
      slackThreadId: args.slackThreadId,
      slackUserId: args.slackUserId,
      user: args.user,
      workspaceId: args.workspaceId,
    });
    if (!confirmed.assistantMessage) {
      throw new Error("Role creation completed without an assistant reply");
    }
    emitText(args.emit, confirmed.assistantMessage.content);
    args.emit?.("assistant_message", confirmed.assistantMessage);
    return {
      assistantMessage: confirmed.assistantMessage,
      conversationId: state.conversation.id,
      kind: "message" as const,
      model: activeModel,
      roleId,
      userMessage,
    };
  }

  const actionId = confirmationRequested ? crypto.randomUUID() : null;
  if (confirmationRequested) {
    confirmationState = await fetchRoleCreationState({
      allowCompletedRole: true,
      roleId,
      user: args.user,
      workspaceId: args.workspaceId,
    });
    if (!confirmationNarrativeGenerated) {
      const result = await completion({
        allowPendingConfirmation: false,
        allowTools: false,
        messages,
        model: activeModel,
      });
      activeModel = result.model as OrgAgentModelId;
      reply = assistantText(getResponseMessage(result.response));
      if (reply) lastAssistantText = reply;
    }
  }
  reply ||= lastAssistantText;
  if (!reply) {
    throw new Error("Role creation assistant returned no content");
  }
  if (surface === "slack" && confirmationRequested) {
    reply = `${reply}\n\n[예](button:이 역할을 지금 최종 등록합니다.) [아니오](button:이 역할은 아직 등록하지 않고 내용을 더 수정합니다.)`;
  }
  emitText(args.emit, reply);

  const metadata: OrgAgentMessageMetadata = {
    ...(updateSummaries.length > 0
      ? {
          actions: updateSummaries.map((summary) => ({
            id: crypto.randomUUID(),
            kind: "entity_updated" as const,
            label: summary,
            payload: { changeSummary: summary, scope: "role" as const },
            status: "idle" as const,
          })),
        }
      : {}),
    model: activeModel,
    source: "org_role_creation_assistant",
    ...args.assistantMessageMetadata,
    ...(toolResults.length > 0 && { toolResults }),
    ...(confirmationRequested && actionId
      ? {
          roleCreation: {
            choices: [
              {
                actionId,
                kind: "role_creation_confirmation" as const,
                label: "예",
                status: "pending" as const,
                value: "yes" as const,
              },
              {
                actionId,
                kind: "role_creation_confirmation" as const,
                label:
                  "아니오 : 채팅에서 바로 추가로 알려주고 싶은 사항을 작성하셔도 됩니다.",
                status: "pending" as const,
                value: "no" as const,
              },
            ],
            confirmationPrompt: reply,
            roleId,
          },
        }
      : {}),
  };
  const assistantMessage = await insertOrgAgentMessage({
    admin,
    content: reply,
    conversation: state.conversation,
    metadata,
    model: activeModel,
    messageType: surface === "slack" ? "slack" : args.messageType,
    role: "assistant",
    roleId,
    slackThreadId: args.slackThreadId,
    slackUserId: args.slackAssistantUserId,
    thinkingLogs: logs.slice(-20),
  });
  if (confirmationRequested) {
    await updateRoleCreationConversationMetadata({
      admin,
      conversationId: state.conversation.id,
      current:
        confirmationState?.conversation.metadata ?? state.conversation.metadata,
      patch: {
        pendingConfirmationMessageId: assistantMessage.id,
        phase: "confirmation_pending",
      },
    });
  }
  args.emit?.("assistant_message", assistantMessage);
  return {
    assistantMessage,
    conversationId: state.conversation.id,
    kind: "message" as const,
    model: activeModel,
    roleId,
    userMessage,
  };
}
