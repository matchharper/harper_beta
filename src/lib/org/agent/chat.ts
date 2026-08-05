import type { User } from "@supabase/supabase-js";
import {
  createChatCompletionWithFallback,
  getLlmErrorMessage,
  usesMaxCompletionTokensForModel,
  type ChatCompletionFallbackReason,
} from "@/lib/llm/llm";
import { extractLlmTokenUsage } from "@/lib/llm/usageLogging";
import {
  DEFAULT_ORG_AGENT_MODEL,
  getOrgAgentFallbackModel,
  ORG_AGENT_GROK_MODEL,
  isOrgAgentModelId,
  resolveOrgAgentModel,
  type OrgAgentModelId,
} from "@/lib/org/agent/modelConfig";
import {
  buildOrgAgentPromptContext,
  filterOrgAgentMentionsForWorkspace,
} from "@/lib/org/agent/context";
import {
  buildOrgAgentSystemPrompt,
  buildOrgAgentUserPrompt,
} from "@/lib/org/agent/prompts";
import {
  serializeOrgAgentToolError,
  serializeOrgAgentToolResult,
} from "@/lib/org/agent/promptFormat";
import {
  findNewOrgAgentInternalArtifacts,
  guardOrgAgentCandidatePrivacyReply,
  replaceNewOrgAgentInternalTokens,
} from "@/lib/org/agent/responseGuard";
import { maybeSummarizeOrgAgentConversation } from "@/lib/org/agent/summary";
import {
  ensureOrgAgentConversation,
  insertOrgAgentMessage,
  toOrgAgentMessage,
  type OrgAgentMessageRow,
} from "@/lib/org/agent/store";
import {
  createOrgAgentToolExecutionState,
  executeOrgAgentTool,
  getOrgAgentToolStatusLabel,
  OrgAgentToolInputError,
  promoteOrgAgentToolReadVisibility,
  type OrgAgentToolExecutionState,
} from "@/lib/org/agent/toolExecution";
import {
  getEnabledOrgAgentTools,
  isOrgAgentTerminalToolName,
  isOrgAgentToolName,
} from "@/lib/org/agent/tools";
import { getOrgAgentToolCompletionMaxTokens } from "@/lib/org/agent/toolCompletionBudget";
import { fitOrgAgentToolResultToBudget } from "@/lib/org/agent/toolResultBudget";
import { enforceOrgAgentTerminalMutationOutcome } from "@/lib/org/agent/toolState";
import type {
  OrgAgentMention,
  OrgAgentMessage,
  OrgAgentMessageMetadata,
  OrgAgentThinkingLog,
} from "@/lib/org/agent/types";
import { OrgHttpError } from "@/lib/org/server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export type OrgAgentChatEventName =
  | "assistant_message"
  | "done"
  | "error"
  | "text_delta"
  | "tool_status"
  | "user_message";

export type OrgAgentChatEmitter = (
  event: OrgAgentChatEventName,
  data: unknown
) => void;

export type OrgAgentChatResult =
  | {
      assistantMessage: OrgAgentMessage;
      conversationId: string;
      kind: "message";
      model: OrgAgentModelId | string;
      userMessage: OrgAgentMessage;
    }
  | {
      conversationId: string;
      kind: "slack_proposal_draft";
      model: OrgAgentModelId | string;
      presentationText: string;
      proposalId: string;
      userMessage: OrgAgentMessage;
    };

type OrgAgentLlmToolCall = {
  function: {
    arguments: string;
    name: string;
  };
  id: string;
  type: "function";
};

type OrgAgentLlmMessage = {
  _responses_output?: any[];
  content: string;
  name?: string;
  role: "assistant" | "system" | "tool" | "user";
  tool_call_id?: string;
  tool_calls?: OrgAgentLlmToolCall[];
};

// A normal multi-step turn is search -> read -> update -> final answer.
const MAX_TOOL_LOOPS = 4;
const MAX_TOTAL_TOOL_CALLS = 5;
const MAX_TOTAL_TOOL_RESULT_CHARS = 48_000;
const TOOL_FREE_FINAL_MAX_TOKENS = 2_000;
type OrgAgentTurnUsage = NonNullable<OrgAgentMessageMetadata["llmUsage"]>;

