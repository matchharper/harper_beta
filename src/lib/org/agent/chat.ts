import type { User } from "@supabase/supabase-js";
import { after } from "next/server";
import {
  createChatCompletionWithFallback,
  getLlmErrorMessage,
  usesMaxCompletionTokensForModel,
  type ChatCompletionFallbackReason,
} from "@/lib/llm/llm";
import { extractLlmTokenUsage } from "@/lib/llm/usageLogging";
import {
  createLlmDebugCall,
  summarizeLlmDebugCalls,
  type LlmDebugCall,
} from "@/lib/llm/debugUsage";
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
  buildOrgAgentPromptContext,
  filterOrgAgentMentionsForWorkspace,
} from "@/lib/org/agent/context";
import {
  buildOrgAgentSystemPrompt,
  buildOrgAgentUserPrompt,
} from "@/lib/org/agent/prompts";
import {
  serializeOrgAgentDeferredToolCall,
  serializeOrgAgentToolError,
  serializeOrgAgentToolResult,
} from "@/lib/org/agent/promptFormat";
import {
  findNewOrgAgentInternalArtifacts,
  replaceNewOrgAgentInternalTokens,
} from "@/lib/org/agent/responseGuard";
import { maybeSummarizeOrgAgentConversation } from "@/lib/org/agent/summary";
import {
  ensureOrgAgentConversation,
  ensureOrgRoleCreationConversation,
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
  isOrgAgentToolName,
} from "@/lib/org/agent/tools";
import type { SlackRoleCreationExecutionContext } from "@/lib/org/agent/slackRoleCreation";
import {
  getOrgAgentToolCompletionMaxTokens,
  NORMAL_TOOL_COMPLETION_MAX_TOKENS,
} from "@/lib/org/agent/toolCompletionBudget";
import {
  fitOrgAgentToolResultToBudget,
  ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS,
} from "@/lib/org/agent/toolResultBudget";
import {
  captureOrgAgentContactDraftState,
  enforceOrgAgentReplyInvariants,
  getOrgAgentRequiredPresentationTexts,
} from "@/lib/org/agent/toolState";
import {
  clipOrgAgentToolDebugSummary,
  summarizeOrgAgentToolInput,
  summarizeOrgAgentToolResult,
  type OrgAgentToolDebugEvent,
} from "@/lib/org/agent/toolDebug";
import type {
  OrgAgentMention,
  OrgAgentMessage,
  OrgAgentMessageMetadata,
  OrgAgentThinkingLog,
} from "@/lib/org/agent/types";
import {
  getOrgAgentThinkingLogIcon,
  upsertOrgAgentThinkingLog,
} from "@/lib/org/agent/thinkingLogs";
import { OrgHttpError } from "@/lib/org/server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  buildServiceAnswerExamplesPromptBlock,
  lookupAnswerExamples,
} from "@/lib/serviceAnswerExamples";
import {
  formatCurrentReferenceAttachmentsForPrompt,
  referenceAttachmentMetadata,
  referenceAttachmentsFromMetadata,
  validateOrgAgentReferenceAttachments,
} from "@/lib/org/agent/referenceAttachments";
import type { ChatAttachmentPayload } from "@/types/chat";

function scheduleOrgAgentSummary(
  args: Parameters<typeof maybeSummarizeOrgAgentConversation>[0]
) {
  const task = () => maybeSummarizeOrgAgentConversation(args);
  try {
    after(task);
  } catch {
    void task();
  }
}

export type OrgAgentChatEventName =
  | "assistant_message"
  | "done"
  | "error"
  | "llm_debug"
  | "text_delta"
  | "tool_debug"
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
  reasoning_content?: string;
  role: "assistant" | "system" | "tool" | "user";
  tool_call_id?: string;
  tool_calls?: OrgAgentLlmToolCall[];
};

// One completion may request one tool; each result informs the next decision.
const MAX_TOOL_LOOPS = 10;
const MAX_TOTAL_TOOL_CALLS = 10;
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

