import "server-only";

import type { User } from "@supabase/supabase-js";
import { after } from "next/server";
import {
  createChatCompletionWithFallback,
  usesMaxCompletionTokensForModel,
} from "@/lib/llm/llm";
import {
  DEFAULT_ORG_AGENT_REASONING_EFFORT,
  DEFAULT_ORG_AGENT_MODEL,
  getOrgAgentFallbackModel,
  ORG_AGENT_GROK_MODEL,
  ORG_AGENT_TERRA_MODEL,
  isOrgAgentModelId,
  resolveOrgAgentModel,
  type OrgAgentModelId,
  type OrgAgentReasoningEffort,
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
  fetchRecentOrgAgentSummaries,
  findOrgAgentSlackUserMessage,
  insertOrgAgentMessage,
} from "@/lib/org/agent/store";
import { maybeSummarizeOrgAgentConversation } from "@/lib/org/agent/summary";
import {
  getOrgAgentThinkingLogIcon,
  upsertOrgAgentThinkingLog,
} from "@/lib/org/agent/thinkingLogs";
import { filterOrgAgentMentionsForWorkspace } from "@/lib/org/agent/context";
import type {
  OrgAgentMention,
  OrgAgentMessage,
  OrgAgentMessageMetadata,
  OrgAgentThinkingLog,
} from "@/lib/org/agent/types";
import type { ChatAttachmentPayload } from "@/types/chat";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  referenceAttachmentMetadata,
  validateOrgAgentReferenceAttachments,
} from "@/lib/org/agent/referenceAttachments";
import { ensureOrgAgentCompanyInfoMarker } from "@/lib/org/agent/companyInfoMarker";
import {
  buildServiceAnswerExamplesPromptBlock,
  lookupAnswerExamples,
} from "@/lib/serviceAnswerExamples";
import { OrgHttpError } from "@/lib/org/server";

function scheduleRoleCreationSummary(
  args: Parameters<typeof maybeSummarizeOrgAgentConversation>[0]
) {
  const task = () => maybeSummarizeOrgAgentConversation(args);
  try {
    after(task);
  } catch {
    void task();
  }
}

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
  _responses_output?: any[];
  content: string;
  role: "assistant" | "system" | "tool" | "user";
  tool_call_id?: string;
  tool_calls?: LlmToolCall[];
};

const MAX_TOOL_LOOPS = 10;
const MAX_TOOL_CALLS = 10;
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

class RoleCreationToolInputError extends Error {}