function createTurnUsage(): OrgAgentTurnUsage {
  return {
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    completionCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
}

function addCompletionUsage(usage: OrgAgentTurnUsage, response: any) {
  const current = extractLlmTokenUsage(response);
  usage.cacheCreationInputTokens += current.cacheCreationInputTokens ?? 0;
  usage.cacheReadInputTokens += current.cacheReadInputTokens ?? 0;
  usage.completionCount += 1;
  usage.inputTokens += current.inputTokens ?? 0;
  usage.outputTokens += current.outputTokens ?? 0;
  usage.totalTokens += current.totalTokens ?? 0;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function chunkText(text: string) {
  const chunks: string[] = [];
  let index = 0;
  while (index < text.length) {
    const next = Math.min(text.length, index + 24);
    chunks.push(text.slice(index, next));
    index = next;
  }
  return chunks;
}

function nowLog(label: string, status: OrgAgentThinkingLog["status"]) {
  return {
    at: new Date().toISOString(),
    label,
    status,
  } satisfies OrgAgentThinkingLog;
}

function getVisibleErrorMessage(error: unknown) {
  const detail = getLlmErrorMessage(error);
  if (process.env.NODE_ENV !== "production" && detail) return detail;
  return "지금은 에이전트 응답을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function extractAssistantText(message: any) {
  if (typeof message?.content === "string") {
    return normalizeText(message.content);
  }
  if (!Array.isArray(message?.content)) return "";
  return normalizeText(
    message.content
      .map((item: any) =>
        typeof item?.text === "string"
          ? item.text
          : typeof item?.content === "string"
            ? item.content
            : ""
      )
      .join("")
  );
}

function normalizeToolCalls(message: any): OrgAgentLlmToolCall[] {
  if (!Array.isArray(message?.tool_calls)) return [];
  return message.tool_calls.map((toolCall: any) => {
    const rawArguments = toolCall?.function?.arguments;
    return {
      function: {
        arguments:
          typeof rawArguments === "string"
            ? rawArguments
            : JSON.stringify(rawArguments ?? {}),
        name: normalizeText(toolCall?.function?.name),
      },
      id: normalizeText(toolCall?.id) || `org_tool_${crypto.randomUUID()}`,
      type: "function" as const,
    };
  });
}

function parseToolArguments(rawArguments: string) {
  try {
    const parsed = rawArguments ? JSON.parse(rawArguments) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new OrgAgentToolInputError("tool arguments must be an object");
  } catch (error) {
    if (error instanceof OrgAgentToolInputError) throw error;
    throw new OrgAgentToolInputError("tool arguments are not valid JSON");
  }
}

function buildFallbackReply(state: OrgAgentToolExecutionState) {
  if (state.terminalReply) return state.terminalReply;
  if (state.stagedProposal) {
    return `알겠습니다. ${state.stagedProposal.summary} 내용을 아래와 같이 수정할까요?`;
  }
  const updates = state.updateSummaries;
  if (updates.length === 1) {
    return `반영했습니다. ${updates[0]}`;
  }
  if (updates.length > 1) {
    return "요청하신 변경 사항을 모두 반영했습니다.";
  }
  return "요청을 처리하려면 대상 포지션이나 후보자를 조금 더 구체적으로 알려주세요.";
}

function clipCharacters(value: string, maxLength: number) {
  const characters = Array.from(value);
  return characters.length <= maxLength
    ? value
    : `${characters.slice(0, Math.max(0, maxLength - 1)).join("")}…`;
}

function restoreLongTextVisibility(args: {
  completeTargets: Set<string>;
  observedFingerprints: Map<string, string>;
  pendingRoleRequestIds: Set<string>;
  state: OrgAgentToolExecutionState;
}) {
  args.state.completeLongTextTargets.clear();
  for (const target of args.completeTargets) {
    args.state.completeLongTextTargets.add(target);
  }
  args.state.observedLongTextFingerprints.clear();
  for (const [target, fingerprint] of args.observedFingerprints) {
    args.state.observedLongTextFingerprints.set(target, fingerprint);
  }
  args.state.pendingFullRoleRequestIds.clear();
  for (const roleId of args.pendingRoleRequestIds) {
    args.state.pendingFullRoleRequestIds.add(roleId);
  }
}

function appendRequiredPresentation(args: {
  reply: string;
  requiredText: string | null;
}) {
  if (!args.requiredText) return args.reply;
  if (args.reply.includes(args.requiredText)) return args.reply;
  return `${clipCharacters(args.reply, 2_000)}\n\n${args.requiredText}`.trim();
}

function buildProposalPresentation(args: {
  preview: string;
  reply: string;
  summary: string;
}) {
  const exactBlock = `변경 내용\n${args.preview}\n\n이대로 수정할까요?`;
  const replyWithoutPreview = args.reply.includes(args.preview)
    ? args.reply.slice(0, args.reply.indexOf(args.preview)).trim()
    : args.reply;
  const framing =
    clipCharacters(replyWithoutPreview, 2_000) ||
    `알겠습니다. ${args.summary} 내용을 수정할까요?`;
  return `${framing}\n\n${exactBlock}`.trim();
}

async function runCompletion(args: {
  allowTools: boolean;
  maxTokens: number;
  messages: OrgAgentLlmMessage[];
  model: OrgAgentModelId;
}) {
  return createChatCompletionWithFallback({
    anthropicOverloadFallbackModel: ORG_AGENT_GROK_MODEL,
    buildRequest: (model) => ({
      ...(usesMaxCompletionTokensForModel(model)
        ? { max_completion_tokens: args.maxTokens }
        : { max_tokens: args.maxTokens }),
      messages: args.messages as any,
      temperature: 0.1,
      ...(args.allowTools
        ? {
            tool_choice: "auto" as const,
            tools: getEnabledOrgAgentTools() as any,
          }
        : {}),
    }),
    debugLabel: "org/agent:chat",
    fallbackModel: getOrgAgentFallbackModel(args.model),
    model: args.model,
    openAIResponses: { reasoningEffort: "high" },
  });
}

async function correctOrgAgentInternalTokenLeak(args: {
  model: OrgAgentModelId;
  reply: string;
  usage: OrgAgentTurnUsage;
  userMessage: string;
}) {
  const leaked = findNewOrgAgentInternalArtifacts(args);
  if (leaked.length === 0) {
    return { attempted: false, model: args.model, reply: args.reply };
  }
  try {
    const correction = await runCompletion({
      allowTools: false,
      maxTokens: 1_500,
      messages: [
        {
          content:
            "Rewrite the draft as a natural user-facing answer in the same language. Replace internal enum/token names with ordinary human wording. Preserve every fact, decision, caveat, and Markdown structure. Do not mention this rewrite or add new information.",
          role: "system",
        },
        {
          content: `Leaked internal tokens: ${leaked.join(", ")}\n\n<draft>\n${args.reply}\n</draft>`,
          role: "user",
        },
      ],
      model: args.model,
    });
    addCompletionUsage(args.usage, correction.response);
    const reply = extractAssistantText(
      correction.response?.choices?.[0]?.message
    );
    if (
      reply &&
      findNewOrgAgentInternalArtifacts({
        reply,
        userMessage: args.userMessage,
      }).length === 0
    ) {
      return {
        attempted: true,
        model: correction.model as OrgAgentModelId,
        reply,
      };
    }
  } catch (error) {
    console.error(
      "[org/agent:internal-token-correction]",
      getLlmErrorMessage(error)
    );
  }
  return {
    attempted: true,
    model: args.model,
    reply: replaceNewOrgAgentInternalTokens(args),
  };
}

async function runOrgAgentToolLoop(args: {
  actorId: string;
  actorLabel: string;
  admin: ReturnType<typeof getSupabaseAdmin>;
  context: Awaited<ReturnType<typeof buildOrgAgentPromptContext>>;
  conversation: Awaited<
    ReturnType<typeof ensureOrgAgentConversation>
  >["conversation"];
  currentUserMessageId: number;
  emit?: OrgAgentChatEmitter;
  mentions: OrgAgentMention[];
  model: OrgAgentModelId;
  readAudience: "caller" | "company_safe";
  scopeKey: string;
  slackThreadId: string | null;
  source: "chat" | "slack";
  user: User;
  userLabel?: string | null;
  userMessage: string;
}) {
  const messages: OrgAgentLlmMessage[] = [
    { content: buildOrgAgentSystemPrompt(), role: "system" },
    {
      content: buildOrgAgentUserPrompt({
        context: args.context,
        mentions: args.mentions,
        userLabel: args.userLabel,
        userMessage: args.userMessage,
      }),
      role: "user",
    },
  ];
  const state = createOrgAgentToolExecutionState(args.context);
  let activeModel = args.model;
  let fallbackReason: ChatCompletionFallbackReason | null = null;
  let totalToolCalls = 0;
  let totalToolResultChars = 0;
  let terminalReached = false;
  const usage = createTurnUsage();

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
    let completion: Awaited<ReturnType<typeof runCompletion>>;
    try {
      completion = await runCompletion({
        allowTools: true,
        maxTokens: getOrgAgentToolCompletionMaxTokens(state),
        messages,
        model: activeModel,
      });
    } catch (error) {
      if (!state.terminalMutationUsed && state.updateSummaries.length === 0)
        throw error;
      console.error(
        "[org/agent:post-tool-completion]",
        getLlmErrorMessage(error)
      );
      return {
        fallbackReason,
        model: activeModel,
        reply: buildFallbackReply(state),
        state,
        usage,
      };
    }
    activeModel = completion.model as OrgAgentModelId;
    fallbackReason = fallbackReason ?? completion.fallbackReason ?? null;
    addCompletionUsage(usage, completion.response);

    const responseMessage = completion.response?.choices?.[0]?.message;
    const assistantText = extractAssistantText(responseMessage);
    const toolCalls = normalizeToolCalls(responseMessage);
    if (toolCalls.length === 0) {
      return {
        fallbackReason,
        model: activeModel,
        reply: assistantText || buildFallbackReply(state),
        state,
        usage,
      };
    }

    messages.push({
      _responses_output: Array.isArray(responseMessage?._responses_output)
        ? responseMessage._responses_output
        : undefined,
      content: assistantText,
      role: "assistant",
      tool_calls: toolCalls,
    });

    const requestedTerminalCall = toolCalls.find((toolCall) =>
      isOrgAgentTerminalToolName(toolCall.function.name)
    );
    if (requestedTerminalCall && toolCalls.length !== 1) {
      state.terminalMutationUsed = true;
      state.toolResults.push({
        callId: requestedTerminalCall.id,
        name: requestedTerminalCall.function.name as any,
        status: "error",
        summary: "실행 도구는 한 메시지에서 단독으로 호출해야 합니다",
      });
      for (const toolCall of toolCalls) {
        messages.push({
          content: serializeOrgAgentToolError(
            "terminal_call_conflict: a terminal action must be the only tool call in its assistant message. No action was applied."
          ),
          name: toolCall.function.name || "unknown_tool",
          role: "tool",
          tool_call_id: toolCall.id,
        });
      }
      terminalReached = true;
      break;
    }

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) {
        messages.push({
          content: serializeOrgAgentToolError(
            "Tool call budget reached. Continue with a final answer."
          ),
          name: toolName || "unknown_tool",
          role: "tool",
          tool_call_id: toolCall.id,
        });
        continue;
      }
      totalToolCalls += 1;

      if (!isOrgAgentToolName(toolName)) {
        state.toolResults.push({
          callId: toolCall.id,
          name: toolName || "unknown_tool",
          status: "error",
          summary: "허용되지 않은 도구 호출",
        });
        messages.push({
          content: serializeOrgAgentToolError(
            "Unknown tool. Use only the provided tools."
          ),
          name: toolName || "unknown_tool",
          role: "tool",
          tool_call_id: toolCall.id,
        });
        continue;
      }

      args.emit?.("tool_status", {
        label: getOrgAgentToolStatusLabel({
          name: toolName,
          status: "running",
        }),
        status: "running",
      });

      const completeBefore = new Set(state.completeLongTextTargets);
      const observedBefore = new Map(state.observedLongTextFingerprints);
      const pendingRoleReadsBefore = new Set(state.pendingFullRoleRequestIds);
      try {
        const result = await executeOrgAgentTool({
          actorId: args.actorId,
          actorLabel: args.actorLabel,
          admin: args.admin,
          audience: args.readAudience,
          callId: toolCall.id,
          conversation: args.conversation,
          currentUserMessageId: args.currentUserMessageId,
          input: parseToolArguments(toolCall.function.arguments),
          name: toolName,
          scopeKey: args.scopeKey,
          slackThreadId: args.slackThreadId,
          source: args.source,
          state,
          user: args.user,
          userMessage: args.userMessage,
        });
        args.emit?.("tool_status", {
          label: getOrgAgentToolStatusLabel({ name: toolName, status: "done" }),
          status: "done",
        });
        const serializedResult = serializeOrgAgentToolResult(toolName, result);
        const remainingResultChars = Math.max(
          0,
          MAX_TOTAL_TOOL_RESULT_CHARS - totalToolResultChars
        );
        const fittedResult = fitOrgAgentToolResultToBudget({
          remainingChars: remainingResultChars,
          serializedResult,
        });
        const resultWasTruncated = !fittedResult.complete;
        const boundedResult = fittedResult.content;
        totalToolResultChars += boundedResult.length;
        if (resultWasTruncated) {
          restoreLongTextVisibility({
            completeTargets: completeBefore,
            observedFingerprints: observedBefore,
            pendingRoleRequestIds: pendingRoleReadsBefore,
            state,
          });
        }
        messages.push({
          content: boundedResult,
          name: toolName,
          role: "tool",
          tool_call_id: toolCall.id,
        });
      } catch (error) {
        restoreLongTextVisibility({
          completeTargets: completeBefore,
          observedFingerprints: observedBefore,
          pendingRoleRequestIds: pendingRoleReadsBefore,
          state,
        });
        const isInputError =
          error instanceof OrgAgentToolInputError ||
          (error instanceof OrgHttpError && error.status < 500);
        const errorMessage = isInputError
          ? error.message
          : "The tool could not be completed. Do not claim success.";
        console.error("[org/agent:tool]", {
          callId: toolCall.id,
          error: getLlmErrorMessage(error),
          name: toolName,
        });
        state.toolResults.push({
          callId: toolCall.id,
          name: toolName,
          status: "error",
          summary: isInputError ? error.message : "도구 실행 실패",
        });
        args.emit?.("tool_status", {
          label: getOrgAgentToolStatusLabel({
            name: toolName,
            status: "error",
          }),
          status: "error",
        });
        messages.push({
          content: serializeOrgAgentToolError(errorMessage),
          name: toolName,
          role: "tool",
          tool_call_id: toolCall.id,
        });
      }
      if (isOrgAgentTerminalToolName(toolName)) {
        terminalReached = true;
      }
    }
    promoteOrgAgentToolReadVisibility(state);
    if (terminalReached) break;
  }

  let finalCompletion: Awaited<ReturnType<typeof runCompletion>>;
  try {
    finalCompletion = await runCompletion({
      allowTools: false,
      maxTokens: TOOL_FREE_FINAL_MAX_TOKENS,
      messages: [
        ...messages,
        {
          content:
            "Tool use is finished for this turn. Give a clear, natural user-facing answer with enough context to understand the result, but no padding. Do not claim success for failed tools.",
          role: "user",
        },
      ],
      model: activeModel,
    });
  } catch (error) {
    if (!state.terminalMutationUsed && state.updateSummaries.length === 0)
      throw error;
    console.error(
      "[org/agent:final-post-tool-completion]",
      getLlmErrorMessage(error)
    );
    return {
      fallbackReason,
      model: activeModel,
      reply: buildFallbackReply(state),
      state,
      usage,
    };
  }
  activeModel = finalCompletion.model as OrgAgentModelId;
  fallbackReason = fallbackReason ?? finalCompletion.fallbackReason ?? null;
  addCompletionUsage(usage, finalCompletion.response);
  return {
    fallbackReason,
    model: activeModel,
    reply: enforceOrgAgentTerminalMutationOutcome(
      state,
      extractAssistantText(finalCompletion.response?.choices?.[0]?.message) ||
        buildFallbackReply(state)
    ),
    state,
    usage,
  };
}

