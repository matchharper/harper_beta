import { throwIfToolControlError } from "@/lib/llm/toolError";
import { formatToolError, serializeToolResultForModel } from "@/lib/llm/toolError";
import { runToolCall, unwrapToolCall, prepareToolDeliveryParts } from "@/lib/llm/toolExecution";
import { buildCompanyUpdatePrompt } from "./companyUpdate";
import { companyConversationReadAdmin } from "./companyReadScope.server";
import { recordOrgAgentFailure } from "./errorLogging";
import { buildCompanyContactEventPrompt } from "@/lib/org/agent/contactEventPrompt";
import { billingActionNotice } from "@/lib/org/billing/types";
import type { OrgLocale } from "@/i18n/org/locale";
import { loadCompanyContactEventContext } from "@/lib/org/agent/contactEvent.server";
import type { User } from "@supabase/supabase-js";
import { after } from "next/server";
import {
  createChatCompletionWithFallback,
  createChatCompletionStreamWithFallback,
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
  getSlackOrgAgentModel,
  getOrgAgentReasoningEffort,
  ORG_AGENT_TEMPERATURE,
  ORG_AGENT_GEMINI_FLASH_MODEL,
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
import { buildOrgAgentBackgroundResultMessages } from "@/lib/org/agent/backgroundResultPrompt";
import {
  backgroundResultResponseFormat,
  parseBackgroundResultParts,
  type BackgroundResultCandidateTarget,
} from "./backgroundResultParts";
import {
  buildCompanyConversationInput,
  buildCompanySystemInput,
} from "./input";
import {
  companyCompletionTokenBudget,
  companyCompletionProviderHint,
  validateCompanyCompletion,
} from "./completionContract";
import { createOrgAgentTextStream } from "./textStream";
import {
  continuationCapabilities,
  getCompanyCapabilityMode,
  resolveCompanyCapabilities,
  type CompanyCapabilityMode,
} from "./capabilities/resolver";
import { loadCompanyCapabilities } from "./capabilities/loader";
import { capabilityForTool } from "./capabilities/registry";
import {
  serializeOrgAgentToolError,
  formatOrgAgentToolResult,
} from "@/lib/org/agent/promptFormat";
import { maybeSummarizeOrgAgentConversation } from "@/lib/org/agent/summary";
import {
  ensureOrgAgentConversation,
  ensureOrgRoleCreationConversation,
  findOrgAgentSlackUserMessage,
  insertOrgAgentMessage,
  toOrgAgentMessage,
  type OrgAgentConversationRow,
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
import { isOrgAgentToolName } from "@/lib/org/agent/tools";
import type { CompanyCapabilityId } from "./capabilities/registry";
import type { CompanyMessageAudience } from "./companyMessaging";
import type { SlackRoleCreationExecutionContext } from "@/lib/org/agent/slackRoleCreation";
import {
  getOrgAgentToolCompletionMaxTokens,
  NORMAL_TOOL_COMPLETION_MAX_TOKENS,
} from "@/lib/org/agent/toolCompletionBudget";
import {
  fitOrgAgentToolResultToBudget,
  fitOrgAgentDiagnosticSupplements,
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
  OrgAgentMoreDataKind,
  OrgAgentMessage,
  OrgAgentMessageMetadata,
  OrgAgentThinkingLog,
} from "@/lib/org/agent/types";
import {
  finalizeOrgAgentThinkingLogs,
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
import {
  type LlmImageInput,
  type LlmMessageContent,
} from "@/lib/llm/imageInput";

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
  | "text_replace"
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
      assistantMessages: OrgAgentMessage[];
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
  content: LlmMessageContent;
  name?: string;
  reasoning_content?: string;
  reasoning_details?: unknown[];
  role: "assistant" | "system" | "tool" | "user";
  tool_call_id?: string;
  tool_calls?: OrgAgentLlmToolCall[];
};

// A completion may request several independent tools. Thirty calls is the
// explicit per-turn safety boundary; normal batch work should need far fewer
// model round trips.
const MAX_TOOL_LOOPS = 30;
const MAX_TOTAL_TOOL_CALLS = 30;
const TOOL_FREE_FINAL_MAX_TOKENS = 2_000;

export async function generateOrgAgentBackgroundResultReply(args: {
  companyUpdateContext?: Record<string, unknown>;
  model?: unknown;
  candidateTargets?: BackgroundResultCandidateTarget[];
  companyName: string;
  firstCompanyFirstResultDelivery?: boolean;
  requestedByCompany?: boolean;
  responseLocale?: OrgLocale;
  resultText: string;
  roleId: string;
  roleName: string;
  surface?: "chat" | "slack";
  userMessage: string;
}) {
  const resultText = normalizeText(args.resultText);
  if (!resultText) {
    throw new OrgHttpError(400, "background result is required");
  }
  const modelConfig = resolveOrgAgentModel(args.model);
  const surface = args.surface ?? "chat";
  const completion = await runCompletion({
    responseFormat: args.candidateTargets?.length
      ? backgroundResultResponseFormat(args.candidateTargets.map(candidate => candidate.id))
      : undefined,
    allowTools: false,
    maxTokens: TOOL_FREE_FINAL_MAX_TOKENS + (args.candidateTargets?.length ?? 0) * 100,
    messages: buildOrgAgentBackgroundResultMessages({
      companyUpdateContext: args.companyUpdateContext,
      candidateTargets: args.candidateTargets,
      companyName: args.companyName,
      firstCompanyFirstResultDelivery: args.firstCompanyFirstResultDelivery,
      requestedByCompany: args.requestedByCompany,
      requestMessage: args.userMessage,
      resultText,
      roleId: args.roleId,
      roleName: args.roleName,
      systemPrompt: buildOrgAgentSystemPrompt({
        surface,
        responseLocale: args.responseLocale ?? "auto",
        capabilityCatalogText: "",
        capabilityPolicyText: "",
      }),
    }),
    model: modelConfig.model,
    reasoningEffort: getOrgAgentReasoningEffort(modelConfig.model),
    surface,
  });
  const reply = extractAssistantText(
    completion.response?.choices?.[0]?.message
  ).trim();
  if (!reply)
    throw new Error("Company-side LLM returned an empty result reply");
  const parts = args.candidateTargets?.length
    ? parseBackgroundResultParts(reply, args.candidateTargets.map(candidate => candidate.id))
    : undefined;
  return {
    model: completion.model,
    reply: parts ? parts.map(part => part.text).join("\n\n") : reply,
    parts,
  };
}
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
      ...toolCall,
      function: {
        ...toolCall?.function,
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
  return "지금 답변을 마무리하지 못했어요. 잠시 후 다시 시도해 주세요.";
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

export function appendRequiredPresentations(args: {
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

export async function runOrgAgentCompletion(args: {
  allowTools: boolean;
  maxTokens: number;
  messages: OrgAgentLlmMessage[];
  model: OrgAgentModelId;
  onTextDelta?: (delta: string) => void | Promise<void>;
  reasoningEffort?: OrgAgentReasoningEffort;
  responseFormat?: { type: "json_schema"; json_schema: { name: string; strict?: boolean; schema: Record<string, unknown> } };
  signal?: AbortSignal;
  strictModel?: boolean;
  surface?: "chat" | "slack";
  tools?: ReturnType<typeof resolveCompanyCapabilities>["tools"];
  upstreamProvider?: string;
}) {
  if (args.allowTools && !args.tools?.length)
    throw new Error(
      "Tool-enabled completion requires an explicit resolved tool snapshot"
    );
  const maxTokens = companyCompletionTokenBudget(
    args.model,
    args.maxTokens,
    args.reasoningEffort
  );
  const request: Parameters<typeof createChatCompletionWithFallback>[0] = {
    ...(args.strictModel
      ? {}
      : {
          anthropicOverloadFallbackModel: getOrgAgentFallbackModel(args.model),
        }),
    buildRequest: (model) => ({
      ...(usesMaxCompletionTokensForModel(model)
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
      messages: args.messages as any,
      ...(args.responseFormat ? { response_format: args.responseFormat } : {}),
      temperature: ORG_AGENT_TEMPERATURE,
      // Gemini thought signatures must not cross provider implementations.
      ...(args.model === ORG_AGENT_GEMINI_FLASH_MODEL && args.upstreamProvider
        ? {
            provider: { only: [args.upstreamProvider], allow_fallbacks: false },
          }
        : {}),
      ...(args.allowTools
        ? {
            parallel_tool_calls: true,
            tool_choice: "auto" as const,
            tools: args.tools as any,
          }
        : {}),
    }),
    debugLabel: "org/agent:chat",
    validateResponse: validateCompanyCompletion,
    ...(args.reasoningEffort
      ? {
          chatCompletionReasoning: {
            reasoningEffort: args.reasoningEffort,
          },
        }
      : {}),
    ...(args.strictModel
      ? {}
      : { fallbackModel: getOrgAgentFallbackModel(args.model) }),
    model: args.model,
    openAIResponses: {
      reasoningEffort:
        args.reasoningEffort ?? DEFAULT_ORG_AGENT_REASONING_EFFORT,
    },
    signal: args.signal,
  };
  const startedAt = performance.now();
  let firstTextMs: number | null = null;
  try {
    const result = args.onTextDelta
      ? await createChatCompletionStreamWithFallback({
          ...request,
          onTextDelta: async (delta) => {
            firstTextMs ??= Math.round(performance.now() - startedAt);
            await args.onTextDelta!(delta);
          },
        })
      : await createChatCompletionWithFallback(request);
    console.info("[org/agent:completion]", {
      model: result.model,
      provider: result.response?.provider ?? null,
      generationId: result.response?.id ?? null,
      streaming: Boolean(args.onTextDelta),
      durationMs: Math.round(performance.now() - startedAt),
      firstTextMs,
      outputTokens: result.response?.usage?.completion_tokens ?? null,
      reasoningTokens:
        result.response?.usage?.completion_tokens_details?.reasoning_tokens ??
        null,
    });
    return result;
  } catch (error) {
    console.warn("[org/agent:completion-error]", {
      model: args.model,
      streaming: Boolean(args.onTextDelta),
      durationMs: Math.round(performance.now() - startedAt),
      firstTextMs,
      error: formatToolError(error),
    });
    throw error;
  }
}

const runCompletion = runOrgAgentCompletion;

// Dependencies are injected only by repository tests/evaluations, never by an
// HTTP request or model input. The default path is the production executor.
export type OrgAgentLoopDependencies = {
  complete?: typeof runOrgAgentCompletion;
  executeTool?: typeof executeOrgAgentTool;
  requestTime?: Date;
};

export async function runOrgAgentToolLoop(
  args: {
    allowSilentCompletion?: boolean;
    backgroundOrigin?: "scheduled_review";
    capabilityMode?: CompanyCapabilityMode;
    companyMessageAudience?: CompanyMessageAudience;
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
    onTextDelta?: (delta: string) => void | Promise<void>;
    onTextReset?: () => void;
    onToolStatus?: (log: OrgAgentThinkingLog) => void;
    onVisibleProgress?: (args: {
      model: string;
      text: string;
    }) => Promise<boolean>;
    assertCanContinue?: () => Promise<void>;
    mentions: OrgAgentMention[];
    model: OrgAgentModelId;
    /** Trusted caller override for this execution; shared model defaults stay unchanged. */
    reasoningEffort?: OrgAgentReasoningEffort;
    initialCapabilities?: readonly CompanyCapabilityId[];
    /** Server-owned execution boundary; never taken from model or request data. */
    allowedToolNames?: ReadonlySet<string>;
    responseLocale?: OrgLocale | "auto";
    readAudience: "caller" | "company_safe";
    referenceAttachments?: ChatAttachmentPayload[];
    imageInputs?: LlmImageInput[];
    scopeKey: string;
    serviceAnswerExamplesText?: string | null;
    signal?: AbortSignal;
    slackExecutionContext?: SlackRoleCreationExecutionContext | null;
    slackThreadId: string | null;
    source: "chat" | "slack";
    responseSurface?: "email";
    user: User;
    userLabel?: string | null;
    userMessage: string;
    visibleProgressPublished?: boolean;
  },
  dependencies: OrgAgentLoopDependencies = {}
) {
  const companySideUserPrompt = buildOrgAgentUserPrompt({
    context: args.context,
    mentions: args.mentions,
    serviceAnswerExamplesText: args.serviceAnswerExamplesText,
    slackContext: args.slackExecutionContext
      ? {
          channelId: args.slackExecutionContext.channelId,
          channelName: args.slackExecutionContext.channelName,
        }
      : null,
    userLabel: args.userLabel,
    userMessage: args.userMessage,
    requestTime: dependencies.requestTime,
  });
  const capabilityMode = args.capabilityMode ?? getCompanyCapabilityMode();
  const loadedCapabilities = continuationCapabilities(
    args.context.conversationMessages
  );
  // Trusted callers can expose known product capabilities without a loader round.
  // Availability does not grant authorization; execution keeps its normal checks.
  for (const capability of args.initialCapabilities ?? []) {
    loadedCapabilities.add(capability);
  }
  const messages: OrgAgentLlmMessage[] = [
    { role: "system", content: "" },
    ...buildCompanyConversationInput({
      context: args.context,
      mentions: args.mentions,
      serviceAnswerExamplesText: args.serviceAnswerExamplesText,
      slackContext: args.slackExecutionContext
        ? {
            channelId: args.slackExecutionContext.channelId,
            channelName: args.slackExecutionContext.channelName,
          }
        : null,
      userLabel: args.userLabel,
      userMessage: args.userMessage,
      currentUserMessageId: args.currentUserMessageId,
      imageInputs: args.imageInputs,
      requestTime: dependencies.requestTime,
    }),
  ];
  const state = createOrgAgentToolExecutionState(args.context);
  let activeModel = args.model;
  let activeReasoningEffort: OrgAgentReasoningEffort =
    args.reasoningEffort ?? getOrgAgentReasoningEffort(activeModel);
  let calibrationCompleted = false;
  let fallbackReason: ChatCompletionFallbackReason | null = null;
  let totalToolCalls = 0;
  let totalToolResultChars = 0;
  const supplementalResults: Array<{ index: number; content: string; diagnosticText?: string }> = [];
  const refreshSupplementalResults = () => {
    const refreshed = fitOrgAgentDiagnosticSupplements(supplementalResults, ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS - totalToolResultChars);
    supplementalResults.forEach((entry, index) => { messages[entry.index]!.content = refreshed[index]!; });
  };
  let toolBudgetReached = false;
  const usage = createTurnUsage();
  const debugCalls: LlmDebugCall[] = [];
  let visibleProgressPublished = args.visibleProgressPublished === true;
  let upstreamProvider: string | undefined;

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
    const resolved = resolveCompanyCapabilities({
      surface: args.source,
      emailReply: args.responseSurface === "email",
      mode: capabilityMode,
      loaded: loadedCapabilities,
      allowedToolNames: args.allowedToolNames,
    });
    const offeredTools = resolved.offeredToolNames;
    messages[0] = {
      role: "system",
      content: buildCompanySystemInput({
        resolved,
        surface: args.responseSurface ?? args.source,
        responseLocale: args.responseLocale,
        allowSilentCompletion: args.allowSilentCompletion,
        backgroundOrigin: args.backgroundOrigin,
      }),
    };
    refreshSupplementalResults();
    let completion: Awaited<ReturnType<typeof runCompletion>>;
    try {
      completion = await (dependencies.complete ?? runCompletion)({
        allowTools: true,
        maxTokens: getOrgAgentToolCompletionMaxTokens(state),
        messages,
        model: activeModel,
        onTextDelta: args.onTextDelta,
        reasoningEffort: activeReasoningEffort,
        signal: args.signal,
        strictModel: calibrationCompleted,
        surface: args.source,
        tools: resolved.tools,
        upstreamProvider,
      });
    } catch (error) {
      args.signal?.throwIfAborted();
      if (args.allowSilentCompletion) throw error;
      if (
        !state.fallbackReply &&
        !state.stagedProposal &&
        !state.requiredPresentationText &&
        !state.requiredSlackContinuationLink &&
        state.updateSummaries.length === 0
      )
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
        completionError: getLlmErrorMessage(error),
        state,
        usage,
      };
    }
    activeModel = completion.model as OrgAgentModelId;
    upstreamProvider ??= companyCompletionProviderHint(completion.response);
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
        reply:
          assistantText ||
          (args.allowSilentCompletion ? "" : buildFallbackReply(state)),
        state,
        usage,
      };
    }

    await args.assertCanContinue?.();

    // A terminal delivery command cannot partially execute alongside other work.
    if (toolCalls.some(call => call.function.name === "send_company_message") && toolCalls.length !== 1) {
      messages.push({ role: "assistant", content: assistantText || null, tool_calls: toolCalls } as OrgAgentLlmMessage);
      for (const call of toolCalls) messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name,
        content: JSON.stringify({ error: "terminal_command_must_be_alone", message: "No calls in this batch executed. Finish other work first, then commit the final company message batch alone." }) });
      continue;
    }

    const shouldAttemptVisibleProgress = Boolean(
      assistantText && !visibleProgressPublished && args.onVisibleProgress && !toolCalls.some(call => call.function.name === "send_company_message")
    );
    let deliveredThisStep = false;
    if (shouldAttemptVisibleProgress) {
      deliveredThisStep = await args.onVisibleProgress!({
        model: activeModel,
        text: assistantText,
      });
      // A failed provider delivery does not permit repeated progress attempts
      // for every later tool call. It only changes what the model may assume
      // the user has already seen.
      visibleProgressPublished = true;
    } else {
      // Tool-step prose which was not accepted as a progress message must not
      // remain in the terminal answer's live bubble.
      args.onTextReset?.();
    }

    messages.push({
      _responses_output: Array.isArray(responseMessage?._responses_output)
        ? responseMessage._responses_output
        : undefined,
      content: responseMessage?.content ?? "",
      reasoning_content:
        typeof responseMessage?.reasoning_content === "string"
          ? responseMessage.reasoning_content
          : undefined,
      reasoning_details: responseMessage?.reasoning_details,
      role: "assistant",
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      args.signal?.throwIfAborted();
      await args.assertCanContinue?.();
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
        toolBudgetReached = true;
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

      // Freeze the pre-completion snapshot: a loader in this batch cannot
      // retroactively authorize another call before its policy was exposed.
      if (!offeredTools.has(toolName)) {
        const requiredCapability = capabilityForTool(toolName);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolName,
          content: JSON.stringify({
            ok: false,
            error: "tool_not_offered",
            requiredCapability: requiredCapability ?? null,
            message:
              "Load the relevant capability and use its tool in a later response; no action occurred.",
          }),
        });
        state.toolResults.push({
          callId: toolCall.id,
          name: toolName,
          status: "error",
          summary: "이번 응답에 노출되지 않은 도구",
        });
        emitToolDebug({
          status: "skipped",
          summary: "tool not offered in completion snapshot",
        });
        continue;
      }
      if (toolName === "load_capabilities") {
        let result: ReturnType<typeof loadCompanyCapabilities>;
        try {
          result = loadCompanyCapabilities(
            parseToolArguments(toolCall.function.arguments),
            loadedCapabilities,
            args.source
          );
        } catch {
          result = {
            ok: false,
            error: "Invalid JSON; nothing was loaded.",
            validIds: [],
          };
        }
        const fitted = fitOrgAgentToolResultToBudget({
          remainingChars: Math.max(
            0,
            ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS - totalToolResultChars
          ),
          serializedResult: JSON.stringify(result),
        });
        const content = fitted.content;
        if (!fitted.complete) toolBudgetReached = true;
        totalToolResultChars += content.length;
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolName,
          content,
        });
        state.toolResults.push({
          callId: toolCall.id,
          name: toolName,
          status: result.ok ? "success" : "error",
          summary: result.ok ? "필요한 기능 지침 로드" : "기능 지침 로드 실패",
        });
        emitToolDebug({
          status: result.ok ? "completed" : "failed",
          summary: "capability load",
        });
        continue;
      }

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
      let executorStarted = false;
      let capturedDiagnostics: readonly unknown[] = [];
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
        executorStarted = true;
        const toolCapture = await runToolCall(() => (dependencies.executeTool ?? executeOrgAgentTool)({
          actorId: args.actorId,
          companyMessageAudience: args.companyMessageAudience,
          model: activeModel,
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
          signal: args.signal,
          user: args.user,
          recentConversationContext: args.context.conversationText,
          userMessage: args.userMessage,
        }), { callId: toolCall.id, name: toolName });
          capturedDiagnostics = toolCapture.diagnostics;
          const result = unwrapToolCall(toolCapture);
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
          calibrationCompleted = true;
        }
        const preparedResult = prepareToolDeliveryParts(toolCapture, value => formatOrgAgentToolResult(toolName, value));
        const serializedResult = preparedResult.content;
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
        supplementalResults.push({ index: messages.length - 1, content: boundedResult,
          ...(preparedResult.diagnosticText ? { diagnosticText: preparedResult.diagnosticText } : {}) });
        refreshSupplementalResults();
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
        throwIfToolControlError(error);
        args.signal?.throwIfAborted();
        const billingNotice = billingActionNotice(error);
        if (billingNotice) state.billingNotice = billingNotice;
        restoreLongTextVisibility({
          completeTargets: completeBefore,
          observedFingerprints: observedBefore,
          pendingRoleRequestIds: pendingRoleReadsBefore,
          state,
        });
        const isInputError =
          error instanceof OrgAgentToolInputError ||
          (error instanceof OrgHttpError && error.status < 500);
        const errorMessage = billingNotice
          ? "This action is blocked; repeating the same request will not resolve it."
          : error;
        console.error("[org/agent:tool]", {
          callId: toolCall.id,
          error: formatToolError(error),
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
          content: serializeToolResultForModel(error, () => serializeOrgAgentToolError({
            kind: billingNotice ? "blocked" : isInputError ? "input" : "execution",
            executed: executorStarted,
            message: errorMessage,
            name: toolName,
          }), billingNotice ? [] : capturedDiagnostics),
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
    if (assistantText) {
      messages.push({
        content: deliveredThisStep
          ? "The preceding assistant text was accepted by the surface adapter as the single visible progress update for this turn. Do not make the terminal response depend on the user having seen it."
          : "The preceding assistant text was retained only as internal turn history and was not delivered to the user. Do not assume the user saw it and do not emit another progress update.",
        role: "system",
      });
    }
    promoteOrgAgentToolReadVisibility(state);
    if (state.companyMessageBatch) return { debugCalls, fallbackReason, model: activeModel, reply: "", state, usage };
    if (toolBudgetReached || totalToolCalls >= MAX_TOTAL_TOOL_CALLS) break;
  }

  refreshSupplementalResults();
  let finalCompletion: Awaited<ReturnType<typeof runCompletion>>;
  try {
    finalCompletion = await (dependencies.complete ?? runCompletion)({
      allowTools: false,
      maxTokens: TOOL_FREE_FINAL_MAX_TOKENS,
      messages: [
        ...messages,
        {
          content: args.allowSilentCompletion
            ? "Tool use is finished for this turn. Write a company-facing response only if there is a useful verified result, warning, necessary question, or next step. Otherwise return no text."
            : "Tool use is finished for this turn. Write the final company-facing response from the verified results above.",
          role: "user",
        },
      ],
      model: activeModel,
      reasoningEffort: activeReasoningEffort,
      signal: args.signal,
      strictModel: calibrationCompleted,
      upstreamProvider,
      onTextDelta: args.onTextDelta,
    });
  } catch (error) {
    args.signal?.throwIfAborted();
    if (args.allowSilentCompletion) throw error;
    if (
      !state.fallbackReply &&
      !state.stagedProposal &&
      !state.requiredPresentationText &&
      !state.requiredSlackContinuationLink &&
      state.updateSummaries.length === 0
    )
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
      completionError: getLlmErrorMessage(error),
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
  const finalText = extractAssistantText(
    finalCompletion.response?.choices?.[0]?.message
  );
  return {
    debugCalls,
    fallbackReason,
    model: activeModel,
    reply: finalText
      ? enforceOrgAgentReplyInvariants(state, finalText)
      : args.allowSilentCompletion
        ? ""
        : enforceOrgAgentReplyInvariants(state, buildFallbackReply(state)),
    state,
    usage,
  };
}

export function buildAssistantMetadata(args: {
  fallbackReason: ChatCompletionFallbackReason | null;
  model: string;
  state: OrgAgentToolExecutionState;
  usage: OrgAgentTurnUsage;
}): OrgAgentMessageMetadata {
  const lastRequestChange = args.state.requestChanges.at(-1);
  return {
    ...(args.state.billingNotice && { billingNotice: args.state.billingNotice }),
    ...(args.state.actions.length > 0 && { actions: args.state.actions }),
    ...(args.state.candidateConnectionConfirmations.length > 0 && {
      candidateConnectionConfirmations:
        args.state.candidateConnectionConfirmations,
    }),
    ...(args.state.companyIntroDecisionConfirmations.length > 0 && {
      companyIntroDecisionConfirmations:
        args.state.companyIntroDecisionConfirmations,
    }),
    ...(args.state.contactDraftRef && {
      contactDraftRef: args.state.contactDraftRef,
    }),
    ...(args.state.contactDraftRefs.length > 0 && {
      contactDraftRefs: args.state.contactDraftRefs,
    }),
    fallbackReason: args.fallbackReason,
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

export class OrgAgentWebActionSupersededError extends Error {
  constructor() {
    super(
      "Company-side LLM web-action turn was superseded by a newer user message"
    );
    this.name = "OrgAgentWebActionSupersededError";
  }
}

export type OrgAgentWebActionTurnResult =
  | {
      outcome: "completed_message";
      batchId?: string;
      progressMessageId: number | null;
      terminalMessageId: number;
    }
  | {
      outcome: "completed_silent";
      progressMessageId: number | null;
      terminalMessageId: null;
    };

/**
 * Runs the existing company-side LLM for a verified product/contact event.
 * The web action is prompt context, not a visible synthetic chat message. Its
 * hidden anchor supplies the same stable idempotency identity used by ordinary
 * tool calls without changing the conversation's visible last message.
 */
export async function runOrgAgentWebActionTurn(args: {
  actionContext: Record<string, unknown>;
  actionName: string;
  actorLabel: string;
  anchorMessageId: number;
  conversation: OrgAgentConversationRow;
  jobId: string;
  roleId: string | null;
  user: User;
  responseLocale?: OrgLocale | "auto";
}): Promise<OrgAgentWebActionTurnResult> {
  const admin = await companyConversationReadAdmin({
    admin: getSupabaseAdmin(), workspaceId: args.conversation.company_workspace_id,
    roleId: String(args.actionContext.relatedRoleId ?? args.roleId ?? "").trim() || null,
  });
  const modelConfig = resolveOrgAgentModel(args.actionContext.slackThreadId ? getSlackOrgAgentModel() : undefined);
  const runId = args.jobId;
  const isCandidateContact = args.actionName === "candidate_contact_received";
  const isCompanyUpdate = args.actionName === "company_update";
  const slackThreadId = String(args.actionContext.slackThreadId ?? "").trim() || null;
  const companyMessageAlreadyDelivered = (args.actionContext.facts as Record<string, unknown> | undefined)?.companyMessageAlreadyDelivered === true;
  const trigger = isCandidateContact
    ? ("candidate_contact" as const)
    : ("web_action" as const);
  const { data: existingRows, error: existingError } = await (
    admin.from("company_messages" as any) as any
  )
    .select(
      "id, conversation_id, company_workspace_id, role_id, company_user_id, role, content, message_type, model, status, mentions, thinking_logs, metadata, created_at"
    )
    .eq("conversation_id", args.conversation.id)
    .eq("role", "assistant")
    .contains("metadata", { webActionJobId: args.jobId })
    .order("id", { ascending: true });
  if (existingError) throw existingError;
  const existingMessages = ((existingRows ?? []) as OrgAgentMessageRow[]).map(
    toOrgAgentMessage
  );
  const existingProgress = existingMessages.find(
    (message) => message.metadata.agentTurn?.phase === "progress"
  );
  const existingTerminal = existingMessages.find(
    (message) => message.metadata.agentTurn?.phase === "terminal"
  );
  const progressMessageId = existingProgress?.id ?? null;
  if (existingTerminal) {
    return {
      outcome: "completed_message",
      progressMessageId,
      terminalMessageId: existingTerminal.id,
    };
  }

  let companyMessageAudience: CompanyMessageAudience | undefined;
  let slackExecutionContext: SlackRoleCreationExecutionContext | undefined;
  if (isCompanyUpdate && slackThreadId) {
    const { data: thread, error: threadError } = await (admin.from("company_slack_threads") as any)
      .select("channel_id").eq("id", slackThreadId).single();
    if (threadError) throw threadError;
    const { data: channel, error: channelError } = await (admin.from("company_slack_channels") as any)
      .select("id,slack_channel_id,slack_channel_name,slack_team_id,is_enabled")
      .eq("id", thread.channel_id).eq("company_workspace_id", args.conversation.company_workspace_id).single();
    if (channelError) throw channelError;
    if (!channel.is_enabled) throw new Error("Company update Slack channel is disabled");
    companyMessageAudience = { channelDbId: channel.id, channelId: channel.slack_channel_id, jobId: args.jobId };
    if (typeof args.actionContext.slackUserId === "string") {
      const { resolveHarperSlackInteractionContext } = await import("../slackHarper");
      const { getOrgPublicSiteUrl } = await import("../slackMessages");
      const installation = await resolveHarperSlackInteractionContext({ workspaceId: args.conversation.company_workspace_id,
        channelId: channel.slack_channel_id, slackTeamId: channel.slack_team_id });
      slackExecutionContext = { channelDbId: channel.id, channelId: channel.slack_channel_id,
        channelName: channel.slack_channel_name ?? "", publicSiteUrl: getOrgPublicSiteUrl(),
        slackUserId: args.actionContext.slackUserId, sourceKey: args.jobId, token: installation.token };
    }
    const { data: batchRows, error: batchError } = await (admin.from("company_messages") as any)
      .select("id,metadata").eq("company_workspace_id", args.conversation.company_workspace_id)
      .contains("metadata", { webActionJobId: args.jobId }).eq("role", "assistant")
      .not("metadata->companyMessageBatch", "is", null).order("id");
    if (batchError) throw batchError;
    if (batchRows?.length) return { outcome: "completed_message", progressMessageId,
      terminalMessageId: Number(batchRows[0].id), batchId: batchRows[0].metadata.companyMessageBatch.batchId };
  }

  const assertCanContinue = async () => {
    // A new company turn does not erase a committed, undelivered event.
    if (isCompanyUpdate || isCandidateContact) return;
    let query = (admin.from("company_messages" as any) as any)
      .select("id")
      .eq("conversation_id", args.conversation.id)
      .in("message_type", slackThreadId ? ["chat", "slack"] : ["chat"])
      .eq("role", "user")
      .gt("id", args.anchorMessageId)
      .order("id", { ascending: true })
      .limit(1);
    if (slackThreadId) query = query.eq("slack_thread_id", slackThreadId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (data) throw new OrgAgentWebActionSupersededError();

  };

  await assertCanContinue();
  let contextConversation = args.conversation;
  const relatedRoleId = String(args.actionContext.relatedRoleId ?? args.roleId ?? "").trim();
  if (!contextConversation.role_id && relatedRoleId) {
    // The original private workspace conversation remains the output destination.
    // Read the shared Role history here; its relevant original instructions are
    // also available through the candidate's exact related company contacts.
    const { data, error } = await (admin.from("company_conversations" as any) as any)
      .select("id,company_workspace_id,role_id,metadata")
      .eq("company_workspace_id", args.conversation.company_workspace_id)
      .eq("role_id", relatedRoleId).single();
    if (error) throw error;
    contextConversation = { ...args.conversation, ...data };
  }
  const context = await buildOrgAgentPromptContext({
    admin,
    beforeMessageId: isCompanyUpdate || isCandidateContact ? undefined : args.anchorMessageId,
    includeSharedConversation: true,
    conversation: contextConversation,
    currentUserMessageId: args.anchorMessageId,
    messageType: slackThreadId ? "slack" : "chat",
    readAudience: "company_safe",
    scopeKey: slackThreadId
      ? `slack:${slackThreadId}`
      : `chat:${args.conversation.id}`,
    slackThreadId,
    user: args.user,
  });
  let thinkingLogs: OrgAgentThinkingLog[] = [];
  const contactContext = isCandidateContact
    ? await loadCompanyContactEventContext({
        relayId: String(args.actionContext.relayId ?? ""),
        workspaceId: args.conversation.company_workspace_id,
        allowPendingDelivery: args.actionContext.contactPendingDelivery === true,
      })
    : null;
  const eventContext = JSON.stringify(args.actionContext).slice(0, 24_000);
  const eventPrompt = isCompanyUpdate
    ? buildCompanyUpdatePrompt(args.actionContext)
    : isCandidateContact
    ? buildCompanyContactEventPrompt(contactContext!)
    : [
        "<authenticated_web_action_event>",
        `action_name=${args.actionName}`,
        `verified_action_context=${eventContext}`,
        "The action above has already committed and records what succeeded at that point in time. Fresh current state and tool results are authoritative if a later action has changed it. Do not repeat the action. Decide whether any useful follow-up work or company-facing message is warranted. It is not a chat command and does not require a reply.",
        "</authenticated_web_action_event>",
      ].join("\n");

  const llmResult = await runOrgAgentToolLoop({
    allowSilentCompletion: !isCompanyUpdate || companyMessageAlreadyDelivered,
    companyMessageAudience,
    slackExecutionContext,
    responseLocale: args.responseLocale ?? "auto",
    actorId: args.user.id,
    actorLabel: args.actorLabel,
    admin,
    assertCanContinue,
    context,
    conversation: contextConversation,
    currentUserMessageId: args.anchorMessageId,
    mentions: [],
    model: modelConfig.model,
    onToolStatus: (log) => {
      thinkingLogs = upsertOrgAgentThinkingLog(thinkingLogs, log);
    },
    readAudience: "company_safe",
    scopeKey: slackThreadId
      ? `slack:${slackThreadId}`
      : `chat:${args.conversation.id}`,
    slackThreadId,
    source: slackThreadId ? "slack" : "chat",
    user: args.user,
    userLabel: isCandidateContact
      ? "delivered candidate contact event"
      : "authenticated web action",
    userMessage: eventPrompt,
    visibleProgressPublished: Boolean(existingProgress),
  });

  if (llmResult.state.companyMessageBatch) return {
    outcome: "completed_message", progressMessageId,
    terminalMessageId: llmResult.state.companyMessageBatch.messageIds[0],
    batchId: llmResult.state.companyMessageBatch.batchId,
  };

  if (isCompanyUpdate && !companyMessageAlreadyDelivered && !llmResult.reply.trim()) throw new Error("Company update requires a message; retry without fabricating a fallback");
  const requiredPresentationTexts = getOrgAgentRequiredPresentationTexts(
    llmResult.state
  );
  const preservedPresentation = (args.actionContext.facts as any)?.preservedPresentation;
  if (preservedPresentation?.text) requiredPresentationTexts.push(preservedPresentation.text);
  if (contactContext?.deliveryCompleted === false) {
    // Exact candidate-authorized content is a preserved source, not generated
    // Harper copy. Quote formatting does not reinterpret its meaning.
    requiredPresentationTexts.push(contactContext.originalDeliveryBody.split("\n").map(line => `> ${line}`).join("\n"));
  }
  const metadata: OrgAgentMessageMetadata = {
    ...(preservedPresentation?.metadata ?? {}),
    ...buildAssistantMetadata(llmResult),
    agentTurn: {
      phase: "terminal",
      runId,
      sequence: progressMessageId ? 1 : 0,
      trigger,
    },
    source: "org_agent_web_action",
    webActionJobId: args.jobId,
  };
  if (preservedPresentation) Object.assign(metadata, {
    companyUpdatePresentation: preservedPresentation,
    companyUpdateReply: llmResult.reply,
  });
  const matchingRunId = (args.actionContext.facts as Record<string, unknown> | undefined)?.matchingSearchRunId;
  if (typeof matchingRunId === "string") {
    metadata.source = "company_matching_search_result";
    metadata.companyMatchingSearchResult = { runId: matchingRunId, idempotencyKey: args.jobId };
  }
  const reply = appendRequiredPresentations({
    reply: llmResult.reply,
    requiredTexts: requiredPresentationTexts,
  });

  await assertCanContinue();
  if (llmResult.state.stagedProposal) {
    const presentationText = buildProposalPresentation({
      preview: llmResult.state.stagedProposal.preview,
      reply,
      summary: llmResult.state.stagedProposal.summary,
    });
    const presented = await presentStagedProposal({
      admin,
      conversationId: args.conversation.id,
      messageMetadata: metadata,
      messageType: slackThreadId ? "slack" : "chat",
      model: llmResult.model,
      presentationText,
      slackThreadId,
      state: llmResult.state,
      thinkingLogs,
      userMessageId: args.anchorMessageId,
      workspaceId: args.conversation.company_workspace_id,
    });
    if (presented.kind !== "message") {
      throw new Error("Web-action proposal was not presented in chat");
    }
    scheduleOrgAgentSummary({
      admin,
      conversation: args.conversation,
      model: isOrgAgentModelId(llmResult.model)
        ? llmResult.model
        : DEFAULT_ORG_AGENT_MODEL,
      slackThreadId,
    });
    return {
      outcome: "completed_message",
      progressMessageId,
      terminalMessageId: presented.assistantMessage.id,
    };
  }

  if (!reply) {
    return {
      outcome: "completed_silent",
      progressMessageId,
      terminalMessageId: null,
    };
  }

  const terminalMessage = await insertOrgAgentMessage({
    admin,
    content: reply,
    conversation: args.conversation,
    metadata,
    messageType: slackThreadId ? "slack" : "chat",
    model: llmResult.model,
    role: "assistant",
    roleId: args.roleId,
    slackThreadId,
    thinkingLogs,
  });
  scheduleOrgAgentSummary({
    admin,
    conversation: args.conversation,
    model: isOrgAgentModelId(llmResult.model)
      ? llmResult.model
      : DEFAULT_ORG_AGENT_MODEL,
    slackThreadId,
  });
  return {
    outcome: "completed_message",
    progressMessageId,
    terminalMessageId: terminalMessage.id,
  };
}

export async function runOrgAgentChat(args: {
  /** Trusted email adapter: persisted source identity and current authorization. */
  emailExecution?: {
    conversationId: string;
    userMessage: OrgAgentMessage;
    assertCanContinue: () => Promise<void>;
  };
  assistantMessageMetadata?: OrgAgentMessageMetadata;
  attachments?: ChatAttachmentPayload[];
  debug?: boolean;
  emit?: OrgAgentChatEmitter;
  messageType?: string;
  messageUserId?: string | null;
  llmUserMessage?: string;
  imageInputs?: LlmImageInput[];
  mentions?: OrgAgentMention[];
  message: string;
  model?: unknown;
  initialCapabilities?: readonly CompanyCapabilityId[];
  initialDataKinds?: readonly OrgAgentMoreDataKind[];
  responseLocale?: OrgLocale;
  onAssistantProgress?: (message: OrgAgentMessage) => Promise<boolean>;
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
  turnRunId?: string;
}): Promise<OrgAgentChatResult> {
  const referenceAttachments = validateOrgAgentReferenceAttachments(
    Array.isArray(args.attachments) && args.attachments.length > 0
      ? args.attachments
      : referenceAttachmentsFromMetadata(args.userMessageMetadata)
  );
  const userMessageText =
    normalizeText(args.message) ||
    (referenceAttachments.length > 0 || args.imageInputs?.length
      ? args.responseLocale === "en"
        ? "Please use the attached materials when reviewing this role's hiring criteria."
        : "첨부한 자료를 이 역할의 인재 기준에 반영해 주세요."
      : "");
  if (!userMessageText) {
    throw new OrgHttpError(400, "message or attachment is required");
  }
  if (userMessageText.length > (args.emailExecution ? 32_000 : 8_000)) {
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
  const directTurnRunId = normalizeText(args.turnRunId) || crypto.randomUUID();
  const assistantMessages: OrgAgentMessage[] = [];
  const textStream = createOrgAgentTextStream(args.emit);
  const recordThinkingLog = (log: OrgAgentThinkingLog) => {
    thinkingLogs = upsertOrgAgentThinkingLog(thinkingLogs, log);
    args.emit?.("tool_status", log);
  };
  const { admin: conversationAdmin, conversation } = requestedRoleId
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
  if (args.emailExecution) {
    await args.emailExecution.assertCanContinue();
    if (conversation.id !== args.emailExecution.conversationId)
      throw new Error("Company email conversation access changed");
  }
  const roleId = conversation.role_id;
  const admin = await companyConversationReadAdmin({ admin: conversationAdmin, roleId, workspaceId: conversation.company_workspace_id });

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

  const messageUserId =
    args.messageUserId === undefined ? args.user.id : args.messageUserId;
  const userMessageMetadata: OrgAgentMessageMetadata = {
    model: modelConfig.model,
    source: "org_agent_user",
    ...args.userMessageMetadata,
    ...(referenceAttachments.length > 0
      ? {
          attachments:
            args.userMessageMetadata?.attachments ??
            referenceAttachmentMetadata(referenceAttachments),
          roleCreationAttachments: referenceAttachments,
        }
      : {}),
  };
  let userMessage = args.emailExecution?.userMessage ?? (
    args.slackThreadId && args.slackUserMessageTs
      ? await findOrgAgentSlackUserMessage({
          adoptInto: {
            conversation,
            roleId,
            userId: messageUserId,
          },
          admin,
          slackMessageTs: args.slackUserMessageTs,
          slackThreadId: args.slackThreadId,
          workspaceId: args.workspaceId,
        })
      : null);
  if (userMessage) {
    const mergedMetadata = {
      ...userMessage.metadata,
      ...userMessageMetadata,
    };
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
      content: userMessageText,
      conversation,
      mentions,
      metadata: userMessageMetadata,
      messageType: args.messageType,
      role: "user",
      roleId,
      slackMessageTs: args.slackUserMessageTs,
      slackThreadId: args.slackThreadId,
      slackUserId: args.slackUserId,
      userId: messageUserId,
    });
  }
  args.emit?.("user_message", userMessage);

  if (args.slackExecutionContext) {
    const { data: batchRows, error: batchError } = await (admin.from("company_messages") as any).select("*")
      .eq("company_workspace_id", args.workspaceId).eq("role", "assistant")
      .contains("metadata", { companyMessageBatch: { sourceMessageId: userMessage.id,
        channelDbId: args.slackExecutionContext.channelDbId } }).order("id");
    if (batchError) throw batchError;
    if (batchRows?.length) {
      const messages = (batchRows as OrgAgentMessageRow[]).map(toOrgAgentMessage);
      return { kind: "message" as const, assistantMessage: messages[0], assistantMessages: messages,
        conversationId: conversation.id, model: modelConfig.model, userMessage };
    }
  }

  if (args.slackThreadId && args.turnRunId) {
    const { data: priorProgress, error: priorProgressError } = await (
      admin.from("company_messages" as any) as any
    )
      .select(
        "id, conversation_id, company_workspace_id, role_id, company_user_id, role, content, message_type, model, status, mentions, thinking_logs, metadata, created_at"
      )
      .eq("conversation_id", conversation.id)
      .eq("message_type", "slack")
      .eq("role", "assistant")
      .contains("metadata", {
        agentTurn: { phase: "progress", runId: directTurnRunId },
      })
      .limit(1)
      .maybeSingle();
    if (priorProgressError) throw priorProgressError;
    if (priorProgress) {
      assistantMessages.push(
        toOrgAgentMessage(priorProgress as OrgAgentMessageRow)
      );
    }
  }

  let failureStage = "context";
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
        initialDataKinds: args.initialDataKinds,
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

    failureStage = "tool_loop";
    const llmResult = await runOrgAgentToolLoop({
      responseSurface: args.emailExecution ? "email" : undefined,
      assertCanContinue: args.emailExecution?.assertCanContinue,
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
      responseLocale: args.responseLocale,
      initialCapabilities: args.initialCapabilities,
      ...(!args.slackThreadId && args.emit
        ? {
            onTextDelta: textStream.append,
            onTextReset: () => textStream.replace(""),
          }
        : {}),
      onToolStatus: (log) => {
        thinkingLogs = upsertOrgAgentThinkingLog(thinkingLogs, log);
      },
      onVisibleProgress:
        args.emailExecution || (args.slackThreadId && !args.onAssistantProgress)
          ? undefined
          : async ({ model, text }) => {
              textStream.replace(text);
              const progressMessage = await insertOrgAgentMessage({
                admin,
                content: text,
                conversation,
                metadata: {
                  agentTurn: {
                    phase: "progress",
                    runId: directTurnRunId,
                    sequence: 0,
                    trigger: "direct_message",
                  },
                  model,
                  source: "org_agent_progress",
                  ...args.assistantMessageMetadata,
                },
                messageType: args.messageType,
                model,
                role: "assistant",
                roleId,
                slackThreadId: args.slackThreadId,
                slackUserId: args.slackAssistantUserId,
                thinkingLogs,
              });
              assistantMessages.push(progressMessage);
              args.emit?.("assistant_message", progressMessage);
              textStream.committed();
              return args.onAssistantProgress
                ? args.onAssistantProgress(progressMessage)
                : true;
            },
      readAudience: args.slackThreadId ? "company_safe" : "caller",
      referenceAttachments,
      imageInputs: args.imageInputs,
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
      visibleProgressPublished: assistantMessages.some(
        (message) => message.metadata.agentTurn?.phase === "progress"
      ),
    });
    await args.emailExecution?.assertCanContinue();
    if (args.emailExecution && llmResult.completionError)
      throw new Error(llmResult.completionError);
    failureStage = "response_persistence_and_presentation";
    if (llmResult.state.companyMessageBatch) {
      const { data: rows, error } = await (admin.from("company_messages") as any).select("*")
        .eq("company_workspace_id", args.workspaceId).in("id", llmResult.state.companyMessageBatch.messageIds).order("id");
      if (error) throw error;
      const batchMessages = (rows as OrgAgentMessageRow[]).map(toOrgAgentMessage);
      if (!batchMessages.length) throw new Error("Committed messages disappeared");
      return { kind: "message" as const, assistantMessage: batchMessages[0], assistantMessages: batchMessages,
        conversationId: conversation.id, model: llmResult.model, userMessage };
    }
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
    llmResult.reply = enforceOrgAgentReplyInvariants(
      llmResult.state,
      draftProse ||
        llmResult.state.fallbackReply ||
        "지금은 답변을 만들지 못했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (args.debug) {
      args.emit?.("llm_debug", summarizeLlmDebugCalls(llmResult.debugCalls));
    }
    const usedTool = llmResult.state.toolResults.length > 0;
    // 응답 생성은 실행 중에만 보여 주고, 완료된 Working log에는 실제 조회·작업만 남긴다.
    thinkingLogs = finalizeOrgAgentThinkingLogs(thinkingLogs, usedTool);

    const metadata = {
      ...buildAssistantMetadata(llmResult),
      ...args.assistantMessageMetadata,
      agentTurn: {
        phase: "terminal" as const,
        runId: directTurnRunId,
        sequence: assistantMessages.length,
        trigger: "direct_message" as const,
      },
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
      textStream.replace(presentationText);
      args.emit?.("assistant_message", presented.assistantMessage);
      textStream.committed();
      assistantMessages.push(presented.assistantMessage);
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
        assistantMessages,
        conversationId: conversation.id,
        kind: "message",
        model: llmResult.model,
        userMessage,
      };
    }

    textStream.replace(reply);

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
    textStream.committed();
    assistantMessages.push(assistantMessage);

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
      assistantMessages,
      conversationId: conversation.id,
      kind: "message",
      model: llmResult.model,
      userMessage,
    };
  } catch (error) {
    args.signal?.throwIfAborted();
    if (args.emailExecution) throw error;
    await recordOrgAgentFailure({
      admin,
      error,
      userId: args.user.id,
      workspaceId: conversation.company_workspace_id,
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      runId: directTurnRunId,
      slackThreadId: args.slackThreadId ?? null,
      slackReplyJobId: normalizeText(args.assistantMessageMetadata?.slackReplyJobId) || null,
      model: modelConfig.model,
      stage: failureStage,
    });
    thinkingLogs = upsertOrgAgentThinkingLog(
      thinkingLogs,
      nowLog("응답 생성 실패", "error", { icon: "run", id: "response" })
    );
    const detail = getVisibleErrorMessage(error);
    textStream.replace("");
    const message = args.responseLocale === "en"
      ? "I couldn't respond just now. Please try again shortly."
      : "지금은 에이전트 응답을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
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
    assistantMessages.push(assistantMessage);
    return {
      assistantMessage,
      assistantMessages,
      conversationId: conversation.id,
      kind: "message",
      model: modelConfig.model,
      userMessage,
    };
  }
}
