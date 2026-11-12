import Anthropic from "@anthropic-ai/sdk";
import { formatToolResultText } from "@/lib/llm/promptText";
import { tracedLlmFetch } from "@/lib/llm/providerTrace";
import { DEFAULT_CAREER_TEXT_CHAT_MODEL, resolveCareerTextChatModel, careerTextAssistantModelOptions, isCareerTextChatModelId, type CareerTextChatModelId } from "./textChatModelConfig";
import { throwIfToolControlError } from "@/lib/llm/toolError";
import {
  runToolCall,
  unwrapToolCall,
  prepareToolDelivery,
  observeToolCall,
} from "@/lib/llm/toolExecution";
import {
  serializeToolResultForModel,
  toolErrorResult,
} from "@/lib/llm/toolError";
import { formatCareerToolFailure } from "./toolFailure";
import type { CareerCapabilityRuntime } from "@/lib/career/capabilities/runtime";
import { CAREER_CAPABILITY_LOADER } from "@/lib/career/capabilities/registry";
import {
  createChatCompletionWithFallback,
  getLlmChatProviderForModel,
  resolveChatCompletionFallbackModelForError,
  supportsSamplingParametersForModel,
  supportsResponseFormatForModel,
  type ChatCompletionReasoningEffort,
} from "@/lib/llm/llm";
import type { OpenAIResponsesReasoningEffort } from "@/lib/llm/responsesChatAdapter";
import {
  logLlmTokenUsage,
  logLlmTokenUsageForToolCalls,
} from "@/lib/llm/usageLogging";
import {
  CLAUDE_MODEL,
  GPT_6_LUNA_MODEL,
  GPT_61_SOL_MODEL,
  GPT_61_TERRA_MODEL,
} from "@/lib/llm/modelConfig";
import {
  runTalentAssistantCompletion,
  runTalentAssistantToolLoop,
  type TalentChatMessage,
  type TalentChatTool,
} from "@/lib/talentOnboarding/llm";
import {
  logTalentToolCall,
  logTalentToolError,
  logTalentToolResult,
} from "@/lib/talentOnboarding/toolLogging";
import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import { buildCareerToolPolicyPrompt } from "@/lib/career/prompts/toolPolicyPrompt";
import { orderCareerPromptBlocksForCaching } from "@/lib/career/prompts/promptCaching";

export const CAREER_LLM_CONFIG = {
  // 커리어 제품군의 LLM/Realtime 기본 설정 모음.
  // runCareer* wrapper 기반 호출은 여기 값을 거치며, 일부 직접 호출도 아래
  // 개별 섹션을 참조한다. 단, legacy candidate search/chat, embedding lookup,
  // worker-side opportunity agent는 별도 런타임이다.
  //
  // 공통 talent assistant 모델 설정. runTalentAssistantCompletion/ToolLoop 기반
  // wrapper들이 primary/general fallback/Anthropic overload fallback을 공유한다.
  // 사용처: 일반 커리어 채팅, kickoff, onboarding defer,
  // profile ingestion, refresh insights, ops 요약/추천, additional question selector.
  assistant: {
    anthropicOverloadFallbackModel: DEFAULT_CAREER_TEXT_CHAT_MODEL,
    openAIResponsesReasoningEffort: resolveCareerTextChatModel(DEFAULT_CAREER_TEXT_CHAT_MODEL).openAIResponsesReasoningEffort,
    primaryModel: DEFAULT_CAREER_TEXT_CHAT_MODEL,
    fallbackModel: DEFAULT_CAREER_TEXT_CHAT_MODEL,
  },
  // 일반 텍스트 커리어 채팅 설정. Realtime 전화/음성 응답에는 적용되지 않는다.
  // prompt에는 structured profile, 최근 activity, 최근 추천 기회 10개 compact summary,
  // 현재 opportunity run 상태와 tool policy가 함께 들어간다.
  // 사용처: /api/talent/chat, src/lib/career/chatTurn.ts,
  // onboarding completion wrapup에서 유저 메시지에 답하거나 tool loop를 돌릴 때.
  chat: {
    maxTokens: 12288,
    temperature: 0.7,
  },
  // 대화 저장/응답 이후 assistant 답변에서 structured insight JSON을 뽑을 때.
  // 사용처: /api/talent/chat, /api/talent/chat/save.
  insightExtraction: {
    fallbackModel: CLAUDE_MODEL,
    model: GPT_6_LUNA_MODEL,
    reasoningEffort: "high" as const,
    temperature: 0.2,
  },
  // 긴 talent chat history를 rolling summary로 압축할 때.
  // 사용처: maybeSummarizeTalentConversation.
  conversationSummary: {
    model: GPT_6_LUNA_MODEL,
    reasoningEffort: "high" as const,
    temperature: 0.2,
  },
  // Realtime 통화 종료 후 call note를 남길 가치가 있는지 판단하고,
  // 읽기 전용 제목과 핵심 포인트를 구조화된 JSON으로 생성할 때.
  callNoteAnalysis: {
    fallbackModel: CLAUDE_MODEL,
    maxTokens: 600,
    model: GPT_6_LUNA_MODEL,
    reasoningEffort: "low" as const,
    temperature: 0.1,
  },
  // 온보딩을 지금 끝내지 않고 나중으로 미룰 때 닫는 응답을 생성한다.
  // 모델은 assistant.primary/fallback을 쓰고 여기서는 온도만 조정한다.
  // 사용처: /api/talent/onboarding/defer.
  onboardingDeferClose: {
    temperature: 0.3,
  },
  // 외부 JD를 짧은 role summary로 압축할 때.
  // 모델은 assistant.primary/fallback을 쓴다.
  // 사용처: external role ingestion/sync 중 description_summary 생성.
  opsRoleSummary: {
    temperature: 0.2,
  },
  // 공개 external job posting 추천 tool 내부의 3단계 LLM.
  // plan: 유저 요청/프로필을 DB 검색 계획으로 변환.
  // shortlist: 검색 후보가 많을 때 compact card 기준으로 상세 후보를 축소.
  // finalSelection: 상세 후보 중 최종 추천과 fit reason JSON 생성.
  // 사용처: src/lib/talentOnboarding/jobPostingRecommendations.ts.
  recommendJobPostings: {
    anthropicOverloadFallbackModel: GPT_6_LUNA_MODEL,
    fallbackModel: GPT_6_LUNA_MODEL,
    finalSelectionModel: GPT_6_LUNA_MODEL,
    finalSelectionReasoningEffort: "high" as const,
    finalSelectionTemperature: 0.2,
    planModel: GPT_6_LUNA_MODEL,
    planReasoningEffort: "low" as const,
    planTemperature: 0.2,
    shortlistModel: GPT_6_LUNA_MODEL,
    shortlistReasoningEffort: "high" as const,
    shortlistTemperature: 0.1,
    fullJdPlanModel: GPT_6_LUNA_MODEL,
    fullJdPlanReasoningEffort: "high" as const,
    fullJdPlanTemperature: 0.2,
    fullJdScoringModel: GPT_6_LUNA_MODEL,
    fullJdScoringReasoningEffort: "high" as const,
  },
  // LinkedIn/이력서/입력 링크에서 가져온 profile raw data를 정규화/보강할 때.
  // 모델은 assistant.primary/fallback을 쓴다.
  // 사용처: src/lib/talentOnboarding/profileIngestion.ts.
  profileIngestion: {
    maxTokens: 40_000,
    temperature: 0.1,
  },
  // Realtime 세션 생성 설정.
  // 사용처: /api/realtime/token.
  realtime: {
    model: "gpt-realtime-2.1",
    speechSpeed: 1.1,
    transcriptionModel: "gpt-4o-transcribe",
    voice: "cedar",
  },
  // GPT Live는 음성 프런트엔드와 Responses 기반 판단 모델을 분리한다.
  // 기존 Realtime 경로와 섞지 않고 /api/live/session에서만 사용한다.
  live: {
    delegationModel: GPT_61_TERRA_MODEL,
    delegationReasoningEffort: "medium" as const,
    model: "gpt-live-1",
    voice: "cedar",
  },
  // 기본 Exa 검색 자료와 개인 맥락을 받은 모델이 필요할 때 직접
  // 검색 도구를 사용하면서 회사 조사 글 전체를 완성한다.
  // 사용처: src/lib/career/companySnapshot.ts 의 runCompanySnapshotResearch.
  companySnapshotResearch: {
    primaryModel: GPT_61_SOL_MODEL,
    reasoningEffort: "high" as const,
  },
  // 기존 프로필/대화에서 비어 있는 insight key만 채우는 내부 refresh 작업.
  // 모델은 assistant.primary/fallback을 쓰고 JSON 응답을 기대한다.
  // 사용처: /api/internal/career/refresh-insights.
  refreshInsights: {
    temperature: 0.2,
  },
  // Internal opportunity를 유저가 수락한 직후, 회사 전달 품질을 높이기 위한
  // 선택형 통화 요청이 필요한지 판단한다.
  // 사용처: src/lib/talentOnboarding/internalOpportunityCallRequest.ts.
  internalOpportunityCallRequest: {
    model: GPT_61_SOL_MODEL,
    reasoningEffort: "high" as const,
    temperature: 0.15,
  },
  // 온보딩/프로필 입력 직후 첫 kickoff 메시지를 만들 때.
  // 모델은 assistant.primary/fallback을 쓴다.
  // 사용처: src/lib/talentOnboarding/kickoff.ts.
  kickoff: {
    temperature: 0.25,
  },
} as const;

const isAbortLikeError = (error: unknown) =>
  Boolean(
    error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "AbortError"
  );

type DirectOpenAIMessage = {
  content: string;
  role: "system" | "user" | "assistant";
};

type CareerChatSystemBlock = {
  cacheable?: boolean;
  key?: string;
  text: string;
};

type AnthropicCacheControl = {
  type: "ephemeral";
};

type AnthropicTextBlock = {
  cache_control?: AnthropicCacheControl;
  text: string;
  type: "text";
};

type AnthropicToolUseBlock = {
  id: string;
  input: Record<string, unknown>;
  name: string;
  type: "tool_use";
};

type AnthropicToolResultBlock = {
  content: string;
  is_error?: boolean;
  tool_use_id: string;
  type: "tool_result";
};

type AnthropicThinkingBlock = {
  signature: string;
  thinking: string;
  type: "thinking";
};

type AnthropicRedactedThinkingBlock = {
  data: string;
  type: "redacted_thinking";
};

type AnthropicAssistantContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicThinkingBlock
  | AnthropicRedactedThinkingBlock;
type AnthropicUserContentBlock = AnthropicTextBlock | AnthropicToolResultBlock;

type AnthropicMessage = {
  content:
    | string
    | AnthropicAssistantContentBlock[]
    | AnthropicUserContentBlock[];
  role: "assistant" | "user";
};

type AnthropicTool = {
  cache_control?: AnthropicCacheControl;
  description: string;
  input_schema: Record<string, unknown>;
  name: string;
};

type AnthropicMessageResponse = {
  content?: AnthropicAssistantContentBlock[];
  id?: string;
  model?: string;
  stop_reason?: string | null;
  usage?: Anthropic.Usage | Record<string, unknown>;
};