function buildAssistantMetadata(args: {
  fallbackReason: ChatCompletionFallbackReason | null;
  model: string;
  state: OrgAgentToolExecutionState;
  usage: OrgAgentTurnUsage;
}): OrgAgentMessageMetadata {
  const lastRequestChange = args.state.requestChanges.at(-1);
  return {
    ...(args.state.actions.length > 0 && { actions: args.state.actions }),
    ...(args.state.candidateConnectionConfirmations.length > 0 && {
      candidateConnectionConfirmations:
        args.state.candidateConnectionConfirmations,
    }),
    fallbackReason: args.fallbackReason,
    ...(args.state.internalTokenCorrectionCount > 0 && {
      internalTokenCorrectionCount: args.state.internalTokenCorrectionCount,
    }),
    llmUsage: args.usage,
    model: args.model,
    ...(lastRequestChange && { requestChange: lastRequestChange }),
    ...(args.state.requestChanges.length > 0 && {
      requestChanges: args.state.requestChanges,
    }),
    ...(args.state.activatedMoreData.length > 0 && {
      retainedDataActivations: args.state.activatedMoreData,
    }),
    source: "org_agent_chat",
    ...(args.state.toolResults.length > 0 && {
      toolResults: args.state.toolResults,
    }),
    ...(args.state.updateProposalRef && {
      updateProposalRef: args.state.updateProposalRef,
    }),
  };
}

