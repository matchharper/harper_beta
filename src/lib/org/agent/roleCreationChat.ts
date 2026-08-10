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
  fetchRecentOrgAgentPromptMessages,
  insertOrgAgentMessage,
} from "@/lib/org/agent/store";
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

function toolLabel(name: string) {
  if (name === "open_url") return "링크 읽는 중";
  if (name === "web_search") return "웹에서 확인하는 중";
  if (name === "read_other_roles") return "이전 역할 기준을 살펴보는 중";
  if (name === "set_role_notification") return "알림 채널과 담당자 반영 중";
  if (name === "request_role_creation_confirmation") {
    return "완료 조건 확인 중";
  }
  return name === "update_company_context"
    ? "회사 정보 반영 중"
    : "역할 정보 반영 중";
}

function emitText(emit: RoleCreationChatEmitter | undefined, value: string) {
  for (let index = 0; index < value.length; index += 32) {
    emit?.("text_delta", { delta: value.slice(index, index + 32) });
  }
}

async function completion(args: {
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
        ? { tool_choice: "auto" as const, tools: ROLE_CREATION_TOOLS }
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
        { content: buildRoleCreationSystemPrompt(), role: "system" as const },
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
  attachments?: ChatAttachmentPayload[];
  draftRoleId?: string | null;
  emit?: RoleCreationChatEmitter;
  mentions?: OrgAgentMention[];
  message: string;
  model?: OrgAgentModelId | string | null;
  roleId?: string | null;
  user: User;
  workspaceId: string;
}) {
  const attachments = validateAttachments(args.attachments);
  const requestedRoleId = text(args.roleId);
  const message =
    text(args.message) ||
    (attachments.length > 0
      ? requestedRoleId
        ? "첨부한 자료를 바탕으로 역할 정보를 수정할게요."
        : "첨부한 자료를 바탕으로 새 역할 등록을 시작할게요."
      : "");
  if (!message) throw new Error("메시지 또는 첨부 파일이 필요합니다.");

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
  const userMessage = await insertOrgAgentMessage({
    admin,
    content: message,
    conversation: state.conversation,
    mentions,
    metadata: {
      attachments: attachmentMetadata(attachments),
      roleCreationAttachments: attachments,
      source: "org_role_creation_user",
    },
    model: selectedModel,
    role: "user",
    roleId,
    userId: args.user.id,
  });
  args.emit?.("user_message", userMessage);

  const historyPage = await fetchRecentOrgAgentPromptMessages({
    admin,
    conversationId: state.conversation.id,
    limit: 20,
    scope: { kind: "chat" },
  });
  const previousAssistantMessage =
    historyPage.messages
      .filter((item) => item.id !== userMessage.id && item.role === "assistant")
      .at(-1)?.content ?? "";
  const messages: LlmMessage[] = [
    {
      content: buildRoleCreationSystemPrompt({
        editingRegisteredRole: state.role.status !== "draft",
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
  let confirmationNarrativeGenerated = false;
  let confirmationState: Awaited<
    ReturnType<typeof fetchRoleCreationState>
  > | null = null;
  const updateSummaries: string[] = [];
  const logs: OrgAgentThinkingLog[] = [];

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
    const result = await completion({
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
      const label = toolLabel(call.function.name);
      const startedLog = {
        at: new Date().toISOString(),
        label,
        status: "running" as const,
      };
      logs.push(startedLog);
      args.emit?.("tool_status", startedLog);
      try {
        if (!isRoleCreationToolName(call.function.name)) {
          throw new Error("Unknown role creation tool");
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
        const doneLog = {
          at: new Date().toISOString(),
          label,
          status: "done" as const,
        };
        logs.push(doneLog);
        args.emit?.("tool_status", doneLog);
        messages.push({
          content: JSON.stringify(execution.result),
          role: "tool",
          tool_call_id: call.id,
        });
      } catch (error) {
        const failedLog = {
          at: new Date().toISOString(),
          label,
          status: "error" as const,
        };
        logs.push(failedLog);
        args.emit?.("tool_status", failedLog);
        messages.push({
          content: JSON.stringify({
            error: error instanceof Error ? error.message : "tool_failed",
            ok: false,
          }),
          role: "tool",
          tool_call_id: call.id,
        });
      }
      if (confirmationRequested) break;
    }
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
    role: "assistant",
    roleId,
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