type AnthropicStreamEvent = {
  content_block?: {
    data?: string;
    id?: string;
    input?: Record<string, unknown>;
    name?: string;
    signature?: string;
    text?: string;
    thinking?: string;
    type?: string;
  };
  delta?: {
    partial_json?: string;
    signature?: string;
    stop_reason?: string | null;
    stop_sequence?: string | null;
    text?: string;
    thinking?: string;
    type?: string;
  };
  error?: {
    message?: string;
    type?: string;
  };
  index?: number;
  message?: {
    id?: string;
    model?: string;
    stop_reason?: string | null;
    usage?: Record<string, unknown>;
  };
  type?: string;
  usage?: Record<string, unknown>;
};

type AnthropicStreamToolState = {
  id: string;
  inputJson: string;
  name: string;
};

type AnthropicToolUseStart = {
  id: string;
  name: string;
};

type LlmToolCostAttribution = {
  step: string;
  toolNames: readonly string[];
};

export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";

const MAX_STREAMING_TOOL_CALLS_PER_TURN = 3;
const RESUME_TOOL_CALL_LIMIT = 8;

function cleanModelText(raw: string) {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function flattenCareerSystemBlocks(blocks: CareerChatSystemBlock[]) {
  return blocks
    .map((block) => block.text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n");
}

function buildAnthropicSystemBlocks(blocks: CareerChatSystemBlock[]) {
  const normalizedBlocks = blocks.filter(
    (block) => block.text.trim().length > 0
  );
  const cacheIndexes = new Set<number>();
  const profileContextIndex = normalizedBlocks.findIndex(
    (block) => block.key === "profile_context"
  );

  if (profileContextIndex >= 0) {
    // Explicit data boundaries keep tool policies and per-turn state outside
    // both reusable prefixes, including when Brief/Memory is empty.
    for (const [index, block] of normalizedBlocks.entries()) {
      if (
        block.cacheable &&
        (block.key === "profile_context" ||
          block.key === "future_matching_insights")
      ) {
        cacheIndexes.add(index);
      }
    }
  } else {
    const lastCacheableIndex = normalizedBlocks.reduce(
      (index, block, currentIndex) => (block.cacheable ? currentIndex : index),
      -1
    );
    if (lastCacheableIndex >= 0) {
      cacheIndexes.add(lastCacheableIndex);
    }
  }

  return normalizedBlocks.map((block, index) => ({
    type: "text" as const,
    text: block.text,
    ...(cacheIndexes.has(index)
      ? { cache_control: { type: "ephemeral" as const } }
      : {}),
  }));
}

function buildAnthropicTools(tools: TalentChatTool[]) {
  const normalizedTools = tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));
  const lastIndex = normalizedTools.length - 1;
  const coreBoundary = normalizedTools.findIndex(
    (tool) => tool.name === CAREER_CAPABILITY_LOADER
  );

  return normalizedTools.map((tool, index) => ({
    ...tool,
    ...(index === lastIndex || index === coreBoundary
      ? { cache_control: { type: "ephemeral" as const } }
      : {}),
  })) as AnthropicTool[];
}

function getTalentChatToolName(tool: TalentChatTool) {
  return tool.function.name;
}

function normalizeUniqueToolNames(toolNames: readonly string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const toolName of toolNames) {
    const name = String(toolName ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    normalized.push(name);
  }
  return normalized;
}

function buildScopedContinuationToolPolicy(args: {
  callableToolNames: readonly string[];
  executedToolNames: readonly string[];
  isOnboardingActive?: boolean;
  responseLocale?: string | null;
  applicationPreparation?: boolean;
  backgroundInvocation?: boolean;
}) {
  const callableToolNames = normalizeUniqueToolNames(args.callableToolNames);
  const executedToolNames = normalizeUniqueToolNames(args.executedToolNames);
  const policyToolNames = normalizeUniqueToolNames([
    ...callableToolNames,
    ...executedToolNames,
  ]);
  if (policyToolNames.length === 0) return "";

  const rawPolicy = buildCareerToolPolicyPrompt({
    channel: "chat",
    isOnboardingActive: args.isOnboardingActive,
    preferredLocale: args.responseLocale,
    toolNames: policyToolNames,
    applicationPreparation: args.applicationPreparation,
    backgroundInvocation: args.backgroundInvocation,
  });
  if (!rawPolicy.trim()) return "";

  const rawPolicyLines = rawPolicy.split("\n");
  const policyBody =
    rawPolicyLines[0] === "## Tool Use Policy" &&
    rawPolicyLines[1]?.startsWith("Callable tools in this response:")
      ? rawPolicyLines.slice(2)
      : rawPolicyLines[0] === "## Tool Use Policy"
        ? rawPolicyLines.slice(1)
        : rawPolicyLines;

  return [
    "## Tool Use Policy",
    `Callable tools in this continuation: ${
      callableToolNames.length > 0 ? callableToolNames.join(", ") : "none"
    }.`,
    `Tools executed in this user turn (earlier turns are not listed): ${
      executedToolNames.length > 0 ? executedToolNames.join(", ") : "none"
    }.`,
    "Only policies for currently callable tools and tools executed in this user turn are in scope. This list does not audit prior turns. Do not call a tool absent from the current API schema.",
    ...policyBody,
  ].join("\n");
}

function withScopedContinuationToolPolicy(args: {
  callableToolNames: readonly string[];
  executedToolNames: readonly string[];
  isOnboardingActive?: boolean;
  responseLocale?: string | null;
  systemBlocks: CareerChatSystemBlock[];
}) {
  // Normal Career keeps its shared contract unchanged throughout the tool loop.
  // Callable schemas and tool results already describe this step's execution facts.
  if (args.systemBlocks.some((block) => block.key === "career_main")) {
    return args.systemBlocks;
  }
  const toolPolicy = buildScopedContinuationToolPolicy({
    callableToolNames: args.callableToolNames,
    executedToolNames: args.executedToolNames,
    isOnboardingActive: args.isOnboardingActive,
    responseLocale: args.responseLocale,
    applicationPreparation: args.systemBlocks.some(
      (block) => block.key === "application_preparation_contract"
    ),
    backgroundInvocation: args.systemBlocks.some(
      (block) => block.key === "background_execution"
    ),
  });
  const replacementBlock: CareerChatSystemBlock | null = toolPolicy
    ? {
        key: "tool_policy",
        text: toolPolicy,
        cacheable: true,
      }
    : null;
  const toolPolicyIndex = args.systemBlocks.findIndex(
    (block) => block.key === "tool_policy"
  );

  if (toolPolicyIndex >= 0) {
    return orderCareerPromptBlocksForCaching(
      replacementBlock
        ? args.systemBlocks.map((block, index) =>
            index === toolPolicyIndex ? replacementBlock : block
          )
        : args.systemBlocks.filter((_, index) => index !== toolPolicyIndex)
    );
  }

  if (!replacementBlock) return args.systemBlocks;

  const talentContextIndex = args.systemBlocks.findIndex(
    (block) => block.key === "future_matching_insights"
  );
  const contextIndex =
    talentContextIndex >= 0
      ? talentContextIndex
      : args.systemBlocks.findIndex((block) => block.key === "profile_context");
  if (contextIndex < 0) return [...args.systemBlocks, replacementBlock];

  return orderCareerPromptBlocksForCaching([
    ...args.systemBlocks.slice(0, contextIndex + 1),
    replacementBlock,
    ...args.systemBlocks.slice(contextIndex + 1),
  ]);
}

function shouldLogCareerChatLlmRequestBody(usageLabel: string | undefined) {
  return Boolean(usageLabel?.startsWith("career/chat:assistant"));
}

function logCareerChatLlmRequestBody(args: {
  requestBody: unknown;
  stream: boolean;
  usageLabel?: string;
}) {
  if (!shouldLogCareerChatLlmRequestBody(args.usageLabel)) return;

  // console.info(
  //   args.stream
  //     ? "[career-chat:llm-request-body:stream]"
  //     : "[career-chat:llm-request-body]",
  //   JSON.stringify(args.requestBody, null, 2)
  // );
}