async function presentStagedProposal(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  conversationId: string;
  messageMetadata: OrgAgentMessageMetadata;
  messageType: "chat" | "slack";
  model: string;
  presentationText: string;
  slackThreadId: string | null;
  state: OrgAgentToolExecutionState;
  thinkingLogs: OrgAgentThinkingLog[];
  userMessageId: number;
  workspaceId: string;
}) {
  const proposal = args.state.stagedProposal;
  if (!proposal) throw new Error("No staged proposal to present");
  const scopeKey = args.slackThreadId
    ? `slack:${args.slackThreadId}`
    : `chat:${args.conversationId}`;
  const { data, error } = await (args.admin.rpc as any)(
    "present_company_agent_update_proposal_v1",
    {
      p_message_metadata: args.messageMetadata,
      p_message_type: args.messageType,
      p_model: args.model,
      p_payload: {
        changes: proposal.changes,
        event_content: proposal.eventContent,
      },
      p_presentation_text: args.presentationText,
      p_preview: proposal.preview,
      p_scope_key: scopeKey,
      p_slack_thread_id: args.slackThreadId,
      p_source: args.messageType,
      p_summary: proposal.summary,
      p_thinking_logs: args.thinkingLogs,
      p_user_message_id: args.userMessageId,
      p_workspace_id: args.workspaceId,
    }
  );
  if (error) throw error;
  const result = (data && typeof data === "object" ? data : {}) as Record<
    string,
    unknown
  >;
  const proposalId = normalizeText(result.proposal_id);
  const status = normalizeText(result.status);
  if (!proposalId || (status !== "pending" && status !== "draft")) {
    throw new Error("Proposal presentation returned an invalid result");
  }
  if (status === "draft") {
    return {
      kind: "draft" as const,
      presentationText:
        normalizeText(result.presentation_text) || args.presentationText,
      proposalId,
    };
  }
  const presentedMessageId = Number(result.presented_message_id || 0);
  if (!Number.isFinite(presentedMessageId) || presentedMessageId <= 0) {
    throw new Error("Presented proposal has no assistant message");
  }
  const { data: messageRow, error: messageError } = await (
    args.admin.from("company_messages" as any) as any
  )
    .select(
      "id, conversation_id, company_workspace_id, role_id, company_user_id, role, content, mentions, metadata, thinking_logs, model, status, message_type, created_at"
    )
    .eq("id", presentedMessageId)
    .eq("conversation_id", args.conversationId)
    .single();
  if (messageError) throw messageError;
  return {
    assistantMessage: toOrgAgentMessage(messageRow as OrgAgentMessageRow),
    kind: "message" as const,
    proposalId,
  };
}