function parseArguments(value: string) {
  try {
    const parsed = JSON.parse(value || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new RoleCreationToolInputError("Tool arguments must be an object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RoleCreationToolInputError) throw error;
    throw new RoleCreationToolInputError("Tool arguments are not valid JSON");
  }
}

function roleCreationToolErrorResult(args: { error: unknown; name: string }) {
  const inputError =
    args.error instanceof RoleCreationToolInputError ||
    (args.error instanceof OrgHttpError && args.error.status < 500);
  const message =
    inputError && args.error instanceof Error
      ? args.error.message
      : "The tool could not be completed.";
  const recovery =
    args.name === "confirm_pending_role_creation"
      ? "Do not claim the Role was activated. If the result is uncertain, do not activate again until the current Role status is verified; otherwise explain the missing or stale confirmation and ask for the smallest necessary next action."
      : args.name === "calibrate_role_hiring_brief"
        ? inputError
          ? "Correct missing reference evidence and retry once when useful. Otherwise explain what evidence is missing and ask at most one focused question."
          : "The saved Hiring Brief may have changed. Do not immediately repeat calibration or claim it succeeded; explain the uncertainty and ask the user to retry after the current Role state can be refreshed."
        : inputError
          ? "Correct the arguments from the saved Role state and retry when the user's intent is still clear. Continue any independent unfinished part of the request."
          : "Do not claim the save or external effect succeeded and do not blindly repeat the action. Use the next step to verify current saved state when possible, continue independent work, or explain the blocker.";
  return JSON.stringify({
    effectStatus: inputError ? "not_executed" : "unknown",
    error: message,
    instruction: `${recovery} Write user-facing explanations without tool names or internal diagnostics.`,
    ok: false,
  });
}

function deferredRoleCreationToolResult() {
  return JSON.stringify({
    executed: false,
    instruction:
      "Review the first tool result. If this action is still needed and authorized, request it again as the next single tool call. Do not claim it ran.",
    reason:
      "Only one tool is executed per reasoning step so its result can inform the next decision.",
    status: "deferred",
  });
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
      done: "웹 검색 완료",
      error: "웹 검색 실패",
      running: "웹 검색 중",
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
  if (name === "calibrate_role_hiring_brief") {
    return statusLabel(status, {
      done: "Hiring Brief 기준 정리 완료",
      error: "Hiring Brief 기준 정리 실패",
      running: "참고 인물을 바탕으로 Hiring Brief를 정리하는 중",
    });
  }
  if (name === "set_role_notification") {
    return statusLabel(status, {
      done: "알림 설정 저장 완료",
      error: "알림 설정 저장 실패",
      running: "알림 설정 저장 중",
    });
  }
  if (name === "request_role_creation_confirmation") {
    return statusLabel(status, {
      done: "등록 조건 확인 완료",
      error: "등록 조건 확인 실패",
      running: "등록 조건 확인 중",
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
      done: "회사 정보 저장 완료",
      error: "회사 정보 저장 실패",
      running: "회사 정보 저장 중",
    });
  }
  return statusLabel(status, {
    done: "역할 정보 저장 완료",
    error: "역할 정보 저장 실패",
    running: "역할 정보 저장 중",
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
  reasoningEffort?: OrgAgentReasoningEffort;
  strictModel?: boolean;
}) {
  const maxTokens =
    args.reasoningEffort === "max"
      ? Math.max(ROLE_CREATION_MAX_OUTPUT_TOKENS, 12_000)
      : ROLE_CREATION_MAX_OUTPUT_TOKENS;
  return createChatCompletionWithFallback({
    ...(args.strictModel
      ? {}
      : { anthropicOverloadFallbackModel: ORG_AGENT_GROK_MODEL }),
    buildRequest: (model) => ({
      ...(usesMaxCompletionTokensForModel(model)
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
      messages: args.messages,
      temperature: 0.15,
      ...(args.allowTools
        ? {
            parallel_tool_calls: false,
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
    ...(args.strictModel
      ? {}
      : { fallbackModel: getOrgAgentFallbackModel(args.model) }),
    model: args.model,
    openAIResponses: {
      reasoningEffort:
        args.reasoningEffort ?? DEFAULT_ORG_AGENT_REASONING_EFFORT,
    },
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
    openAIResponses: {
      reasoningEffort: DEFAULT_ORG_AGENT_REASONING_EFFORT,
    },
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
  const attachments = validateOrgAgentReferenceAttachments(args.attachments);
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
  const serviceAnswerExamplesPromise = lookupAnswerExamples(message, {
    audience: "company",
  });
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
    attachments: referenceAttachmentMetadata(attachments),
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
          limit: 25,
          slackThreadId: args.slackThreadId,
          workspaceId: args.workspaceId,
        })
      : await fetchRecentOrgAgentPromptMessages({
          admin,
          conversationId: state.conversation.id,
          limit: 25,
          scope: { kind: "chat" },
        });
  const summaries = await fetchRecentOrgAgentSummaries({
    admin,
    conversationId: state.conversation.id,
    limit: 1,
    scope:
      surface === "slack" && args.slackThreadId
        ? { kind: "slack", slackThreadId: args.slackThreadId }
        : { kind: "chat" },
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
  const serviceAnswerExamples = await serviceAnswerExamplesPromise;
  const serviceAnswerExamplesText = buildServiceAnswerExamplesPromptBlock({
    audience: "company",
    examples: serviceAnswerExamples.examples,
  });
  const companySideUserPrompt = buildRoleCreationUserPrompt({
    attachments,
    history: historyPage.messages
      .filter((item) => item.id !== userMessage.id)
      .map((item) => ({
        attachments: item.metadata.roleCreationAttachments,
        content: item.content,
        role: item.role,
      })),
    olderSummary: summaries.at(-1)?.content ?? null,
    mentions,
    serviceAnswerExamplesText,
    state,
    userMessage: message,
  });
  const messages: LlmMessage[] = [
    {
      content: buildRoleCreationSystemPrompt({
        editingRegisteredRole: state.role.status !== "draft",
        surface,
      }),
      role: "system",
    },
    {
      content: companySideUserPrompt,
      role: "user",
    },
  ];

  let activeModel = selectedModel;
  let activeReasoningEffort: OrgAgentReasoningEffort =
    DEFAULT_ORG_AGENT_REASONING_EFFORT;
  let calibrationCompleted = false;
  let totalCalls = 0;
  let reply = "";
  let lastAssistantText = "";
  let confirmationRequested = false;
  let pendingConfirmationAccepted = false;
  let confirmationNarrativeGenerated = false;
  let companyInfoDescriptionUpdated = false;
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
      reasoningEffort: activeReasoningEffort,
      strictModel: calibrationCompleted,
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
      _responses_output: Array.isArray(responseMessage._responses_output)
        ? responseMessage._responses_output
        : undefined,
      content: responseText,
      role: "assistant",
      tool_calls: calls,
    });

    const deferredCalls = calls.slice(1);
    for (const call of calls.slice(0, 1)) {
      if (totalCalls >= MAX_TOOL_CALLS) {
        messages.push({
          content: JSON.stringify({
            error: "tool_budget_reached",
            executed: false,
            instruction:
              "Explain completed and incomplete work without claiming this action ran.",
            ok: false,
          }),
          role: "tool",
          tool_call_id: call.id,
        });
        continue;
      }
      totalCalls += 1;
      const startedLog = {
        at: new Date().toISOString(),
        id: call.id,
        icon: getOrgAgentThinkingLogIcon(call.function.name),
        label: toolLabel(call.function.name, "running"),
        status: "running" as const,
      };
      logs = upsertOrgAgentThinkingLog(logs, startedLog);
      args.emit?.("tool_status", startedLog);
      try {
        if (!isRoleCreationToolName(call.function.name)) {
          throw new RoleCreationToolInputError("Unknown role creation tool");
        }
        const toolInput = parseArguments(call.function.arguments);
        const execution = await executeRoleCreationTool({
          actorLabel: state.currentUser.name,
          allowCompletedRole: true,
          companySideContext: companySideUserPrompt,
          input: toolInput,
          name: call.function.name,
          onToolProgress: (label) => {
            const progressLog = {
              at: new Date().toISOString(),
              id: call.id,
              icon: getOrgAgentThinkingLogIcon(call.function.name),
              label,
              status: "running" as const,
            };
            logs = upsertOrgAgentThinkingLog(logs, progressLog);
            args.emit?.("tool_status", progressLog);
          },
          previousAssistantMessage,
          readAudience: surface === "slack" ? "company_safe" : "caller",
          referenceAttachments: attachments,
          roleId,
          user: args.user,
          userMessage: message,
          workspaceId: args.workspaceId,
        });
        if (execution.updateSummary) {
          updateSummaries.push(execution.updateSummary);
        }
        if (
          surface === "slack" &&
          call.function.name === "update_role_draft" &&
          Object.prototype.hasOwnProperty.call(toolInput, "description") &&
          text(toolInput.description) &&
          text(state.workspace.pitch)
        ) {
          companyInfoDescriptionUpdated = true;
        }
        if (call.function.name === "calibrate_role_hiring_brief") {
          activeModel = ORG_AGENT_TERRA_MODEL;
          activeReasoningEffort = "max";
          calibrationCompleted = true;
          const calibrationReply =
            "userReply" in execution.result
              ? text(execution.result.userReply)
              : "";
          if (calibrationReply) lastAssistantText = calibrationReply;
        }
        confirmationRequested =
          confirmationRequested || Boolean(execution.confirmationRequested);
        pendingConfirmationAccepted =
          pendingConfirmationAccepted ||
          Boolean(
            "confirmationAccepted" in execution &&
            execution.confirmationAccepted
          );
        const executionResult = record(execution.result);
        const executionStatus =
          executionResult.ok === false ||
          executionResult.status === "needs_more_information"
            ? ("unchanged" as const)
            : ("success" as const);
        const doneLog = {
          at: new Date().toISOString(),
          id: call.id,
          icon: getOrgAgentThinkingLogIcon(call.function.name),
          label: toolLabel(call.function.name, "done"),
          status: "done" as const,
        };
        logs = upsertOrgAgentThinkingLog(logs, doneLog);
        args.emit?.("tool_status", doneLog);
        toolResults.push({
          callId: call.id,
          name: call.function.name,
          status: executionStatus,
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
          icon: getOrgAgentThinkingLogIcon(call.function.name),
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
          content: roleCreationToolErrorResult({
            error,
            name: call.function.name,
          }),
          role: "tool",
          tool_call_id: call.id,
        });
      }
      if (confirmationRequested || pendingConfirmationAccepted) break;
    }
    for (const deferredCall of deferredCalls) {
      messages.push({
        content: deferredRoleCreationToolResult(),
        role: "tool",
        tool_call_id: deferredCall.id,
      });
    }
    if (pendingConfirmationAccepted) break;
  }

  if (!pendingConfirmationAccepted && !confirmationRequested && !reply) {
    const result = await completion({
      allowPendingConfirmation: false,
      allowTools: false,
      messages: [
        ...messages,
        {
          content:
            "Tool use is finished for this turn. Explain what was completed, what remains incomplete, and the most useful next step. Do not claim an unverified save or activation.",
          role: "user",
        },
      ],
      model: activeModel,
      reasoningEffort: activeReasoningEffort,
      strictModel: calibrationCompleted,
    });
    activeModel = result.model as OrgAgentModelId;
    reply = assistantText(getResponseMessage(result.response));
    if (reply) lastAssistantText = reply;
  }

  if (
    pendingConfirmationAccepted &&
    pendingConfirmationMessage &&
    pendingConfirmationChoice
  ) {
    const { confirmRoleCreationChoice } =
      await import("@/lib/org/agent/roleCreationConfirmation");
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
    scheduleRoleCreationSummary({
      admin,
      conversation: state.conversation,
      model: activeModel,
      slackThreadId: args.slackThreadId ?? null,
    });
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
        reasoningEffort: activeReasoningEffort,
        strictModel: calibrationCompleted,
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
  if (companyInfoDescriptionUpdated) {
    reply = ensureOrgAgentCompanyInfoMarker(reply);
  }
  if (surface === "slack" && confirmationRequested) {
    reply = `${reply}\n\n[Create role](button:이 역할을 지금 등록해 주세요.) [Keep editing](button:이 역할은 아직 등록하지 않고 더 수정할게요.)`;
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
                label: "Create role",
                status: "pending" as const,
                value: "yes" as const,
              },
              {
                actionId,
                kind: "role_creation_confirmation" as const,
                label: "Keep editing",
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
  scheduleRoleCreationSummary({
    admin,
    conversation: state.conversation,
    model: activeModel,
    slackThreadId: args.slackThreadId ?? null,
  });
  return {
    assistantMessage,
    conversationId: state.conversation.id,
    kind: "message" as const,
    model: activeModel,
    roleId,
    userMessage,
  };
}