function extractAnthropicText(
  blocks: AnthropicAssistantContentBlock[] | undefined
) {
  if (!Array.isArray(blocks)) return "";

  return blocks
    .filter((block): block is AnthropicTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function getAnthropicToolUseNames(
  blocks: AnthropicAssistantContentBlock[] | undefined
) {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .filter(
      (block): block is AnthropicToolUseBlock => block.type === "tool_use"
    )
    .map((block) => String(block.name ?? "").trim())
    .filter(Boolean);
}

const renderCareerToolResult = formatToolResultText;

export function serializeCareerToolResultForModel(result: unknown) {
  return serializeToolResultForModel(result, renderCareerToolResult);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildAssistantInstructionsFromToolResults(results: unknown[]) {
  const instructions: string[] = [];

  for (const result of results) {
    if (!isPlainRecord(result)) continue;

    const assistantInstruction = result.assistantInstruction;
    if (typeof assistantInstruction === "string") {
      const normalized = assistantInstruction.trim();
      if (normalized) instructions.push(normalized);
    }
  }

  if (instructions.length === 0) return "";

  return [
    "Additional tool-result instruction:",
    ...Array.from(new Set(instructions)).map(
      (instruction) => `- ${instruction}`
    ),
  ].join("\n");
}

export function buildToolResultFollowupInstruction(
  responseLocale?: string | null,
  responseContract?: string
) {
  const outputLanguage = getCareerPromptLanguageName(responseLocale);

  if (responseContract)
    return [
      `Continue any unfinished authorized work with the available tools. Once it is saved or needs user input, reply in ${outputLanguage} under the active task's response contract:`,
      responseContract,
    ].join("\n\n");

  // The system and active handbook already own continuation and presentation.
  // Re-appending a user-level reporting instruction after every result can turn
  // an intermediate execution receipt into a premature final reply.
  return "";
}

function buildStreamingToolContinuationInstruction(args: {
  callableToolNames?: readonly string[];
  forceFinalAnswer?: boolean;
}) {
  if (args.forceFinalAnswer) {
    return "No additional tools are callable for this turn. Answer now using the available conversation and tool results.";
  }

  const callableToolNames = (args.callableToolNames ?? [])
    .map((name) => name.trim())
    .filter(Boolean);
  if (callableToolNames.length === 0) return "";

  return [
    "For this continuation step, only these tools are callable:",
    callableToolNames.map((name) => `- ${name}`).join("\n"),
  ].join("\n");
}

function buildEmptyVisibleTextRecoveryInstruction(
  responseLocale?: string | null
) {
  const outputLanguage = getCareerPromptLanguageName(responseLocale);

  return [
    "The previous assistant generation produced no visible user-facing text.",
    `Continue as Harper from the exact current conversation state in ${outputLanguage}.`,
    "Use any tool result text already present in the conversation.",
  ].join(" ");
}

function withToolResultFollowupInstruction(
  blocks: AnthropicToolResultBlock[],
  responseLocale?: string | null,
  options?: {
    toolResults?: unknown[];
    responseContract?: string;
    callableToolNames?: readonly string[];
    forceFinalAnswer?: boolean;
  }
): AnthropicUserContentBlock[] {
  if (blocks.length === 0) return blocks;
  const assistantInstructions = buildAssistantInstructionsFromToolResults(
    options?.toolResults ?? []
  );
  const streamingContinuationInstruction =
    buildStreamingToolContinuationInstruction({
      callableToolNames: options?.callableToolNames,
      forceFinalAnswer: options?.forceFinalAnswer,
    });
  const instruction = [
    buildToolResultFollowupInstruction(
      responseLocale,
      options?.responseContract
    ),
    assistantInstructions,
    streamingContinuationInstruction,
  ]
    .filter((text) => text.trim().length > 0)
    .join("\n\n");
  return instruction
    ? [...blocks, { type: "text", text: instruction }]
    : blocks;
}

function appendTextToUserContent(
  content: AnthropicMessage["content"],
  text: string
): string | AnthropicUserContentBlock[] {
  if (typeof content === "string") {
    return `${content.trimEnd()}\n\n${text}`;
  }

  return [
    ...(content as AnthropicUserContentBlock[]),
    {
      type: "text",
      text,
    },
  ];
}

function appendUserInstructionToMessages(
  messages: AnthropicMessage[],
  instruction: string
): AnthropicMessage[] {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === "user") {
    return [
      ...messages.slice(0, -1),
      {
        ...lastMessage,
        content: appendTextToUserContent(lastMessage.content, instruction),
      },
    ];
  }

  return [
    ...messages,
    {
      role: "user",
      content: instruction,
    },
  ];
}

function stringifyAnthropicContent(content: AnthropicMessage["content"]) {
  if (typeof content === "string") return content;

  return content
    .map((block) => {
      if (block.type === "text") return block.text;
      if (block.type === "tool_use") {
        return `[Assistant requested ${block.name}: ${serializeCareerToolResultForModel(
          block.input
        )}]`;
      }
      if (block.type === "tool_result") {
        return `[Tool result${block.is_error ? " error" : ""}: ${
          block.content
        }]`;
      }
      return "";
    })
    .filter((text) => text.trim().length > 0)
    .join("\n");
}

function buildDirectRecoveryMessages(args: {
  messages: AnthropicMessage[];
  responseLocale?: string | null;
  systemBlocks: CareerChatSystemBlock[];
}): DirectOpenAIMessage[] {
  return [
    {
      role: "system",
      content: [
        flattenCareerSystemBlocks(args.systemBlocks),
        buildEmptyVisibleTextRecoveryInstruction(args.responseLocale),
      ]
        .filter((text) => text.trim().length > 0)
        .join("\n\n"),
    },
    ...args.messages
      .map(
        (message): DirectOpenAIMessage => ({
          role: message.role,
          content: stringifyAnthropicContent(message.content),
        })
      )
      .filter((message) => message.content.trim().length > 0),
  ];
}

function parseAnthropicToolInput(raw: string): Record<string, unknown> {
  const text = raw.trim();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : { value: parsed };
  } catch {
    return { _raw: raw };
  }
}

function shouldUseAnthropicNativeMessages(model: string, resumedTransport?: "anthropic" | "chat") {
  // Saved transcripts retain their wire format across credential/config changes.
  if (resumedTransport) return resumedTransport === "anthropic";
  return (
    getLlmChatProviderForModel(model) === "anthropic" &&
    Boolean((process.env.ANTHROPIC_API_KEY ?? "").trim())
  );
}

function initialAnthropicMessages(
  history: readonly AnthropicMessage[],
  runtime?: CareerCapabilityRuntime
): AnthropicMessage[] {
  const messages = history.filter(message =>
    typeof message.content !== "string" || message.content.trim().length > 0
  );
  if (runtime?.options.promptArgs().backgroundInvocation && messages.at(-1)?.role !== "user") {
    // Claude requires a user-role turn here. Represent the server event in
    // the transport without removing the candidate's previous conversation.
    messages.push({
      role: "user",
      content: [{ type: "text", text: "Server event: Continue the Career work described in the triggering context. This is not a user message or new authorization." }],
    });
  }
  return messages;
}

function supportsAnthropicEffort(model: string) {
  const normalized = model.trim().toLowerCase();
  return (
    normalized === "claude-haiku-5-5" ||
    normalized.startsWith("claude-haiku-5-5-") ||
    normalized === "claude-sonnet-5" ||
    normalized.startsWith("claude-sonnet-5-") ||
    normalized === "claude-sonnet-4-6" ||
    normalized.startsWith("claude-sonnet-4-6-") ||
    normalized === "claude-opus-4-8" ||
    normalized.startsWith("claude-opus-4-8-") ||
    normalized === "claude-opus-4-7" ||
    normalized.startsWith("claude-opus-4-7-") ||
    normalized === "claude-opus-4-6" ||
    normalized.startsWith("claude-opus-4-6-") ||
    normalized === "claude-opus-4-5" ||
    normalized.startsWith("claude-opus-4-5-") ||
    normalized === "claude-fable-5" ||
    normalized.startsWith("claude-fable-5-") ||
    normalized === "claude-mythos-5" ||
    normalized.startsWith("claude-mythos-5-") ||
    normalized === "claude-mythos-preview" ||
    normalized.startsWith("claude-mythos-preview-")
  );
}

function resolveCareerChatEffort(
  usageLabel: string | undefined
): AnthropicEffort {
  const normalized = String(usageLabel ?? "").trim();
  if (
    normalized.startsWith("career/chat:session_reengagement") ||
    normalized.startsWith("career/chat:opportunity_feedback_followup")
  ) {
    return "low";
  }
  return "medium";
}

function buildAnthropicOutputConfig(args: {
  // null delegates effort to the model; undefined retains the existing chat setting.
  anthropicEffort?: AnthropicEffort | null;
  model: string;
  usageLabel?: string;
}) {
  if (args.anthropicEffort === null || !supportsAnthropicEffort(args.model)) return {};
  return {
    output_config: {
      effort: args.anthropicEffort ?? resolveCareerChatEffort(args.usageLabel),
    },
  };
}

async function createAnthropicMessage(args: {
  anthropicEffort?: AnthropicEffort | null;
  abortSignal?: AbortSignal;
  messages: AnthropicMessage[];
  model: string;
  systemBlocks: CareerChatSystemBlock[];
  temperature: number;
  toolCostAttribution?: LlmToolCostAttribution;
  tools?: TalentChatTool[];
  usageLabel?: string;
}) {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for Anthropic Messages API");
  }

  const tools = args.tools ?? [];
  const requestBody = {
    model: args.model,
    max_tokens: CAREER_LLM_CONFIG.chat.maxTokens,
    system: buildAnthropicSystemBlocks(args.systemBlocks),
    messages: args.messages,
    ...buildAnthropicOutputConfig({
      anthropicEffort: args.anthropicEffort,
      model: args.model,
      usageLabel: args.usageLabel,
    }),
    ...(supportsSamplingParametersForModel(args.model)
      ? { temperature: args.temperature }
      : {}),
    ...(tools.length > 0
      ? {
          tool_choice: { type: "auto" as const },
          tools: buildAnthropicTools(tools),
        }
      : {}),
  };
  logCareerChatLlmRequestBody({
    requestBody,
    stream: false,
    usageLabel: args.usageLabel,
  });

  const client = new Anthropic({
    apiKey,
    authToken: null,
    baseURL: "https://api.anthropic.com",
    fetch: tracedLlmFetch,
    // The existing agent runtime owns retries and durable continuation.
    maxRetries: 0,
  });
  const json = await client.messages.create(
    requestBody as Anthropic.MessageCreateParamsNonStreaming,
    { signal: args.abortSignal },
  ) as AnthropicMessageResponse;
  logLlmTokenUsage({
    label: args.usageLabel,
    meta: {
      offeredToolNames: tools.map(getTalentChatToolName),
      systemChars: args.systemBlocks.reduce((n, b) => n + b.text.length, 0),
    },
    model: args.model,
    response: json,
  });
  const toolUseNames = getAnthropicToolUseNames(json.content);
  if (toolUseNames.length > 0) {
    logLlmTokenUsageForToolCalls({
      baseLabel: args.usageLabel,
      model: args.model,
      response: json,
      step: "tool_call",
      toolNames: toolUseNames,
    });
  } else if (args.toolCostAttribution) {
    logLlmTokenUsageForToolCalls({
      baseLabel: args.usageLabel,
      model: args.model,
      response: json,
      step: args.toolCostAttribution.step,
      toolNames: args.toolCostAttribution.toolNames,
    });
  }

  console.info("[career-chat:anthropic-request]", {
    label: args.usageLabel,
    messageCount: args.messages.length,
    model: args.model,
    stopReason: json.stop_reason ?? null,
    systemBlockCount: args.systemBlocks.length,
    systemCacheableKeys: args.systemBlocks
      .filter((block) => block.cacheable)
      .map((block) => block.key ?? "system"),
    toolCount: tools.length,
    toolsCached: tools.length > 0,
  });

  return json;
}

async function createAnthropicMessageText(args: {
  anthropicEffort?: AnthropicEffort | null;
  abortSignal?: AbortSignal;
  messages: AnthropicMessage[];
  model: string;
  systemBlocks: CareerChatSystemBlock[];
  temperature: number;
  toolCostAttribution?: LlmToolCostAttribution;
  tools?: TalentChatTool[];
  usageLabel?: string;
}) {
  const response = await createAnthropicMessage(args);
  return cleanModelText(extractAnthropicText(response.content));
}