export async function runOrgAgentChat(args: {
  assistantMessageMetadata?: OrgAgentMessageMetadata;
  emit?: OrgAgentChatEmitter;
  messageType?: string;
  messageUserId?: string | null;
  mentions?: OrgAgentMention[];
  message: string;
  model?: unknown;
  /** @deprecated Ignored. The conversation is workspace-scoped. */
  roleId?: string | null;
  slackAssistantUserId?: string | null;
  slackThreadId?: string;
  slackUserId?: string | null;
  slackUserMessageTs?: string | null;
  userMessageMetadata?: OrgAgentMessageMetadata;
  user: User;
  workspaceId: string;
}): Promise<OrgAgentChatResult> {
  const userMessageText = normalizeText(args.message);
  if (!userMessageText) throw new OrgHttpError(400, "message is required");
  if (userMessageText.length > 8_000) {
    throw new OrgHttpError(400, "message is too long");
  }

  const modelConfig = resolveOrgAgentModel(args.model);
  const thinkingLogs: OrgAgentThinkingLog[] = [];
  const { admin, conversation } = await ensureOrgAgentConversation({
    user: args.user,
    workspaceId: args.workspaceId,
  });

  let mentions: OrgAgentMention[] = [];
  try {
    mentions = await filterOrgAgentMentionsForWorkspace({
      admin,
      mentions: args.mentions ?? [],
      user: args.user,
      workspaceId: conversation.company_workspace_id,
    });
  } catch (error) {
    console.warn(
      "[org/agent:mention-filter]",
      getLlmErrorMessage(error) || error
    );
  }

  const userMessage = await insertOrgAgentMessage({
    admin,
    content: userMessageText,
    conversation,
    mentions,
    metadata: {
      model: modelConfig.model,
      source: "org_agent_user",
      ...args.userMessageMetadata,
    },
    messageType: args.messageType,
    role: "user",
    slackMessageTs: args.slackUserMessageTs,
    slackThreadId: args.slackThreadId,
    slackUserId: args.slackUserId,
    userId:
      args.messageUserId === undefined ? args.user.id : args.messageUserId,
  });
  args.emit?.("user_message", userMessage);

  try {
    thinkingLogs.push(nowLog("회사와 최근 추천 정보를 읽는 중", "running"));
    args.emit?.("tool_status", {
      label: "회사와 최근 추천 정보를 읽는 중",
      status: "running",
    });
    const context = await buildOrgAgentPromptContext({
      admin,
      beforeMessageId: userMessage.id,
      conversation,
      currentUserMessageId: userMessage.id,
      messageType: args.slackThreadId ? "slack" : "chat",
      readAudience: args.slackThreadId ? "company_safe" : "caller",
      scopeKey: args.slackThreadId
        ? `slack:${args.slackThreadId}`
        : `chat:${conversation.id}`,
      slackThreadId: args.slackThreadId ?? null,
      slackHistoryTruncated: Boolean(
        args.userMessageMetadata?.historyTruncated
      ),
      user: args.user,
    });
    thinkingLogs[thinkingLogs.length - 1] = nowLog(
      "회사와 최근 추천 정보 확인 완료",
      "done"
    );
    args.emit?.("tool_status", {
      label: "회사와 최근 추천 정보 확인 완료",
      status: "done",
    });

    thinkingLogs.push(nowLog("응답 생성 중", "running"));
    args.emit?.("tool_status", {
      label: "응답 생성 중",
      status: "running",
    });

    const llmResult = await runOrgAgentToolLoop({
      actorId: args.slackUserId ?? args.user.id,
      actorLabel:
        normalizeText(args.userMessageMetadata?.slackUserName) ||
        normalizeText(args.user.user_metadata?.full_name) ||
        normalizeText(args.user.user_metadata?.name) ||
        normalizeText(args.user.email) ||
        "회사 사용자",
      admin,
      context,
      conversation,
      currentUserMessageId: userMessage.id,
      emit: args.emit,
      mentions,
      model: modelConfig.model,
      readAudience: args.slackThreadId ? "company_safe" : "caller",
      scopeKey: args.slackThreadId
        ? `slack:${args.slackThreadId}`
        : `chat:${conversation.id}`,
      slackThreadId: args.slackThreadId ?? null,
      source: args.slackThreadId ? "slack" : "chat",
      user: args.user,
      userLabel: args.userMessageMetadata?.slackUserName
        ? args.userMessageMetadata.slackUserName
        : args.slackUserId
          ? "Slack participant"
          : "user",
      userMessage: userMessageText,
    });
    const exactServerText = [
      llmResult.state.stagedProposal?.preview,
      llmResult.state.requiredPresentationText,
    ].filter((value): value is string => Boolean(value));
    const draftProse = exactServerText.reduce(
      (value, exact) => value.replace(exact, "").trim(),
      llmResult.reply
    );
    const corrected = await correctOrgAgentInternalTokenLeak({
      model: llmResult.model,
      reply: draftProse,
      usage: llmResult.usage,
      userMessage: userMessageText,
    });
    llmResult.model = corrected.model;
    llmResult.state.internalTokenCorrectionCount += corrected.attempted ? 1 : 0;
    llmResult.reply = enforceOrgAgentTerminalMutationOutcome(
      llmResult.state,
      guardOrgAgentCandidatePrivacyReply({
        preferenceDisclosure: llmResult.state.preferenceDisclosure,
        reply:
          corrected.reply ||
          llmResult.state.terminalReply ||
          "내부 상태를 사람이 읽을 수 있는 표현으로 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.",
        toolResults: llmResult.state.toolResults,
        userMessage: userMessageText,
      })
    );
    const usedTool = llmResult.state.toolResults.length > 0;
    if (usedTool) {
      thinkingLogs[thinkingLogs.length - 1] = nowLog("응답 생성 완료", "done");
      args.emit?.("tool_status", {
        label: "응답 생성 완료",
        status: "done",
      });
    } else {
      // 일반 텍스트 응답에는 완료 상태를 메시지 위에 남기지 않는다.
      thinkingLogs.length = 0;
    }

    const metadata = {
      ...buildAssistantMetadata(llmResult),
      ...args.assistantMessageMetadata,
    };
    const reply = appendRequiredPresentation({
      reply: llmResult.reply,
      requiredText: llmResult.state.requiredPresentationText,
    });

    if (llmResult.state.stagedProposal) {
      const presentationText = buildProposalPresentation({
        preview: llmResult.state.stagedProposal.preview,
        reply,
        summary: llmResult.state.stagedProposal.summary,
      });
      const presented = await presentStagedProposal({
        admin,
        conversationId: conversation.id,
        messageMetadata: metadata,
        messageType: args.slackThreadId ? "slack" : "chat",
        model: llmResult.model,
        presentationText,
        slackThreadId: args.slackThreadId ?? null,
        state: llmResult.state,
        thinkingLogs,
        userMessageId: userMessage.id,
        workspaceId: conversation.company_workspace_id,
      });
      if (presented.kind === "draft") {
        return {
          conversationId: conversation.id,
          kind: "slack_proposal_draft",
          model: llmResult.model,
          presentationText: presented.presentationText,
          proposalId: presented.proposalId,
          userMessage,
        };
      }
      for (const delta of chunkText(presentationText)) {
        args.emit?.("text_delta", { delta });
      }
      args.emit?.("assistant_message", presented.assistantMessage);
      void maybeSummarizeOrgAgentConversation({
        admin,
        conversation,
        model: isOrgAgentModelId(llmResult.model)
          ? llmResult.model
          : DEFAULT_ORG_AGENT_MODEL,
      });
      return {
        assistantMessage: presented.assistantMessage,
        conversationId: conversation.id,
        kind: "message",
        model: llmResult.model,
        userMessage,
      };
    }

    for (const delta of chunkText(reply)) {
      args.emit?.("text_delta", { delta });
    }

    const assistantMessage = await insertOrgAgentMessage({
      admin,
      content: reply,
      conversation,
      metadata,
      messageType: args.messageType,
      model: llmResult.model,
      role: "assistant",
      slackThreadId: args.slackThreadId,
      slackUserId: args.slackAssistantUserId,
      thinkingLogs,
    });
    args.emit?.("assistant_message", assistantMessage);

    void maybeSummarizeOrgAgentConversation({
      admin,
      conversation,
      model: isOrgAgentModelId(llmResult.model)
        ? llmResult.model
        : DEFAULT_ORG_AGENT_MODEL,
    });

    return {
      assistantMessage,
      conversationId: conversation.id,
      kind: "message",
      model: llmResult.model,
      userMessage,
    };
  } catch (error) {
    if (thinkingLogs.length > 0) {
      thinkingLogs[thinkingLogs.length - 1] = nowLog("응답 생성 실패", "error");
    }
    const detail = getVisibleErrorMessage(error);
    const message =
      "지금은 에이전트 응답을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
    const assistantMessage = await insertOrgAgentMessage({
      admin,
      content: message,
      conversation,
      metadata: {
        model: modelConfig.model,
        source: "org_agent_error",
        ...args.assistantMessageMetadata,
      },
      messageType: args.messageType,
      model: modelConfig.model,
      role: "assistant",
      slackThreadId: args.slackThreadId,
      slackUserId: args.slackAssistantUserId,
      status: "failed",
      thinkingLogs,
    });
    args.emit?.("error", { error: detail });
    args.emit?.("assistant_message", assistantMessage);
    return {
      assistantMessage,
      conversationId: conversation.id,
      kind: "message",
      model: modelConfig.model,
      userMessage,
    };
  }
}