function addCompletionUsage(args: {
  debugCalls: LlmDebugCall[];
  model: string;
  response: any;
  step: string;
  usage: OrgAgentTurnUsage;
}) {
  const current = extractLlmTokenUsage(args.response);
  args.usage.cacheCreationInputTokens += current.cacheCreationInputTokens ?? 0;
  args.usage.cacheReadInputTokens += current.cacheReadInputTokens ?? 0;
  args.usage.completionCount += 1;
  args.usage.inputTokens += current.inputTokens ?? 0;
  args.usage.outputTokens += current.outputTokens ?? 0;
  args.usage.totalTokens += current.totalTokens ?? 0;
  args.debugCalls.push(
    createLlmDebugCall({
      model: args.model,
      response: args.response,
      step: args.step,
    })
  );
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

function nowLog(
  label: string,
  status: OrgAgentThinkingLog["status"],
  options: Pick<OrgAgentThinkingLog, "icon" | "id"> = {}
) {
  return {
    at: new Date().toISOString(),
    ...options,
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
  if (state.requiredContactPresentations.length > 1) {
    return "후보자별로 확인할 문구를 준비했어요. 아래 내용을 각각 확인해 주세요.";
  }
  if (state.fallbackReply) return state.fallbackReply;
  if (state.stagedProposal) {
    return `알겠습니다. ${state.stagedProposal.summary} 내용을 아래와 같이 수정할까요?`;
  }
  const updates = state.updateSummaries;
  if (updates.length === 1) {
    return `변경 내용을 저장했어요. ${updates[0]}`;
  }
  if (updates.length > 1) {
    return "요청하신 변경 내용을 모두 저장했어요.";
  }
  return "요청을 처리하려면 대상 역할이나 후보자를 조금 더 구체적으로 알려 주세요.";
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

function appendRequiredPresentations(args: {
  reply: string;
  requiredTexts: string[];
}) {
  const missing = args.requiredTexts.filter(
    (requiredText) => !args.reply.includes(requiredText)
  );
  if (missing.length === 0) return args.reply;
  return `${clipCharacters(args.reply, 2_000)}\n\n${missing.join("\n\n")}`.trim();
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
  reasoningEffort?: OrgAgentReasoningEffort;
  signal?: AbortSignal;
  strictModel?: boolean;
  surface?: "chat" | "slack";
}) {
  const maxTokens =
    args.reasoningEffort === "max"
      ? Math.max(args.maxTokens, 12_000)
      : args.maxTokens;
  return createChatCompletionWithFallback({
    ...(args.strictModel
      ? {}
      : { anthropicOverloadFallbackModel: ORG_AGENT_GROK_MODEL }),
    buildRequest: (model) => ({
      ...(usesMaxCompletionTokensForModel(model)
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
      messages: args.messages as any,
      temperature: 0.1,
      ...(args.allowTools
        ? {
            parallel_tool_calls: false,
            tool_choice: "auto" as const,
            tools: getEnabledOrgAgentTools(args.surface) as any,
          }
        : {}),
    }),
    debugLabel: "org/agent:chat",
    deepSeekThinking: {
      reasoningEffort: args.reasoningEffort === "max" ? "max" : "high",
    },
    ...(args.strictModel
      ? {}
      : { fallbackModel: getOrgAgentFallbackModel(args.model) }),
    model: args.model,
    openAIResponses: {
      reasoningEffort:
        args.reasoningEffort ?? DEFAULT_ORG_AGENT_REASONING_EFFORT,
    },
    signal: args.signal,
  });
}

async function correctOrgAgentInternalTokenLeak(args: {
  debugCalls: LlmDebugCall[];
  model: OrgAgentModelId;
  reasoningEffort?: OrgAgentReasoningEffort;
  reply: string;
  signal?: AbortSignal;
  strictModel?: boolean;
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
      maxTokens: NORMAL_TOOL_COMPLETION_MAX_TOKENS,
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
      reasoningEffort: args.reasoningEffort,
      signal: args.signal,
      strictModel: args.strictModel,
    });
    addCompletionUsage({
      debugCalls: args.debugCalls,
      model: correction.model,
      response: correction.response,
      step: "internal_token_correction",
      usage: args.usage,
    });
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
  debug?: boolean;
  emit?: OrgAgentChatEmitter;
  onToolStatus?: (log: OrgAgentThinkingLog) => void;
  mentions: OrgAgentMention[];
  model: OrgAgentModelId;
  readAudience: "caller" | "company_safe";
  referenceAttachments?: ChatAttachmentPayload[];
  scopeKey: string;
  serviceAnswerExamplesText?: string | null;
  signal?: AbortSignal;
  slackExecutionContext?: SlackRoleCreationExecutionContext | null;
  slackThreadId: string | null;
  source: "chat" | "slack";
  user: User;
  userLabel?: string | null;
  userMessage: string;
}) {
  const companySideUserPrompt = buildOrgAgentUserPrompt({
    context: args.context,
    mentions: args.mentions,
    serviceAnswerExamplesText: args.serviceAnswerExamplesText,
    userLabel: args.userLabel,
    userMessage: args.userMessage,
  });
  const messages: OrgAgentLlmMessage[] = [
    {
      content: buildOrgAgentSystemPrompt({
        enableSlackChoiceButtons: args.source === "slack",
        surface: args.source,
      }),
      role: "system",
    },
    {
      content: companySideUserPrompt,
      role: "user",
    },
  ];
  const state = createOrgAgentToolExecutionState(args.context);
  let activeModel = args.model;
  let activeReasoningEffort: OrgAgentReasoningEffort =
    DEFAULT_ORG_AGENT_REASONING_EFFORT;
  let calibrationCompleted = false;
  let fallbackReason: ChatCompletionFallbackReason | null = null;
  let totalToolCalls = 0;
  let totalToolResultChars = 0;
  const usage = createTurnUsage();
  const debugCalls: LlmDebugCall[] = [];

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
    let completion: Awaited<ReturnType<typeof runCompletion>>;
    try {
      completion = await runCompletion({
        allowTools: true,
        maxTokens: getOrgAgentToolCompletionMaxTokens(state),
        messages,
        model: activeModel,
        reasoningEffort: activeReasoningEffort,
        signal: args.signal,
        strictModel: calibrationCompleted,
        surface: args.source,
      });
    } catch (error) {
      args.signal?.throwIfAborted();
      if (state.toolResults.length === 0 && state.updateSummaries.length === 0)
        throw error;
      console.error(
        "[org/agent:post-tool-completion]",
        getLlmErrorMessage(error)
      );
      return {
        debugCalls,
        fallbackReason,
        model: activeModel,
        reply: buildFallbackReply(state),
        state,
        usage,
      };
    }
    activeModel = completion.model as OrgAgentModelId;
    fallbackReason = fallbackReason ?? completion.fallbackReason ?? null;
    addCompletionUsage({
      debugCalls,
      model: completion.model,
      response: completion.response,
      step: `tool_loop_${loop + 1}`,
      usage,
    });

    const responseMessage = completion.response?.choices?.[0]?.message;
    const assistantText = extractAssistantText(responseMessage);
    const toolCalls = normalizeToolCalls(responseMessage);
    if (toolCalls.length === 0) {
      return {
        debugCalls,
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
      reasoning_content:
        typeof responseMessage?.reasoning_content === "string"
          ? responseMessage.reasoning_content
          : undefined,
      role: "assistant",
      tool_calls: toolCalls,
    });

    const deferredToolCalls = toolCalls.slice(1);
    for (const toolCall of toolCalls.slice(0, 1)) {
      args.signal?.throwIfAborted();
      const toolName = toolCall.function.name;
      const toolDebugInput = args.debug
        ? summarizeOrgAgentToolInput(toolCall.function.arguments)
        : undefined;
      const toolStartedAt = args.debug ? performance.now() : 0;
      const emitToolDebug = (
        event: Omit<
          OrgAgentToolDebugEvent,
          "callId" | "durationMs" | "input" | "loop" | "name"
        >
      ) => {
        if (!args.debug) return;
        args.emit?.("tool_debug", {
          callId: toolCall.id,
          durationMs: Math.round((performance.now() - toolStartedAt) * 10) / 10,
          input: toolDebugInput,
          loop: loop + 1,
          name: toolName || "unknown_tool",
          ...event,
        } satisfies OrgAgentToolDebugEvent);
      };
      if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) {
        messages.push({
          content: serializeOrgAgentToolError({
            kind: "budget",
            message: "Tool call budget reached.",
            name: toolName,
          }),
          name: toolName || "unknown_tool",
          role: "tool",
          tool_call_id: toolCall.id,
        });
        emitToolDebug({
          status: "skipped",
          summary: "tool call budget reached",
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
          content: serializeOrgAgentToolError({
            kind: "unknown_tool",
            message: "Unknown tool. Use only the provided tools.",
            name: toolName,
          }),
          name: toolName || "unknown_tool",
          role: "tool",
          tool_call_id: toolCall.id,
        });
        emitToolDebug({ status: "skipped", summary: "unknown tool" });
        continue;
      }

      const emitToolStatus = (status: "done" | "error" | "running") => {
        const log = nowLog(
          getOrgAgentToolStatusLabel({ name: toolName, status }),
          status,
          { icon: getOrgAgentThinkingLogIcon(toolName), id: toolCall.id }
        );
        args.emit?.("tool_status", log);
        args.onToolStatus?.(log);
      };
      const emitToolProgress = (label: string) => {
        const log = nowLog(label, "running", {
          icon: getOrgAgentThinkingLogIcon(toolName),
          id: toolCall.id,
        });
        args.emit?.("tool_status", log);
        args.onToolStatus?.(log);
      };
      emitToolStatus("running");

      const completeBefore = new Set(state.completeLongTextTargets);
      const observedBefore = new Map(state.observedLongTextFingerprints);
      const pendingRoleReadsBefore = new Set(state.pendingFullRoleRequestIds);
      try {
        if (toolName === "contact_talent") {
          if (
            state.requiredPresentationText &&
            !state.requiredContactPresentations.some(
              (item) => item.text === state.requiredPresentationText
            )
          ) {
            state.requiredPresentationTexts.push(
              state.requiredPresentationText
            );
          }
          state.contactDraftRef = null;
          state.requiredPresentationText = null;
        }
        const toolInput = parseToolArguments(toolCall.function.arguments);
        const result = await executeOrgAgentTool({
          actorId: args.actorId,
          actorLabel: args.actorLabel,
          admin: args.admin,
          audience: args.readAudience,
          callId: toolCall.id,
          companySideContext: companySideUserPrompt,
          conversation: args.conversation,
          currentUserMessageId: args.currentUserMessageId,
          input: toolInput,
          name: toolName,
          onToolProgress: emitToolProgress,
          referenceAttachments: args.referenceAttachments,
          scopeKey: args.scopeKey,
          slackExecutionContext: args.slackExecutionContext,
          slackThreadId: args.slackThreadId,
          source: args.source,
          state,
          user: args.user,
          userMessage: args.userMessage,
        });
        if (toolName === "contact_talent") {
          captureOrgAgentContactDraftState({ input: toolInput, state });
        } else if (
          state.requiredPresentationText &&
          !state.requiredPresentationTexts.includes(
            state.requiredPresentationText
          )
        ) {
          state.requiredPresentationTexts.push(state.requiredPresentationText);
        }
        if (toolName === "calibrate_role_hiring_brief") {
          activeModel = ORG_AGENT_TERRA_MODEL;
          activeReasoningEffort = "max";
          calibrationCompleted = true;
        }
        const serializedResult = serializeOrgAgentToolResult(toolName, result);
        const remainingResultChars = Math.max(
          0,
          ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS - totalToolResultChars
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
        const resultMetadata = state.toolResults.findLast(
          (item) => item.callId === toolCall.id
        );
        const resultFailed = resultMetadata?.status === "error";
        emitToolStatus(resultFailed ? "error" : "done");
        emitToolDebug({
          resultShape: summarizeOrgAgentToolResult(result),
          resultStatus: resultMetadata?.status ?? "success",
          status: resultFailed ? "failed" : "completed",
          ...(resultMetadata?.summary && {
            summary: clipOrgAgentToolDebugSummary(resultMetadata.summary),
          }),
        });
      } catch (error) {
        args.signal?.throwIfAborted();
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
        emitToolStatus("error");
        messages.push({
          content: serializeOrgAgentToolError({
            kind: isInputError ? "input" : "execution",
            message: errorMessage,
            name: toolName,
          }),
          name: toolName,
          role: "tool",
          tool_call_id: toolCall.id,
        });
        emitToolDebug({
          resultStatus: "error",
          status: "failed",
          summary: clipOrgAgentToolDebugSummary(
            isInputError ? error.message : getLlmErrorMessage(error)
          ),
        });
      }
    }
    for (const deferredCall of deferredToolCalls) {
      messages.push({
        content: serializeOrgAgentDeferredToolCall(),
        name: deferredCall.function.name || "unknown_tool",
        role: "tool",
        tool_call_id: deferredCall.id,
      });
      if (args.debug) {
        args.emit?.("tool_debug", {
          callId: deferredCall.id,
          durationMs: 0,
          input: summarizeOrgAgentToolInput(deferredCall.function.arguments),
          loop: loop + 1,
          name: deferredCall.function.name || "unknown_tool",
          status: "skipped",
          summary: "deferred until the next reasoning step",
        } satisfies OrgAgentToolDebugEvent);
      }
    }
    promoteOrgAgentToolReadVisibility(state);
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
      reasoningEffort: activeReasoningEffort,
      signal: args.signal,
      strictModel: calibrationCompleted,
    });
  } catch (error) {
    args.signal?.throwIfAborted();
    if (state.toolResults.length === 0 && state.updateSummaries.length === 0)
      throw error;
    console.error(
      "[org/agent:final-post-tool-completion]",
      getLlmErrorMessage(error)
    );
    return {
      debugCalls,
      fallbackReason,
      model: activeModel,
      reply: buildFallbackReply(state),
      state,
      usage,
    };
  }
  activeModel = finalCompletion.model as OrgAgentModelId;
  fallbackReason = fallbackReason ?? finalCompletion.fallbackReason ?? null;
  addCompletionUsage({
    debugCalls,
    model: finalCompletion.model,
    response: finalCompletion.response,
    step: "final_response",
    usage,
  });
  return {
    debugCalls,
    fallbackReason,
    model: activeModel,
    reply: enforceOrgAgentReplyInvariants(
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
    ...(args.state.contactDraftRef && {
      contactDraftRef: args.state.contactDraftRef,
    }),
    ...(args.state.contactDraftRefs.length > 0 && {
      contactDraftRefs: args.state.contactDraftRefs,
    }),
    fallbackReason: args.fallbackReason,
    ...(args.state.internalTokenCorrectionCount > 0 && {
      internalTokenCorrectionCount: args.state.internalTokenCorrectionCount,
    }),
    llmUsage: args.usage,
    model: args.model,
    ...(args.state.preferredRoleId && {
      preferredRoleId: args.state.preferredRoleId,
    }),
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
  attachments?: ChatAttachmentPayload[];
  debug?: boolean;
  emit?: OrgAgentChatEmitter;
  messageType?: string;
  messageUserId?: string | null;
  llmUserMessage?: string;
  mentions?: OrgAgentMention[];
  message: string;
  model?: unknown;
  roleId?: string | null;
  slackAssistantUserId?: string | null;
  slackExecutionContext?: SlackRoleCreationExecutionContext | null;
  slackThreadId?: string;
  slackUserId?: string | null;
  slackUserMessageTs?: string | null;
  signal?: AbortSignal;
  userMessageMetadata?: OrgAgentMessageMetadata;
  user: User;
  workspaceId: string;
}): Promise<OrgAgentChatResult> {
  const referenceAttachments = validateOrgAgentReferenceAttachments(
    Array.isArray(args.attachments) && args.attachments.length > 0
      ? args.attachments
      : referenceAttachmentsFromMetadata(args.userMessageMetadata)
  );
  const userMessageText =
    normalizeText(args.message) ||
    (referenceAttachments.length > 0
      ? "첨부한 자료를 이 역할의 인재 기준에 반영해 주세요."
      : "");
  if (!userMessageText) {
    throw new OrgHttpError(400, "message or attachment is required");
  }
  if (userMessageText.length > 8_000) {
    throw new OrgHttpError(400, "message is too long");
  }
  const requestedRoleId = normalizeText(args.roleId);
  const baseLlmUserMessage = [
    normalizeText(args.llmUserMessage) || userMessageText,
    formatCurrentReferenceAttachmentsForPrompt(referenceAttachments),
  ]
    .filter(Boolean)
    .join("\n");
  const llmUserMessage = requestedRoleId
    ? [
        `<CURRENT_ROLE_CONTEXT role_id="${requestedRoleId}">`,
        "This turn is scoped to this exact Role. Resolve relative references such as '현재 역할' against this Role and use read_role when pipeline details are needed.",
        "</CURRENT_ROLE_CONTEXT>",
        baseLlmUserMessage,
      ].join("\n")
    : baseLlmUserMessage;
  const serviceAnswerExamplesPromise = lookupAnswerExamples(llmUserMessage, {
    audience: "company",
  });
  args.signal?.throwIfAborted();

  const modelConfig = resolveOrgAgentModel(args.model);
  let thinkingLogs: OrgAgentThinkingLog[] = [];
  const recordThinkingLog = (log: OrgAgentThinkingLog) => {
    thinkingLogs = upsertOrgAgentThinkingLog(thinkingLogs, log);
    args.emit?.("tool_status", log);
  };
  const { admin, conversation } = requestedRoleId
    ? await ensureOrgRoleCreationConversation({
        allowCompletedRole: true,
        roleId: requestedRoleId,
        user: args.user,
        workspaceId: args.workspaceId,
      })
    : await ensureOrgAgentConversation({
        user: args.user,
        workspaceId: args.workspaceId,
      });
  const roleId = conversation.role_id;

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
      ...(referenceAttachments.length > 0
        ? {
            attachments: referenceAttachmentMetadata(referenceAttachments),
            roleCreationAttachments: referenceAttachments,
          }
        : {}),
    },
    messageType: args.messageType,
    role: "user",
    roleId,
    slackMessageTs: args.slackUserMessageTs,
    slackThreadId: args.slackThreadId,
    slackUserId: args.slackUserId,
    userId:
      args.messageUserId === undefined ? args.user.id : args.messageUserId,
  });
  args.emit?.("user_message", userMessage);

  try {
    recordThinkingLog(
      nowLog("회사와 최근 추천 정보를 읽는 중", "running", {
        icon: "read",
        id: "context",
      })
    );
    const [context, serviceAnswerExamples] = await Promise.all([
      buildOrgAgentPromptContext({
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
      }),
      serviceAnswerExamplesPromise,
    ]);
    const serviceAnswerExamplesText = buildServiceAnswerExamplesPromptBlock({
      audience: "company",
      examples: serviceAnswerExamples.examples,
    });
    recordThinkingLog(
      nowLog("회사와 최근 추천 정보 확인 완료", "done", {
        icon: "read",
        id: "context",
      })
    );

    recordThinkingLog(
      nowLog("응답 생성 중", "running", { icon: "run", id: "response" })
    );

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
      debug: args.debug,
      emit: args.emit,
      mentions,
      model: modelConfig.model,
      onToolStatus: (log) => {
        thinkingLogs = upsertOrgAgentThinkingLog(thinkingLogs, log);
      },
      readAudience: args.slackThreadId ? "company_safe" : "caller",
      referenceAttachments,
      scopeKey: args.slackThreadId
        ? `slack:${args.slackThreadId}`
        : `chat:${conversation.id}`,
      signal: args.signal,
      serviceAnswerExamplesText,
      slackExecutionContext: args.slackExecutionContext,
      slackThreadId: args.slackThreadId ?? null,
      source: args.slackThreadId ? "slack" : "chat",
      user: args.user,
      userLabel: args.userMessageMetadata?.slackUserName
        ? args.userMessageMetadata.slackUserName
        : args.slackUserId
          ? "Slack participant"
          : "user",
      userMessage: llmUserMessage,
    });
    const requiredPresentationTexts = getOrgAgentRequiredPresentationTexts(
      llmResult.state
    );
    const exactServerText = [
      llmResult.state.stagedProposal?.preview,
      ...requiredPresentationTexts,
    ].filter((value): value is string => Boolean(value));
    const draftProse = exactServerText.reduce(
      (value, exact) => value.replace(exact, "").trim(),
      llmResult.reply
    );
    const corrected = await correctOrgAgentInternalTokenLeak({
      debugCalls: llmResult.debugCalls,
      model: llmResult.model,
      reasoningEffort: llmResult.state.toolResults.some(
        (result) =>
          result.name === "calibrate_role_hiring_brief" &&
          result.status === "success"
      )
        ? "max"
        : DEFAULT_ORG_AGENT_REASONING_EFFORT,
      reply: draftProse,
      signal: args.signal,
      strictModel: llmResult.state.toolResults.some(
        (result) =>
          result.name === "calibrate_role_hiring_brief" &&
          result.status === "success"
      ),
      usage: llmResult.usage,
      userMessage: llmUserMessage,
    });
    llmResult.model = corrected.model;
    llmResult.state.internalTokenCorrectionCount += corrected.attempted ? 1 : 0;
    llmResult.reply = enforceOrgAgentReplyInvariants(
      llmResult.state,
      corrected.reply ||
        llmResult.state.fallbackReply ||
        "내부 상태를 사람이 읽을 수 있는 표현으로 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (args.debug) {
      args.emit?.("llm_debug", summarizeLlmDebugCalls(llmResult.debugCalls));
    }
    const usedTool = llmResult.state.toolResults.length > 0;
    if (usedTool) {
      recordThinkingLog(
        nowLog("응답 생성 완료", "done", {
          icon: "run",
          id: "response",
        })
      );
    } else {
      // 일반 텍스트 응답에는 완료 상태를 메시지 위에 남기지 않는다.
      thinkingLogs.length = 0;
    }

    const metadata = {
      ...buildAssistantMetadata(llmResult),
      ...args.assistantMessageMetadata,
    };
    const reply = appendRequiredPresentations({
      reply: llmResult.reply,
      requiredTexts: requiredPresentationTexts,
    });

    if (llmResult.state.stagedProposal) {
      const presentationText = buildProposalPresentation({
        preview: llmResult.state.stagedProposal.preview,
        reply,
        summary: llmResult.state.stagedProposal.summary,
      });
      args.signal?.throwIfAborted();
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
      scheduleOrgAgentSummary({
        admin,
        conversation,
        model: isOrgAgentModelId(llmResult.model)
          ? llmResult.model
          : DEFAULT_ORG_AGENT_MODEL,
        slackThreadId: args.slackThreadId ?? null,
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

    args.signal?.throwIfAborted();
    const assistantMessage = await insertOrgAgentMessage({
      admin,
      content: reply,
      conversation,
      metadata,
      messageType: args.messageType,
      model: llmResult.model,
      role: "assistant",
      roleId,
      slackThreadId: args.slackThreadId,
      slackUserId: args.slackAssistantUserId,
      thinkingLogs,
    });
    args.emit?.("assistant_message", assistantMessage);

    scheduleOrgAgentSummary({
      admin,
      conversation,
      model: isOrgAgentModelId(llmResult.model)
        ? llmResult.model
        : DEFAULT_ORG_AGENT_MODEL,
      slackThreadId: args.slackThreadId ?? null,
    });

    return {
      assistantMessage,
      conversationId: conversation.id,
      kind: "message",
      model: llmResult.model,
      userMessage,
    };
  } catch (error) {
    args.signal?.throwIfAborted();
    thinkingLogs = upsertOrgAgentThinkingLog(
      thinkingLogs,
      nowLog("응답 생성 실패", "error", { icon: "run", id: "response" })
    );
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
      roleId,
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