async function createAnthropicMessageStreamResponse(args: {
  anthropicEffort?: AnthropicEffort | null;
  abortSignal?: AbortSignal;
  messages: AnthropicMessage[];
  model: string;
  onTextDelta: (delta: string) => void | Promise<void>;
  onToolUseStart?: (tool: AnthropicToolUseStart) => void | Promise<void>;
  systemBlocks: CareerChatSystemBlock[];
  temperature: number;
  toolCostAttribution?: LlmToolCostAttribution;
  tools?: TalentChatTool[];
  usageLabel?: string;
}): Promise<AnthropicMessageResponse> {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for Anthropic Messages API");
  }
  const tools = args.tools?.length ? buildAnthropicTools(args.tools) : [];
  const requestBody = {
    model: args.model,
    max_tokens: CAREER_LLM_CONFIG.chat.maxTokens,
    system: buildAnthropicSystemBlocks(args.systemBlocks),
    messages: args.messages,
    stream: true,
    ...buildAnthropicOutputConfig({
      anthropicEffort: args.anthropicEffort,
      model: args.model,
      usageLabel: args.usageLabel,
    }),
    ...(supportsSamplingParametersForModel(args.model)
      ? { temperature: args.temperature }
      : {}),
    ...(tools.length > 0
      ? {
          tool_choice: { type: "auto" as const },
          tools,
        }
      : {}),
  };
  logCareerChatLlmRequestBody({
    requestBody,
    stream: true,
    usageLabel: args.usageLabel,
  });

  const response = await tracedLlmFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(requestBody),
    cache: "no-store",
    signal: args.abortSignal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Anthropic Messages API stream failed (${response.status}): ${errorText}`
    );
  }
  if (!response.body) {
    throw new Error("Anthropic Messages API stream returned an empty body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let messageId: string | undefined;
  let messageModel: string | undefined;
  let stopReason: string | null = null;
  let usage: Record<string, unknown> = {};
  const contentBlocks: AnthropicAssistantContentBlock[] = [];
  const toolStates = new Map<number, AnthropicStreamToolState>();

  const getEventIndex = (parsed: AnthropicStreamEvent) =>
    typeof parsed.index === "number" && Number.isFinite(parsed.index)
      ? parsed.index
      : contentBlocks.length;

  const appendTextToBlock = async (index: number, text: string) => {
    if (!text) return;
    const existing = contentBlocks[index];
    if (existing?.type === "text") {
      contentBlocks[index] = {
        ...existing,
        text: `${existing.text}${text}`,
      };
    } else {
      contentBlocks[index] = {
        type: "text",
        text,
      };
    }
    await args.onTextDelta(text);
  };

  const handleRawEvent = async (rawEvent: string) => {
    const lines = rawEvent.split("\n");
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n")
      .trim();

    if (!data || data === "[DONE]") return;

    let parsed: AnthropicStreamEvent;
    try {
      parsed = JSON.parse(data) as AnthropicStreamEvent;
    } catch {
      return;
    }

    if (parsed.type === "error") {
      throw new Error(
        parsed.error?.message ??
          parsed.error?.type ??
          "Anthropic Messages API stream error"
      );
    }

    if (parsed.type === "message_start") {
      messageId = parsed.message?.id ?? messageId;
      messageModel = parsed.message?.model ?? messageModel;
      stopReason = parsed.message?.stop_reason ?? stopReason;
      if (parsed.message?.usage) {
        usage = { ...usage, ...parsed.message.usage };
      }
      return;
    }

    if (parsed.type === "message_delta") {
      stopReason = parsed.delta?.stop_reason ?? stopReason;
      if (parsed.usage) {
        usage = { ...usage, ...parsed.usage };
      }
      return;
    }

    if (parsed.type === "content_block_start") {
      const index = getEventIndex(parsed);
      const block = parsed.content_block;
      if (block?.type === "thinking") {
        contentBlocks[index] = {
          ...block,
          type: "thinking",
          thinking: block.thinking ?? "",
          signature: block.signature ?? "",
        };
        return;
      }
      if (block?.type === "redacted_thinking") {
        contentBlocks[index] = {
          ...block,
          type: "redacted_thinking",
          data: block.data ?? "",
        };
        return;
      }
      if (block?.type === "text") {
        const text = typeof block.text === "string" ? block.text : "";
        contentBlocks[index] = {
          type: "text",
          text,
        };
        if (text) {
          await args.onTextDelta(text);
        }
        return;
      }

      if (block?.type === "tool_use") {
        const id = String(block.id ?? crypto.randomUUID());
        const name = String(block.name ?? "").trim();
        contentBlocks[index] = {
          type: "tool_use",
          id,
          name,
          input: {},
        };
        toolStates.set(index, {
          id,
          inputJson:
            block.input && Object.keys(block.input).length > 0
              ? JSON.stringify(block.input)
              : "",
          name,
        });
        await args.onToolUseStart?.({ id, name });
      }
      return;
    }

    if (parsed.type === "content_block_delta") {
      const index = getEventIndex(parsed);
      const block = contentBlocks[index];
      if (block?.type === "thinking") {
        if (parsed.delta?.type === "thinking_delta") {
          block.thinking += parsed.delta.thinking ?? "";
          return;
        }
        if (parsed.delta?.type === "signature_delta") {
          block.signature += parsed.delta.signature ?? "";
          return;
        }
      }
    }

    if (
      parsed.type === "content_block_delta" &&
      parsed.delta?.type === "text_delta" &&
      typeof parsed.delta.text === "string" &&
      parsed.delta.text
    ) {
      await appendTextToBlock(getEventIndex(parsed), parsed.delta.text);
      return;
    }

    if (
      parsed.type === "content_block_delta" &&
      parsed.delta?.type === "input_json_delta"
    ) {
      const index = getEventIndex(parsed);
      const existing = toolStates.get(index);
      const partial = parsed.delta.partial_json ?? "";
      if (existing) {
        toolStates.set(index, {
          ...existing,
          inputJson: `${existing.inputJson}${partial}`,
        });
      }
      return;
    }

    if (parsed.type === "content_block_stop") {
      const index = getEventIndex(parsed);
      const state = toolStates.get(index);
      if (state) {
        contentBlocks[index] = {
          type: "tool_use",
          id: state.id,
          name: state.name,
          input: parseAnthropicToolInput(state.inputJson),
        };
        toolStates.delete(index);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex >= 0) {
      const rawEvent = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      await handleRawEvent(rawEvent);
      boundaryIndex = buffer.indexOf("\n\n");
    }
  }

  const tail = buffer.trim();
  if (tail) {
    await handleRawEvent(tail);
  }

  logLlmTokenUsage({
    label: args.usageLabel,
    meta: {
      offeredToolNames: (args.tools ?? []).map(getTalentChatToolName),
      systemChars: args.systemBlocks.reduce((n, b) => n + b.text.length, 0),
    },
    model: args.model,
    response: { id: messageId, model: messageModel, usage },
  });
  const responseForUsage = {
    content: contentBlocks.filter(Boolean),
    usage,
  };
  const toolUseNames = getAnthropicToolUseNames(responseForUsage.content);
  if (toolUseNames.length > 0) {
    logLlmTokenUsageForToolCalls({
      baseLabel: args.usageLabel,
      model: args.model,
      response: responseForUsage,
      step: "tool_call",
      toolNames: toolUseNames,
    });
  } else if (args.toolCostAttribution) {
    logLlmTokenUsageForToolCalls({
      baseLabel: args.usageLabel,
      model: args.model,
      response: responseForUsage,
      step: args.toolCostAttribution.step,
      toolNames: args.toolCostAttribution.toolNames,
    });
  }

  console.info("[career-chat:anthropic-stream]", {
    label: args.usageLabel,
    messageCount: args.messages.length,
    model: args.model,
    stopReason,
    systemBlockCount: args.systemBlocks.length,
    systemCacheableKeys: args.systemBlocks
      .filter((block) => block.cacheable)
      .map((block) => block.key ?? "system"),
    toolCount: tools.length,
  });

  return {
    content: contentBlocks.filter(Boolean),
    id: messageId,
    model: messageModel ?? args.model,
    stop_reason: stopReason,
    usage,
  };
}

async function createAnthropicMessageStream(args: {
  anthropicEffort?: AnthropicEffort | null;
  abortSignal?: AbortSignal;
  messages: AnthropicMessage[];
  model: string;
  onTextDelta: (delta: string) => void | Promise<void>;
  systemBlocks: CareerChatSystemBlock[];
  temperature: number;
  toolCostAttribution?: LlmToolCostAttribution;
  tools?: TalentChatTool[];
  usageLabel?: string;
}) {
  const response = await createAnthropicMessageStreamResponse(args);
  return cleanModelText(extractAnthropicText(response.content));
}

async function recoverVisibleTextFromAnthropicMessages(args: {
  abortSignal?: AbortSignal;
  checkCancellation?: () => Promise<void>;
  instruction?: string;
  messages: AnthropicMessage[];
  modelConfig: CareerAssistantModelConfig;
  onTextDelta?: (delta: string) => void | Promise<void>;
  reason: string;
  responseLocale?: string | null;
  skipNativeRetry?: boolean;
  systemBlocks: CareerChatSystemBlock[];
  usageLabel?: string;
}) {
  await args.checkCancellation?.();
  args.abortSignal?.throwIfAborted();
  const instruction =
    args.instruction?.trim() ||
    buildEmptyVisibleTextRecoveryInstruction(args.responseLocale);
  const recoveryMessages = appendUserInstructionToMessages(
    args.messages,
    instruction
  );

  console.warn("[career-chat:visible-text-recovery]", {
    messageCount: recoveryMessages.length,
    reason: args.reason,
    usageLabel: args.usageLabel ?? null,
  });

  if (
    !args.skipNativeRetry &&
    shouldUseAnthropicNativeMessages(args.modelConfig.primaryModel)
  ) {
    try {
      const nativeText = args.onTextDelta
        ? await createAnthropicMessageStream({
      abortSignal: args.abortSignal,
            messages: recoveryMessages,
            anthropicEffort: args.modelConfig.anthropicEffort,
            model: args.modelConfig.primaryModel,
            onTextDelta: args.onTextDelta,
            systemBlocks: args.systemBlocks,
            temperature: CAREER_LLM_CONFIG.chat.temperature,
            usageLabel: args.usageLabel,
          })
        : await createAnthropicMessageText({
      abortSignal: args.abortSignal,
            messages: recoveryMessages,
            anthropicEffort: args.modelConfig.anthropicEffort,
            model: args.modelConfig.primaryModel,
            systemBlocks: args.systemBlocks,
            temperature: CAREER_LLM_CONFIG.chat.temperature,
            usageLabel: args.usageLabel,
          });
      if (nativeText.trim()) return nativeText;
    } catch (error) {
      args.abortSignal?.throwIfAborted();
      throwIfToolControlError(error);
      console.warn("[career-chat:visible-text-recovery-native-failed]", {
        error: error instanceof Error ? error.message : String(error),
        reason: args.reason,
        usageLabel: args.usageLabel ?? null,
      });
    }
  }

  try {
    await args.checkCancellation?.();
    const directText = await runDirectTextCompletion({
      abortSignal: args.abortSignal,
      fallbackModel: args.modelConfig.anthropicOverloadFallbackModel,
      messages: buildDirectRecoveryMessages({
        messages: recoveryMessages,
        responseLocale: args.responseLocale,
        systemBlocks: args.systemBlocks,
      }),
      model: args.modelConfig.fallbackModel,
      reasoningEffort:
        args.modelConfig.openAIResponsesReasoningEffort ?? "xhigh",
      temperature: CAREER_LLM_CONFIG.chat.temperature,
      usageLabel: args.usageLabel
        ? `${args.usageLabel}:visible-text-recovery`
        : "career/chat:assistant:visible-text-recovery",
    });
    if (directText.trim() && args.onTextDelta) {
      await args.onTextDelta(directText);
    }
    return directText;
  } catch (error) {
    args.abortSignal?.throwIfAborted();
    throwIfToolControlError(error);
    console.error("[career-chat:visible-text-recovery-failed]", {
      error: error instanceof Error ? error.message : String(error),
      reason: args.reason,
      usageLabel: args.usageLabel ?? null,
    });
    return "";
  }
}

async function runDirectTextCompletion(args: {
  abortSignal?: AbortSignal;
  fallbackModel?: string | null;
  jsonMode?: boolean;
  maxTokens?: number;
  messages: DirectOpenAIMessage[];
  model: string;
  reasoningEffort?: OpenAIResponsesReasoningEffort;
  temperature: number;
  toolCostAttribution?: LlmToolCostAttribution;
  usageLabel?: string;
}) {
  args.abortSignal?.throwIfAborted();
  const { model, response } = await createChatCompletionWithFallback({
    signal: args.abortSignal,
    anthropicOverloadFallbackModel:
      CAREER_LLM_CONFIG.assistant.anthropicOverloadFallbackModel,
    fallbackModel: args.fallbackModel,
    model: args.model,
    debugLabel: args.usageLabel,
    ...(args.reasoningEffort
      ? {
          openAIResponses: {
            reasoningEffort: args.reasoningEffort,
          },
        }
      : {}),
    buildRequest: (model) => {
      const responseFormat =
        args.jsonMode && supportsResponseFormatForModel(model)
          ? ({ type: "json_object" } as const)
          : undefined;
      return {
        messages: args.messages,
        temperature: args.temperature,
        ...(args.maxTokens ? { max_tokens: args.maxTokens } : {}),
        ...(responseFormat && { response_format: responseFormat }),
      };
    },
  });
  logLlmTokenUsage({
    label: args.usageLabel,
    model,
    response,
  });
  if (args.toolCostAttribution) {
    logLlmTokenUsageForToolCalls({
      baseLabel: args.usageLabel,
      model,
      response,
      step: args.toolCostAttribution.step,
      toolNames: args.toolCostAttribution.toolNames,
    });
  }

  return cleanModelText(response.choices[0]?.message?.content ?? "");
}

type CareerAssistantModelConfig = {
  anthropicEffort?: AnthropicEffort | null;
  anthropicOverloadFallbackModel: string;
  chatCompletionReasoningEffort?: ChatCompletionReasoningEffort;
  fallbackModel: string;
  openAIResponsesReasoningEffort?: OpenAIResponsesReasoningEffort;
  primaryModel: string;
};

function assistantModelConfig(): CareerAssistantModelConfig {
  return {
    anthropicOverloadFallbackModel:
      CAREER_LLM_CONFIG.assistant.anthropicOverloadFallbackModel,
    fallbackModel: CAREER_LLM_CONFIG.assistant.fallbackModel,
    openAIResponsesReasoningEffort:
      CAREER_LLM_CONFIG.assistant.openAIResponsesReasoningEffort,
    primaryModel: CAREER_LLM_CONFIG.assistant.primaryModel,
  };
}

function resolveNativeAnthropicFallbackModelConfig(
  error: unknown,
  modelConfig: CareerAssistantModelConfig
) {
  const fallback = resolveChatCompletionFallbackModelForError({
    anthropicOverloadFallbackModel: modelConfig.anthropicOverloadFallbackModel,
    error,
    fallbackModel: null,
    model: modelConfig.primaryModel,
  });

  return {
    fallback,
    modelConfig: fallback
      ? { ...modelConfig, primaryModel: fallback.model }
      : modelConfig,
  };
}

export function runCareerChatAssistant(
  args: Parameters<typeof runCareerChatAssistantImpl>[0]
) {
  args = { ...args, abortSignal: args.abortSignal ?? args.toolRuntime?.abortSignal };
  return args.toolRuntime
    ? args.toolRuntime.runWithUsageContext(() =>
        runCareerChatAssistantImpl(args)
      )
    : runCareerChatAssistantImpl(args);
}

async function runCareerChatAssistantImpl(args: {
  anthropicEffort?: AnthropicEffort | null;
  toolRuntime?: CareerCapabilityRuntime;
  abortSignal?: AbortSignal;
  chatCompletionReasoningEffort?: ChatCompletionReasoningEffort;
  executeTool: (args: {
    input: Record<string, unknown>;
    name: string;
  }) => Promise<unknown>;
  messages: Array<{
    content: string;
    role: "user" | "assistant";
  }>;
  stopAfterToolNames?: string[];
  systemBlocks: CareerChatSystemBlock[];
  tools: TalentChatTool[];
  isOnboardingActive?: boolean;
  onAssistantMessage?: (text: string) => void | Promise<void>;
  onToolStart?: (tool: {
    input: Record<string, unknown>;
    name: string;
  }) => void | Promise<void>;
  modelConfig?: CareerAssistantModelConfig;
  openAIResponsesReasoningEffort?: OpenAIResponsesReasoningEffort;
  primaryModel?: string;
  responseLocale?: string | null;
  temperature?: number;
  usageLabel?: string;
  hasDeliveredArtifact?: () => boolean;
}) {
  const modelConfig = {
    ...(args.modelConfig ?? assistantModelConfig()),
    ...(args.primaryModel ? { primaryModel: args.primaryModel } : {}),
    ...(args.anthropicEffort !== undefined ? { anthropicEffort: args.anthropicEffort } : {}),
    ...(args.toolRuntime?.resumedModel
      ? { primaryModel: args.toolRuntime.resumedModel }
      : {}),
    ...(args.chatCompletionReasoningEffort
      ? {
          chatCompletionReasoningEffort: args.chatCompletionReasoningEffort,
        }
      : {}),
    ...(args.openAIResponsesReasoningEffort
      ? {
          openAIResponsesReasoningEffort: args.openAIResponsesReasoningEffort,
        }
      : {}),
  };
  const usageLabel = args.usageLabel ?? "career/chat:assistant";
  const temperature = args.temperature ?? CAREER_LLM_CONFIG.chat.temperature;
  const openAIResponsesReasoningEffort =
    args.openAIResponsesReasoningEffort ??
    modelConfig.openAIResponsesReasoningEffort ??
    "xhigh";
  const outputLanguage = getCareerPromptLanguageName(args.responseLocale);
  const fallbackWithExistingClient = (
    activeModelConfig: CareerAssistantModelConfig = modelConfig,
    currentMessages: TalentChatMessage[] = args.messages
  ) => {
    const systemPrompt = flattenCareerSystemBlocks(args.systemBlocks);
    const fallbackMessages: TalentChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...currentMessages,
    ];

    if (args.tools.length > 0 || args.toolRuntime) {
      return runTalentAssistantToolLoop({
        formatToolFailure: formatCareerToolFailure,
        getSystemPrompt: () => flattenCareerSystemBlocks(args.systemBlocks),
        toolRuntime: args.toolRuntime,
        abortSignal: args.abortSignal ?? args.toolRuntime?.abortSignal,
        ...(args.tools.some((tool) =>
          ["upsert_document", "ready_for_role"].includes(
            getTalentChatToolName(tool)
          )
        )
          ? {
              maxToolLoops: RESUME_TOOL_CALL_LIMIT,
              maxTotalToolCalls: RESUME_TOOL_CALL_LIMIT,
            }
          : {}),
        executeTool: args.executeTool,
        messages: fallbackMessages,
        modelConfig: activeModelConfig,
        onToolStart: args.onToolStart,
        onAssistantMessage: args.onAssistantMessage,
        openAIResponsesReasoningEffort,
        stopAfterToolNames: args.stopAfterToolNames,
        temperature,
        tools: args.tools,
        usageLabel,
      });
    }

    return runTalentAssistantCompletion({
      ...activeModelConfig,
      messages: fallbackMessages,
      openAIResponsesReasoningEffort,
      temperature,
      usageLabel,
    });
  };

  if (!shouldUseAnthropicNativeMessages(modelConfig.primaryModel, args.toolRuntime?.resumedTransport)) {
    return fallbackWithExistingClient();
  }

  const workingMessages: AnthropicMessage[] =
    (args.toolRuntime?.resumedMessages("anthropic") as
      | AnthropicMessage[]
      | undefined) ??
    initialAnthropicMessages(args.messages, args.toolRuntime);
  let startedExecution = false;
  let recoverySystemBlocks = args.systemBlocks;
  try {
    const maxToolCalls =
      args.toolRuntime?.maxToolCalls ??
      (args.tools.some((tool) =>
        ["upsert_document", "ready_for_role"].includes(
          getTalentChatToolName(tool)
        )
      )
        ? RESUME_TOOL_CALL_LIMIT
        : args.tools.some(
              (tool) =>
                getTalentChatToolName(tool) === "manage_simulation_session"
            )
          ? 8
          : 4);
    let totalToolCalls = 0;
    let pendingToolResultAttribution: string[] = [];
    let executedToolNamesForPolicy: string[] = [];

    if (args.tools.length === 0 && !args.toolRuntime) {
      args.abortSignal?.throwIfAborted();
      const text = await createAnthropicMessageText({
      abortSignal: args.abortSignal,
        messages: workingMessages,
        anthropicEffort: modelConfig.anthropicEffort,
        model: modelConfig.primaryModel,
        systemBlocks: args.systemBlocks,
        temperature,
        usageLabel,
      });
      return text;
    }

    const maxToolLoops =
      args.toolRuntime?.maxToolLoops ??
      (args.tools.some((tool) =>
        ["upsert_document", "ready_for_role"].includes(
          getTalentChatToolName(tool)
        )
      )
        ? RESUME_TOOL_CALL_LIMIT
        : args.tools.some(
              (tool) =>
                getTalentChatToolName(tool) === "manage_simulation_session"
            )
          ? 8
          : 3);
    for (let loop = 0; loop < maxToolLoops; loop += 1) {
      const stopAfterToolNameSet = new Set(args.stopAfterToolNames ?? []);
      const capabilityStep = args.toolRuntime?.resolveStep();
      const stepTools = capabilityStep?.tools ?? args.tools;
      const stepSystemBlocks =
        capabilityStep?.systemBlocks ?? args.systemBlocks;
      const activeToolNames = stepTools.map(getTalentChatToolName);
      const systemBlocksForStep =
        executedToolNamesForPolicy.length > 0
          ? withScopedContinuationToolPolicy({
              callableToolNames: activeToolNames,
              executedToolNames: executedToolNamesForPolicy,
              isOnboardingActive: args.isOnboardingActive,
              responseLocale: args.responseLocale,
              systemBlocks: stepSystemBlocks,
            })
          : stepSystemBlocks;
      const toolCostAttribution =
        pendingToolResultAttribution.length > 0
          ? {
              step: "tool_result_response",
              toolNames: pendingToolResultAttribution,
            }
          : undefined;
      pendingToolResultAttribution = [];
      recoverySystemBlocks = systemBlocksForStep;
      const complete = (abortSignal?: AbortSignal) =>
        createAnthropicMessage({
          abortSignal,
          messages: workingMessages,
          anthropicEffort: modelConfig.anthropicEffort,
          model: modelConfig.primaryModel,
          systemBlocks: systemBlocksForStep,
          temperature,
          toolCostAttribution,
          tools: stepTools,
          usageLabel,
        });
      const response = capabilityStep
        ? await args.toolRuntime!.runCompletion(
            capabilityStep,
            {
              transport: "anthropic",
              model: modelConfig.primaryModel,
              messages: workingMessages,
              systemBlocks: systemBlocksForStep,
            },
            complete
          )
        : await complete(args.abortSignal);

      const assistantBlocks = Array.isArray(response.content)
        ? response.content
        : [];
      const toolUseBlocks = assistantBlocks.filter(
        (block): block is AnthropicToolUseBlock => block.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) {
        const responseText = cleanModelText(
          extractAnthropicText(assistantBlocks)
        );
        return responseText;
      }

      const stepText = cleanModelText(extractAnthropicText(assistantBlocks));
      if (stepText) await args.onAssistantMessage?.(stepText);

      workingMessages.push({
        role: "assistant",
        content: assistantBlocks,
      });

      const remainingToolCalls = maxToolCalls - totalToolCalls;
      const executableToolCalls =
        remainingToolCalls > 0
          ? toolUseBlocks.slice(0, remainingToolCalls)
          : [];
      const skippedToolCalls = toolUseBlocks.slice(executableToolCalls.length);
      const toolResultBlocks: AnthropicToolResultBlock[] = [];
      const rawToolResults: unknown[] = [];
      const attemptedToolNames: string[] = [];
      let shouldStopAfterTool = false;

      for (const skippedToolCall of skippedToolCalls) {
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: skippedToolCall.id,
          content: formatToolResultText({
            error: "Tool call limit reached. Continue without more tool usage.",
          }),
          is_error: true,
        });
      }

      for (const toolCall of executableToolCalls) {
        if (await args.toolRuntime?.shouldDeferToolCall()) {
          toolResultBlocks.push({ type: "tool_result", tool_use_id: toolCall.id,
            content: args.toolRuntime!.deferredToolMessage() });
          continue;
        }
        totalToolCalls += 1;

        const toolInput =
          toolCall.input && typeof toolCall.input === "object"
            ? toolCall.input
            : {};
        const callError = capabilityStep
          ? args.toolRuntime!.claimCall(toolCall.name, capabilityStep)
          : !activeToolNames.includes(toolCall.name)
            ? "tool_not_offered"
            : null;
        if (callError || args.toolRuntime?.isInternalTool(toolCall.name)) {
          const loadCapture = await runToolCall(
            async () =>
              callError
                ? { ok: false, error: callError }
                : args.toolRuntime!.load(
                    toolInput,
                    capabilityStep!,
                    toolCall.name
                  ),
            { callId: toolCall.id, name: toolCall.name, input: toolInput }
          );
          if (!loadCapture.returned) throwIfToolControlError(loadCapture.error);
          const result = loadCapture.returned
            ? loadCapture.value
            : toolErrorResult(loadCapture.error);
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: prepareToolDelivery(loadCapture, formatToolResultText),
            ...(result.ok ? {} : { is_error: true }),
          });
          continue;
        }
        attemptedToolNames.push(toolCall.name);
        logTalentToolCall({
          callId: toolCall.id,
          input: toolInput,
          loop,
          name: toolCall.name,
          source: "career/chat:assistant:anthropic",
        });
        const toolStartedAt = Date.now();
        let capturedDiagnostics: readonly unknown[] = [];
        try {
          startedExecution = true;
          await observeToolCall(() =>
            args.onToolStart?.({
              name: toolCall.name,
              input: toolInput,
            })
          );
          const toolCapture = await runToolCall(
            async () => {
              const result = await args.executeTool({
                name: toolCall.name,
                input: toolInput,
              });
              if (capabilityStep)
                await observeToolCall(() =>
                  args.toolRuntime!.recordResult(
                    toolCall.name,
                    result,
                    capabilityStep,
                    toolInput, toolCall.id
                  )
                );
              return result;
            },
            { callId: toolCall.id, name: toolCall.name, input: toolInput }
          );
          capturedDiagnostics = toolCapture.diagnostics;
          const result = unwrapToolCall(toolCapture);
          rawToolResults.push(result);

          logTalentToolResult({
            callId: toolCall.id,
            durationMs: Date.now() - toolStartedAt,
            name: toolCall.name,
            result,
            diagnostics: toolCapture.diagnostics,
            source: "career/chat:assistant:anthropic",
          });
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: prepareToolDelivery(toolCapture, renderCareerToolResult),
          });
          if (
            stopAfterToolNameSet.has(toolCall.name) ||
            args.toolRuntime?.shouldFinishAfterTool(toolCall.name, toolInput, result) ||
            (result !== null &&
              typeof result === "object" &&
              "awaitingUserInput" in result &&
              result.awaitingUserInput === true)
          ) {
            shouldStopAfterTool = true;
            break;
          }
        } catch (error) {
          throwIfToolControlError(error);
          args.abortSignal?.throwIfAborted();
    if (isAbortLikeError(error)) throw error;
          logTalentToolError({
            callId: toolCall.id,
            durationMs: Date.now() - toolStartedAt,
            error,
            name: toolCall.name,
            source: "career/chat:assistant:anthropic",
          });
          const failureOutput = formatCareerToolFailure({
            name: toolCall.name,
            callId: toolCall.id,
            input: toolInput,
            error,
            diagnostics: capturedDiagnostics,
          });
          if (capabilityStep)
            await observeToolCall(() =>
              args.toolRuntime!.recordResult(
                toolCall.name,
                { ok: false, status: "failed", modelOutput: failureOutput },
                capabilityStep,
                toolInput, toolCall.id
              )
            );
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: failureOutput,
            is_error: true,
          });
        }
      }

      if (shouldStopAfterTool) {
        const answered = new Set(
          toolResultBlocks.map((result) => result.tool_use_id)
        );
        for (const call of toolUseBlocks)
          if (!answered.has(call.id)) {
            toolResultBlocks.push({
              type: "tool_result",
              tool_use_id: call.id,
              is_error: true,
              content: formatToolResultText({
                ok: false,
                error: "turn_ended_by_terminal_tool",
                executed: false,
              }),
            });
          }
      }

      if (toolResultBlocks.length > 0) {
        workingMessages.push({
          role: "user",
          content: withToolResultFollowupInstruction(
            toolResultBlocks,
            args.responseLocale,
            {
              toolResults: rawToolResults,
              responseContract: (
                args.toolRuntime?.resolveStep().systemBlocks ??
                args.systemBlocks
              ).find((block) => block.key === "application_handoff_contract")
                ?.text,
            }
          ),
        });
      }
      executedToolNamesForPolicy = normalizeUniqueToolNames([
        ...executedToolNamesForPolicy,
        ...attemptedToolNames,
      ]);

      if (shouldStopAfterTool) {
        return "";
      }
      pendingToolResultAttribution = attemptedToolNames;
    }

    const finalMessages = appendUserInstructionToMessages(
      workingMessages,
      `Tool call budget is exhausted. Answer now in ${outputLanguage} without additional tool use.`
    );
    const finalSystemBlocks = withScopedContinuationToolPolicy({
      callableToolNames: [],
      executedToolNames: executedToolNamesForPolicy,
      isOnboardingActive: args.isOnboardingActive,
      responseLocale: args.responseLocale,
      systemBlocks:
        args.toolRuntime?.resolveStep().systemBlocks ?? args.systemBlocks,
    });
    const finalToolCostAttribution =
      pendingToolResultAttribution.length > 0
        ? {
            step: "tool_result_response",
            toolNames: pendingToolResultAttribution,
          }
        : undefined;
    await args.toolRuntime?.options.checkCancellation?.();
    const finalText = await createAnthropicMessageText({
      abortSignal: args.abortSignal,
      messages: finalMessages,
      anthropicEffort: modelConfig.anthropicEffort,
      model: modelConfig.primaryModel,
      systemBlocks: finalSystemBlocks,
      temperature,
      toolCostAttribution: finalToolCostAttribution,
      usageLabel,
    });
    if (finalText) return finalText;
    return recoverVisibleTextFromAnthropicMessages({
      checkCancellation: args.toolRuntime?.options.checkCancellation,
      abortSignal: args.abortSignal,
      messages: finalMessages,
      modelConfig,
      reason: "empty_text_after_tool_budget",
      responseLocale: args.responseLocale,
      systemBlocks: finalSystemBlocks,
      usageLabel,
    });
  } catch (error) {
    throwIfToolControlError(error);
    args.abortSignal?.throwIfAborted();
    if (isAbortLikeError(error)) throw error;
    if (startedExecution) {
      const recovered = await recoverVisibleTextFromAnthropicMessages({
      checkCancellation: args.toolRuntime?.options.checkCancellation,
      abortSignal: args.abortSignal,
        messages: workingMessages,
        modelConfig,
        reason: "error_after_tool_execution",
        responseLocale: args.responseLocale,
        systemBlocks: recoverySystemBlocks,
        usageLabel,
        skipNativeRetry: true,
      });
      if (recovered) return recovered;
      // Do not let an outer empty-response recovery lose already executed effects.
      throw error;
    }
    const nativeFallback = resolveNativeAnthropicFallbackModelConfig(
      error,
      modelConfig
    );
    console.error("[career-chat:anthropic-native-fallback]", {
      error: error instanceof Error ? error.message : String(error),
      fallbackModel: nativeFallback.fallback?.model ?? null,
      fallbackReason: nativeFallback.fallback?.reason ?? null,
      model: modelConfig.primaryModel,
    });
    return fallbackWithExistingClient(nativeFallback.modelConfig,
      workingMessages.map(message => ({ role: message.role, content: stringifyAnthropicContent(message.content) })));
  }
}

export function runCareerChatAssistantStream(
  args: Parameters<typeof runCareerChatAssistantStreamImpl>[0]
) {
  args = { ...args, abortSignal: args.abortSignal ?? args.toolRuntime?.abortSignal };
  return args.toolRuntime
    ? args.toolRuntime.runWithUsageContext(() =>
        runCareerChatAssistantStreamImpl(args)
      )
    : runCareerChatAssistantStreamImpl(args);
}

async function runCareerChatAssistantStreamImpl(args: {
  anthropicEffort?: AnthropicEffort | null;
  toolRuntime?: CareerCapabilityRuntime;
  abortSignal?: AbortSignal;
  chatCompletionReasoningEffort?: ChatCompletionReasoningEffort;
  executeTool: (args: {
    input: Record<string, unknown>;
    name: string;
  }) => Promise<unknown>;
  messages: Array<{
    content: string;
    role: "user" | "assistant";
  }>;
  onAssistantMessage?: (text: string) => void | Promise<void>;
  onStopToolStart?: (tool: AnthropicToolUseStart) => void | Promise<void>;
  onTextDelta: (delta: string) => void | Promise<void>;
  onToolDetected?: (tool: AnthropicToolUseStart) => void | Promise<void>;
  onToolStart?: (tool: AnthropicToolUseStart) => void | Promise<void>;
  stopAfterToolNames?: string[];
  systemBlocks: CareerChatSystemBlock[];
  tools: TalentChatTool[];
  isOnboardingActive?: boolean;
  modelConfig?: CareerAssistantModelConfig;
  openAIResponsesReasoningEffort?: OpenAIResponsesReasoningEffort;
  primaryModel?: string;
  responseLocale?: string | null;
  temperature?: number;
  usageLabel?: string;
  hasDeliveredArtifact?: () => boolean;
}) {
  const modelConfig = {
    ...(args.modelConfig ?? assistantModelConfig()),
    ...(args.primaryModel ? { primaryModel: args.primaryModel } : {}),
    ...(args.anthropicEffort !== undefined ? { anthropicEffort: args.anthropicEffort } : {}),
    ...(args.toolRuntime?.resumedModel
      ? { primaryModel: args.toolRuntime.resumedModel }
      : {}),
    ...(args.chatCompletionReasoningEffort
      ? {
          chatCompletionReasoningEffort: args.chatCompletionReasoningEffort,
        }
      : {}),
    ...(args.openAIResponsesReasoningEffort
      ? {
          openAIResponsesReasoningEffort: args.openAIResponsesReasoningEffort,
        }
      : {}),
  };
  const usageLabel = args.usageLabel ?? "career/chat:assistant";
  const temperature = args.temperature ?? CAREER_LLM_CONFIG.chat.temperature;
  const streamWithExistingClient = (activeModelConfig = modelConfig, currentMessages: TalentChatMessage[] = args.messages) => {
    const systemPrompt = flattenCareerSystemBlocks(args.systemBlocks);
    return runTalentAssistantToolLoop({
      formatToolFailure: formatCareerToolFailure,
      getSystemPrompt: () => flattenCareerSystemBlocks(args.systemBlocks),
      toolRuntime: args.toolRuntime,
      abortSignal: args.abortSignal ?? args.toolRuntime?.abortSignal,
      ...(args.tools.some((tool) =>
        ["upsert_document", "ready_for_role"].includes(
          getTalentChatToolName(tool)
        )
      )
        ? {
            maxToolLoops: RESUME_TOOL_CALL_LIMIT,
            maxTotalToolCalls: RESUME_TOOL_CALL_LIMIT,
          }
        : {}),
      executeTool: args.executeTool,
      messages: [{ role: "system", content: systemPrompt }, ...currentMessages],
      modelConfig: activeModelConfig,
      onAssistantMessage: args.onAssistantMessage,
      onStopToolStart: args.onStopToolStart
        ? ({ id, name }) => args.onStopToolStart?.({ id, name })
        : undefined,
      onTextDelta: args.onTextDelta,
      onToolStart:
        args.onToolDetected || args.onToolStart
          ? async ({ id, name }) => {
              await args.onToolDetected?.({ id, name });
              await observeToolCall(() => args.onToolStart?.({ id, name }));
            }
          : undefined,
      openAIResponsesReasoningEffort:
        args.openAIResponsesReasoningEffort ??
        activeModelConfig.openAIResponsesReasoningEffort ??
        "xhigh",
      stopAfterToolNames: args.stopAfterToolNames,
      temperature,
      tools: args.tools,
      usageLabel,
    });
  };
  if (!shouldUseAnthropicNativeMessages(modelConfig.primaryModel, args.toolRuntime?.resumedTransport)) {
    return streamWithExistingClient();
  }

  const workingMessages: AnthropicMessage[] =
    (args.toolRuntime?.resumedMessages("anthropic") as
      | AnthropicMessage[]
      | undefined) ??
    initialAnthropicMessages(args.messages, args.toolRuntime);

  let streamedAnyText = false;
  let startedAnyTool = false;
  let executedAnyTool = false;
  let forwardedVisibleText = "";
  const forwardTextDelta = async (delta: string) => {
    if (!delta) return;
    streamedAnyText = true;
    forwardedVisibleText += delta;
    await args.onTextDelta(delta);
  };
  const getForwardedVisibleText = () => cleanModelText(forwardedVisibleText);
  let activeSystemBlocksForRecovery = args.systemBlocks;

  try {
    if (args.tools.length === 0 && !args.toolRuntime) {
      args.abortSignal?.throwIfAborted();
      const text = await createAnthropicMessageStream({
      abortSignal: args.abortSignal,
        messages: workingMessages,
        anthropicEffort: modelConfig.anthropicEffort,
        model: modelConfig.primaryModel,
        onTextDelta: forwardTextDelta,
        systemBlocks: args.systemBlocks,
        temperature,
        usageLabel,
      });
      return text;
    }

    const maxToolCalls =
      args.toolRuntime?.maxToolCalls ??
      (args.tools.some((tool) =>
        ["upsert_document", "ready_for_role"].includes(
          getTalentChatToolName(tool)
        )
      )
        ? RESUME_TOOL_CALL_LIMIT
        : args.tools.some(
              (tool) =>
                getTalentChatToolName(tool) === "manage_simulation_session"
            )
          ? 8
          : MAX_STREAMING_TOOL_CALLS_PER_TURN);
    let totalToolCalls = 0;
    let pendingToolResultAttribution: string[] = [];
    let activeTools = args.tools;
    let executedToolNamesForPolicy: string[] = [];
    let toolLoopIndex = 0;

    while (activeTools.length > 0) {
      const stopAfterToolNameSet = new Set(args.stopAfterToolNames ?? []);
      const loop = toolLoopIndex;
      toolLoopIndex += 1;
      const capabilityStep = args.toolRuntime?.resolveStep();
      if (capabilityStep) activeTools = capabilityStep.tools;
      const stepSystemBlocks =
        capabilityStep?.systemBlocks ?? args.systemBlocks;
      const activeToolNames = activeTools.map(getTalentChatToolName);
      const systemBlocksForStep =
        executedToolNamesForPolicy.length > 0
          ? withScopedContinuationToolPolicy({
              callableToolNames: activeToolNames,
              executedToolNames: executedToolNamesForPolicy,
              isOnboardingActive: args.isOnboardingActive,
              responseLocale: args.responseLocale,
              systemBlocks: stepSystemBlocks,
            })
          : stepSystemBlocks;
      activeSystemBlocksForRecovery = systemBlocksForStep;
      const toolCostAttribution =
        pendingToolResultAttribution.length > 0
          ? {
              step: "tool_result_response",
              toolNames: pendingToolResultAttribution,
            }
          : undefined;
      pendingToolResultAttribution = [];
      const complete = (abortSignal?: AbortSignal) =>
        createAnthropicMessageStreamResponse({
          abortSignal,
          messages: workingMessages,
          anthropicEffort: modelConfig.anthropicEffort,
          model: modelConfig.primaryModel,
          onToolUseStart: async (tool) => {
            startedAnyTool = true;
            forwardedVisibleText = "";
            if (
              !args.toolRuntime?.isInternalTool(tool.name) &&
              activeToolNames.includes(tool.name)
            )
              await args.onToolDetected?.(tool);
          },
          onTextDelta: forwardTextDelta,
          systemBlocks: systemBlocksForStep,
          temperature,
          toolCostAttribution,
          tools: activeTools,
          usageLabel,
        });
      const response = capabilityStep
        ? await args.toolRuntime!.runCompletion(
            capabilityStep,
            {
              transport: "anthropic",
              model: modelConfig.primaryModel,
              messages: workingMessages,
              systemBlocks: systemBlocksForStep,
            },
            complete
          )
        : await complete(args.abortSignal);

      const assistantBlocks = Array.isArray(response.content)
        ? response.content
        : [];
      const toolUseBlocks = assistantBlocks.filter(
        (block): block is AnthropicToolUseBlock => block.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) {
        const responseText = cleanModelText(
          extractAnthropicText(assistantBlocks)
        );
        if (!responseText) return getForwardedVisibleText();
        const forwardedText = getForwardedVisibleText();
        if (forwardedText) return forwardedText;
        await forwardTextDelta(responseText);
        return responseText;
      }

      const stepText = cleanModelText(extractAnthropicText(assistantBlocks));
      if (stepText) await args.onAssistantMessage?.(stepText);
      forwardedVisibleText = "";

      workingMessages.push({
        role: "assistant",
        content: assistantBlocks,
      });

      const remainingToolCalls = maxToolCalls - totalToolCalls;
      const executableToolCalls =
        remainingToolCalls > 0
          ? toolUseBlocks.slice(0, remainingToolCalls)
          : [];
      const skippedToolCalls = toolUseBlocks.slice(executableToolCalls.length);
      const toolResultBlocks: AnthropicToolResultBlock[] = [];
      const rawToolResults: unknown[] = [];
      const attemptedToolNames: string[] = [];
      let shouldStopAfterTool = false;

      for (const skippedToolCall of skippedToolCalls) {
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: skippedToolCall.id,
          content: formatToolResultText({
            error:
              "Additional tool calls are unavailable for this turn. Continue using the completed results.",
          }),
          is_error: true,
        });
      }

      for (const toolCall of executableToolCalls) {
        if (await args.toolRuntime?.shouldDeferToolCall()) {
          toolResultBlocks.push({ type: "tool_result", tool_use_id: toolCall.id,
            content: args.toolRuntime!.deferredToolMessage() });
          continue;
        }
        totalToolCalls += 1;

        const toolInput =
          toolCall.input && typeof toolCall.input === "object"
            ? toolCall.input
            : {};
        const callError = capabilityStep
          ? args.toolRuntime!.claimCall(toolCall.name, capabilityStep)
          : !activeToolNames.includes(toolCall.name)
            ? "tool_not_offered"
            : null;
        if (callError || args.toolRuntime?.isInternalTool(toolCall.name)) {
          const loadCapture = await runToolCall(
            async () =>
              callError
                ? { ok: false, error: callError }
                : args.toolRuntime!.load(
                    toolInput,
                    capabilityStep!,
                    toolCall.name
                  ),
            { callId: toolCall.id, name: toolCall.name, input: toolInput }
          );
          if (!loadCapture.returned) throwIfToolControlError(loadCapture.error);
          const result = loadCapture.returned
            ? loadCapture.value
            : toolErrorResult(loadCapture.error);
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: prepareToolDelivery(loadCapture, formatToolResultText),
            ...(result.ok ? {} : { is_error: true }),
          });
          continue;
        }
        attemptedToolNames.push(toolCall.name);
        try {
          await observeToolCall(() =>
            args.onToolStart?.({
              id: toolCall.id,
              name: toolCall.name,
            })
          );
          if (stopAfterToolNameSet.has(toolCall.name)) {
            await observeToolCall(() =>
              args.onStopToolStart?.({
                id: toolCall.id,
                name: toolCall.name,
              })
            );
          }
        } catch (error) {
          console.warn("[career-chat:stream-tool-start-callback-failed]", {
            error: error instanceof Error ? error.message : String(error),
            name: toolCall.name,
          });
        }
        logTalentToolCall({
          callId: toolCall.id,
          input: toolInput,
          loop,
          name: toolCall.name,
          source: "career/chat:assistant:anthropic-stream",
        });
        const toolStartedAt = Date.now();
        let capturedDiagnostics: readonly unknown[] = [];
        executedAnyTool = true;
        try {
          const toolCapture = await runToolCall(
            async () => {
              const result = await args.executeTool({
                name: toolCall.name,
                input: toolInput,
              });
              if (capabilityStep)
                await observeToolCall(() =>
                  args.toolRuntime!.recordResult(
                    toolCall.name,
                    result,
                    capabilityStep,
                    toolInput, toolCall.id
                  )
                );
              return result;
            },
            { callId: toolCall.id, name: toolCall.name, input: toolInput }
          );
          capturedDiagnostics = toolCapture.diagnostics;
          const result = unwrapToolCall(toolCapture);
          rawToolResults.push(result);

          logTalentToolResult({
            callId: toolCall.id,
            durationMs: Date.now() - toolStartedAt,
            name: toolCall.name,
            result,
            diagnostics: toolCapture.diagnostics,
            source: "career/chat:assistant:anthropic-stream",
          });
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: serializeCareerToolResultForModel(result),
          });
          if (
            stopAfterToolNameSet.has(toolCall.name) ||
            args.toolRuntime?.shouldFinishAfterTool(toolCall.name, toolInput, result) ||
            (result !== null &&
              typeof result === "object" &&
              "awaitingUserInput" in result &&
              result.awaitingUserInput === true)
          ) {
            shouldStopAfterTool = true;
            break;
          }
        } catch (error) {
          throwIfToolControlError(error);
          args.abortSignal?.throwIfAborted();
    if (isAbortLikeError(error)) throw error;
          logTalentToolError({
            callId: toolCall.id,
            durationMs: Date.now() - toolStartedAt,
            error,
            name: toolCall.name,
            source: "career/chat:assistant:anthropic-stream",
          });
          const failureOutput = formatCareerToolFailure({
            name: toolCall.name,
            callId: toolCall.id,
            input: toolInput,
            error,
            diagnostics: capturedDiagnostics,
          });
          if (capabilityStep)
            await observeToolCall(() =>
              args.toolRuntime!.recordResult(
                toolCall.name,
                { ok: false, status: "failed", modelOutput: failureOutput },
                capabilityStep,
                toolInput, toolCall.id
              )
            );
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: failureOutput,
            is_error: true,
          });
        }
      }

      const continuationTools =
        !shouldStopAfterTool && totalToolCalls < maxToolCalls
          ? (args.toolRuntime?.resolveStep(false).tools ?? args.tools)
          : [];
      const continuationToolNames = continuationTools.map(
        getTalentChatToolName
      );
      executedToolNamesForPolicy = normalizeUniqueToolNames([
        ...executedToolNamesForPolicy,
        ...attemptedToolNames,
      ]);

      if (shouldStopAfterTool) {
        const answered = new Set(
          toolResultBlocks.map((result) => result.tool_use_id)
        );
        for (const call of toolUseBlocks)
          if (!answered.has(call.id)) {
            toolResultBlocks.push({
              type: "tool_result",
              tool_use_id: call.id,
              is_error: true,
              content: formatToolResultText({
                ok: false,
                error: "turn_ended_by_terminal_tool",
                executed: false,
              }),
            });
          }
      }

      if (toolResultBlocks.length > 0) {
        workingMessages.push({
          role: "user",
          content: withToolResultFollowupInstruction(
            toolResultBlocks,
            args.responseLocale,
            {
              toolResults: rawToolResults,
              responseContract: (
                args.toolRuntime?.resolveStep().systemBlocks ??
                args.systemBlocks
              ).find((block) => block.key === "application_handoff_contract")
                ?.text,
              callableToolNames: continuationToolNames,
              forceFinalAnswer: continuationToolNames.length === 0,
            }
          ),
        });
      }

      if (shouldStopAfterTool) {
        return "";
      }

      pendingToolResultAttribution = attemptedToolNames;
      if (continuationTools.length > 0) {
        activeTools = continuationTools;
        continue;
      }

      break;
    }

    const finalSystemBlocks = withScopedContinuationToolPolicy({
      callableToolNames: [],
      executedToolNames: executedToolNamesForPolicy,
      isOnboardingActive: args.isOnboardingActive,
      responseLocale: args.responseLocale,
      systemBlocks:
        args.toolRuntime?.resolveStep().systemBlocks ?? args.systemBlocks,
    });
    activeSystemBlocksForRecovery = finalSystemBlocks;
    const finalToolCostAttribution =
      pendingToolResultAttribution.length > 0
        ? {
            step: "tool_result_response",
            toolNames: pendingToolResultAttribution,
          }
        : undefined;
    await args.toolRuntime?.options.checkCancellation?.();
    const finalText = await createAnthropicMessageStream({
      abortSignal: args.abortSignal,
      messages: workingMessages,
      anthropicEffort: modelConfig.anthropicEffort,
      model: modelConfig.primaryModel,
      onTextDelta: forwardTextDelta,
      systemBlocks: finalSystemBlocks,
      temperature,
      toolCostAttribution: finalToolCostAttribution,
      usageLabel,
    });
    if (finalText) return getForwardedVisibleText() || finalText;
    const recoveredText = await recoverVisibleTextFromAnthropicMessages({
      checkCancellation: args.toolRuntime?.options.checkCancellation,
      abortSignal: args.abortSignal,
      messages: workingMessages,
      modelConfig,
      onTextDelta: forwardTextDelta,
      reason: executedAnyTool
        ? "stream_empty_text_after_tool_loop"
        : "stream_empty_final_response",
      responseLocale: args.responseLocale,
      systemBlocks: finalSystemBlocks,
      usageLabel,
    });
    return getForwardedVisibleText() || recoveredText;
  } catch (error) {
    throwIfToolControlError(error);
    args.abortSignal?.throwIfAborted();
    if (isAbortLikeError(error)) throw error;
    if (streamedAnyText || startedAnyTool || executedAnyTool) {
      const recoveredText = await recoverVisibleTextFromAnthropicMessages({
      checkCancellation: args.toolRuntime?.options.checkCancellation,
      abortSignal: args.abortSignal,
        messages: workingMessages,
        modelConfig,
        onTextDelta: forwardTextDelta,
        reason: "stream_error_after_partial_or_tool",
        responseLocale: args.responseLocale,
        skipNativeRetry: true,
        systemBlocks: activeSystemBlocksForRecovery,
        usageLabel,
      });
      if (recoveredText) return getForwardedVisibleText() || recoveredText;
    }

    if (streamedAnyText || startedAnyTool || executedAnyTool) {
      throw error;
    }

    const nativeFallback = resolveNativeAnthropicFallbackModelConfig(
      error,
      modelConfig
    );
    console.error("[career-chat:anthropic-stream-fallback]", {
      error: error instanceof Error ? error.message : String(error),
      fallbackModel: nativeFallback.fallback?.model ?? null,
      fallbackReason: nativeFallback.fallback?.reason ?? null,
      model: modelConfig.primaryModel,
    });
    return streamWithExistingClient(nativeFallback.modelConfig,
      workingMessages.map(message => ({ role: message.role, content: stringifyAnthropicContent(message.content) })));
  }
}

export async function runCareerInsightExtraction(args: {
  conversationMessages: Array<{
    content: string;
    role: "user" | "assistant";
  }>;
  fallbackModel?: string | null;
  model?: string;
  systemPrompt: string;
  usageLabel?: string;
}) {
  return runDirectTextCompletion({
    fallbackModel:
      args.fallbackModel ?? CAREER_LLM_CONFIG.insightExtraction.fallbackModel,
    jsonMode: true,
    messages: [
      { role: "system", content: args.systemPrompt },
      ...args.conversationMessages,
    ],
    model: args.model ?? CAREER_LLM_CONFIG.insightExtraction.model,
    reasoningEffort: CAREER_LLM_CONFIG.insightExtraction.reasoningEffort,
    temperature: CAREER_LLM_CONFIG.insightExtraction.temperature,
    usageLabel: args.usageLabel ?? "career/chat:insight_extraction",
  });
}

export async function runCareerConversationSummary(args: {
  systemPrompt: string;
  userPrompt: string;
}) {
  return runDirectTextCompletion({
    jsonMode: true,
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userPrompt },
    ],
    model: CAREER_LLM_CONFIG.conversationSummary.model,
    reasoningEffort: CAREER_LLM_CONFIG.conversationSummary.reasoningEffort,
    temperature: CAREER_LLM_CONFIG.conversationSummary.temperature,
    usageLabel: "career/chat:conversation_summary",
  });
}

export async function runCareerCallNoteAnalysis(args: {
  systemPrompt: string;
  userPrompt: string;
}) {
  return runTalentAssistantCompletion({
    fallbackModel: CAREER_LLM_CONFIG.callNoteAnalysis.fallbackModel,
    jsonSchema: {
      name: "career_call_note_analysis",
      schema: {
        additionalProperties: false,
        properties: {
          key_points: {
            items: { type: "string" },
            maxItems: 3,
            minItems: 0,
            type: "array",
          },
          should_create: { type: "boolean" },
          title: { type: "string" },
        },
        required: ["should_create", "title", "key_points"],
        type: "object",
      },
      strict: true,
    },
    maxTokens: CAREER_LLM_CONFIG.callNoteAnalysis.maxTokens,
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userPrompt },
    ],
    openAIResponsesReasoningEffort:
      CAREER_LLM_CONFIG.callNoteAnalysis.reasoningEffort,
    primaryModel: CAREER_LLM_CONFIG.callNoteAnalysis.model,
    temperature: CAREER_LLM_CONFIG.callNoteAnalysis.temperature,
    usageLabel: "career/call-note:analysis",
  });
}

export async function runCareerKickoff(args: {
  textChatModel?: CareerTextChatModelId;
  messages: TalentChatMessage[];
}) {
  return runTalentAssistantCompletion({
    ...assistantModelConfig(),
    ...careerTextAssistantModelOptions(args.textChatModel),
    messages: args.messages,
    temperature: CAREER_LLM_CONFIG.kickoff.temperature,
  });
}

export async function runCareerOnboardingDeferClose(args: {
  textChatModel?: CareerTextChatModelId;
  messages: TalentChatMessage[];
}) {
  return runTalentAssistantCompletion({
    ...assistantModelConfig(),
    ...careerTextAssistantModelOptions(args.textChatModel),
    messages: args.messages,
    temperature: CAREER_LLM_CONFIG.onboardingDeferClose.temperature,
  });
}

export async function runCareerProfileIngestion(args: {
  abortSignal?: AbortSignal;
  messages: TalentChatMessage[];
  usageLabel?: string;
}) {
  return runTalentAssistantCompletion({
    ...assistantModelConfig(),
    maxTokens: CAREER_LLM_CONFIG.profileIngestion.maxTokens,
    messages: args.messages,
    abortSignal: args.abortSignal,
    jsonMode: true,
    temperature: CAREER_LLM_CONFIG.profileIngestion.temperature,
    usageLabel: args.usageLabel,
  });
}

export async function runCareerRefreshInsights(args: {
  messages: TalentChatMessage[];
}) {
  return runTalentAssistantCompletion({
    ...assistantModelConfig(),
    jsonMode: true,
    messages: args.messages,
    temperature: CAREER_LLM_CONFIG.refreshInsights.temperature,
  });
}

export async function runOpsRoleDescriptionSummary(args: {
  messages: TalentChatMessage[];
}) {
  return runTalentAssistantCompletion({
    ...assistantModelConfig(),
    messages: args.messages,
    temperature: CAREER_LLM_CONFIG.opsRoleSummary.temperature,
  });
}

export function getCareerRealtimeSessionConfig() {
  return {
    ...CAREER_LLM_CONFIG.realtime,
    outputModalities: ["audio"] as const,
    provider: "openai" as const,
  };
}

export function getCareerLiveSessionConfig() {
  return CAREER_LLM_CONFIG.live;
}
