import {
  createChatCompletionWithFallback,
  getLlmChatProviderForModel,
  resolveChatCompletionFallbackModelForError,
  supportsSamplingParametersForModel,
  supportsResponseFormatForModel,
} from "@/lib/llm/llm";
import type { OpenAIResponsesReasoningEffort } from "@/lib/llm/responsesChatAdapter";
import {
  logLlmTokenUsage,
  logLlmTokenUsageForToolCalls,
} from "@/lib/llm/usageLogging";
import {
  CLAUDE_MODEL,
  GPT_56_LUNA_MODEL,
  GPT_56_TERRA_MODEL,
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
import { resolveCareerRealtimeProvider } from "@/lib/career/realtimeProvider";
import { getCareerStreamingNextToolNames } from "@/lib/career/streamingToolChainPolicy";

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
    anthropicOverloadFallbackModel: GPT_56_TERRA_MODEL,
    openAIResponsesReasoningEffort: "xhigh" as const,
    primaryModel: CLAUDE_MODEL,
    fallbackModel: GPT_56_TERRA_MODEL,
  },
  // 일반 텍스트 커리어 채팅 설정. Realtime 전화/음성 응답에는 적용되지 않는다.
  // prompt에는 structured profile, 최근 activity, 최근 추천 기회 10개 compact summary,
  // 현재 opportunity run 상태와 tool policy가 함께 들어간다.
  // 사용처: /api/talent/chat, src/lib/career/chatTurn.ts,
  // onboarding completion wrapup에서 유저 메시지에 답하거나 tool loop를 돌릴 때.
  chat: {
    maxTokens: 4096,
    opportunityFeedbackFollowUp: {
      model: GPT_56_LUNA_MODEL,
      reasoningEffort: "high" as const,
    },
    recommendationFinalizer: {
      model: GPT_56_LUNA_MODEL,
      reasoningEffort: "high" as const,
    },
    temperature: 0.55,
  },
  // 대화 저장/응답 이후 assistant 답변에서 structured insight JSON을 뽑을 때.
  // 사용처: /api/talent/chat, /api/talent/chat/save.
  insightExtraction: {
    fallbackModel: CLAUDE_MODEL,
    model: GPT_56_LUNA_MODEL,
    reasoningEffort: "high" as const,
    temperature: 0.2,
  },
  // 긴 talent chat history를 rolling summary로 압축할 때.
  // 사용처: maybeSummarizeTalentConversation.
  conversationSummary: {
    model: GPT_56_LUNA_MODEL,
    reasoningEffort: "high" as const,
    temperature: 0.2,
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
    anthropicOverloadFallbackModel: "grok-4.3",
    fallbackModel: "grok-4-fast-reasoning",
    finalSelectionModel: GPT_56_LUNA_MODEL,
    finalSelectionReasoningEffort: "high" as const,
    finalSelectionTemperature: 0.2,
    planModel: CLAUDE_MODEL,
    planTemperature: 0.2,
    shortlistModel: GPT_56_LUNA_MODEL,
    shortlistReasoningEffort: "high" as const,
    shortlistTemperature: 0.1,
    fullJdPlanModel: GPT_56_LUNA_MODEL,
    fullJdPlanReasoningEffort: "high" as const,
    fullJdPlanTemperature: 0.2,
    fullJdScoringModel: GPT_56_LUNA_MODEL,
    fullJdScoringReasoningEffort: "high" as const,
  },
  // LinkedIn/이력서/입력 링크에서 가져온 profile raw data를 정규화/보강할 때.
  // 모델은 assistant.primary/fallback을 쓴다.
  // 사용처: src/lib/talentOnboarding/profileIngestion.ts.
  profileIngestion: {
    temperature: 0.1,
  },
  // Realtime 세션 생성 설정.
  // 사용처: /api/realtime/token.
  realtime: {
    providers: {
      openai: {
        model: "gpt-realtime-2.1",
        speechSpeed: 1.1,
        transcriptionModel: "gpt-4o-transcribe",
        voice: "cedar",
      },
      xai: {
        model: "grok-voice-think-fast-2.0",
        reasoningEffort: "high",
        speechSpeed: 1.3,
        transcriptionModel: "grok-transcribe",
        voice: "Cosmo",
      },
    },
  },
  // 회사 스냅샷이 캐시에 없을 때 OpenAI Responses API + web_search로 조사한다.
  // createChatCompletionWithFallback 경로가 아니며, web_search tool을 쓰기 때문에
  // 모델만 여기에서 공유한다.
  // 사용처: src/lib/career/companySnapshot.ts 의 runCompanySnapshotResearch.
  companySnapshotResearch: {
    fallbackModel: "gpt-4o",
    primaryModel: "gpt-4.1",
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

type AnthropicAssistantContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock;
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
  usage?: Record<string, unknown>;
};

type AnthropicStreamEvent = {
  content_block?: {
    id?: string;
    input?: Record<string, unknown>;
    name?: string;
    text?: string;
    type?: string;
  };
  delta?: {
    partial_json?: string;
    stop_reason?: string | null;
    stop_sequence?: string | null;
    text?: string;
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

type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";

const STREAMING_TOOL_CHAIN_MAX_CALLS = 3;

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
  const futureMatchingInsightsIndex = normalizedBlocks.findIndex(
    (block) => block.key === "future_matching_insights"
  );

  if (futureMatchingInsightsIndex >= 0) {
    for (let index = futureMatchingInsightsIndex - 1; index >= 0; index -= 1) {
      if (normalizedBlocks[index]?.cacheable) {
        cacheIndexes.add(index);
        break;
      }
    }

    if (normalizedBlocks[futureMatchingInsightsIndex]?.cacheable) {
      cacheIndexes.add(futureMatchingInsightsIndex);
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

  return normalizedTools.map((tool, index) => ({
    ...tool,
    ...(index === lastIndex
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
  });
  if (!rawPolicy.trim()) return "";

  const rawPolicyLines = rawPolicy.split("\n");
  const policyBody =
    rawPolicyLines[0] === "## Tool Use Policy" &&
    rawPolicyLines[1]?.startsWith("Available tools:")
      ? rawPolicyLines.slice(2)
      : rawPolicyLines[0] === "## Tool Use Policy"
        ? rawPolicyLines.slice(1)
        : rawPolicyLines;

  return [
    "## Tool Use Policy",
    `Callable tools in this continuation: ${
      callableToolNames.length > 0 ? callableToolNames.join(", ") : "none"
    }.`,
    `Previously executed tools covered by this policy: ${
      executedToolNames.length > 0 ? executedToolNames.join(", ") : "none"
    }.`,
    "Only the policies for callable tools and previously executed tools are in scope. Do not call any tool that is not present in the current API tool schema.",
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
  const toolPolicy = buildScopedContinuationToolPolicy({
    callableToolNames: args.callableToolNames,
    executedToolNames: args.executedToolNames,
    isOnboardingActive: args.isOnboardingActive,
    responseLocale: args.responseLocale,
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
    return replacementBlock
      ? args.systemBlocks.map((block, index) =>
          index === toolPolicyIndex ? replacementBlock : block
        )
      : args.systemBlocks.filter((_, index) => index !== toolPolicyIndex);
  }

  if (!replacementBlock) return args.systemBlocks;

  const profileContextIndex = args.systemBlocks.findIndex(
    (block) => block.key === "profile_context"
  );
  if (profileContextIndex < 0) return [...args.systemBlocks, replacementBlock];

  return [
    ...args.systemBlocks.slice(0, profileContextIndex + 1),
    replacementBlock,
    ...args.systemBlocks.slice(profileContextIndex + 1),
  ];
}

function resolveNextStreamingTools(args: {
  allTools: readonly TalentChatTool[];
  attemptedToolNames: readonly string[];
}) {
  const nextToolNameSet = new Set<string>(
    getCareerStreamingNextToolNames(args.attemptedToolNames)
  );
  if (nextToolNameSet.size === 0) return [];

  return args.allTools.filter((tool) =>
    nextToolNameSet.has(getTalentChatToolName(tool))
  );
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

function serializeToolResult(result: unknown) {
  if (typeof result === "string") return result;

  try {
    return JSON.stringify(result);
  } catch {
    return JSON.stringify({
      ok: false,
      error: "Failed to serialize tool result",
    });
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseSerializedToolResult(content: string) {
  try {
    const parsed = JSON.parse(content);
    return isPlainRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildAssistantInstructionsFromToolResults(
  blocks: AnthropicToolResultBlock[]
) {
  const instructions: string[] = [];

  for (const block of blocks) {
    const result = parseSerializedToolResult(block.content);
    if (!result) continue;

    const assistantInstruction = result.assistantInstruction;
    if (typeof assistantInstruction === "string") {
      const normalized = assistantInstruction.trim();
      if (normalized) instructions.push(normalized);
    }
  }

  if (instructions.length === 0) return "";

  return [
    "Additional tool-result instruction for the final user-facing reply:",
    ...Array.from(new Set(instructions)).map(
      (instruction) => `- ${instruction}`
    ),
  ].join("\n");
}

function buildToolResultFollowupInstruction(responseLocale?: string | null) {
  const outputLanguage = getCareerPromptLanguageName(responseLocale);

  return [
    `Use the tool result(s) above to answer the user's latest message in ${outputLanguage}.`,
    "Do not return empty text, expose raw JSON, or mention internal tool names.",
    "If the assistant already wrote a brief pre-tool preamble in the same turn, do not repeat that preamble; continue with the result or the next useful sentence.",
    "When a tool changed saved profile or preference state, answer as Harper in a normal product conversation: acknowledge the substantive change, explain the practical consequence when it matters, and continue naturally from the user's intent.",
    "If the result is inconclusive, say what could and could not be verified, then continue naturally from the user's question.",
  ].join(" ");
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
    "Call one of them only if the previous tool result makes it necessary. Otherwise, answer the user now.",
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
    "Do not call tools or mention internal errors.",
    "If the evidence is inconclusive, say so briefly instead of inventing details.",
  ].join(" ");
}

function withToolResultFollowupInstruction(
  blocks: AnthropicToolResultBlock[],
  responseLocale?: string | null,
  options?: {
    callableToolNames?: readonly string[];
    forceFinalAnswer?: boolean;
  }
): AnthropicUserContentBlock[] {
  if (blocks.length === 0) return blocks;
  const assistantInstructions =
    buildAssistantInstructionsFromToolResults(blocks);
  const streamingContinuationInstruction =
    buildStreamingToolContinuationInstruction({
      callableToolNames: options?.callableToolNames,
      forceFinalAnswer: options?.forceFinalAnswer,
    });
  return [
    ...blocks,
    {
      type: "text",
      text: [
        buildToolResultFollowupInstruction(responseLocale),
        assistantInstructions,
        streamingContinuationInstruction,
      ]
        .filter((text) => text.trim().length > 0)
        .join("\n\n"),
    },
  ];
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
        return `[Assistant requested ${block.name}: ${serializeToolResult(
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

function shouldUseAnthropicNativeMessages(model: string) {
  return (
    getLlmChatProviderForModel(model) === "anthropic" &&
    Boolean((process.env.ANTHROPIC_API_KEY ?? "").trim())
  );
}

function supportsAnthropicEffort(model: string) {
  const normalized = model.trim().toLowerCase();
  return (
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
  model: string;
  usageLabel?: string;
}) {
  if (!supportsAnthropicEffort(args.model)) return {};
  return {
    output_config: {
      effort: resolveCareerChatEffort(args.usageLabel),
    },
  };
}

async function createAnthropicMessage(args: {
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

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(requestBody),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Anthropic Messages API request failed (${response.status}): ${errorText}`
    );
  }

  const json = (await response.json()) as AnthropicMessageResponse;
  logLlmTokenUsage({
    label: args.usageLabel,
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

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(requestBody),
    cache: "no-store",
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
    model: args.model,
    response: { usage },
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
            messages: recoveryMessages,
            model: args.modelConfig.primaryModel,
            onTextDelta: args.onTextDelta,
            systemBlocks: args.systemBlocks,
            temperature: CAREER_LLM_CONFIG.chat.temperature,
            usageLabel: args.usageLabel,
          })
        : await createAnthropicMessageText({
            messages: recoveryMessages,
            model: args.modelConfig.primaryModel,
            systemBlocks: args.systemBlocks,
            temperature: CAREER_LLM_CONFIG.chat.temperature,
            usageLabel: args.usageLabel,
          });
      if (nativeText.trim()) return nativeText;
    } catch (error) {
      console.warn("[career-chat:visible-text-recovery-native-failed]", {
        error: error instanceof Error ? error.message : String(error),
        reason: args.reason,
        usageLabel: args.usageLabel ?? null,
      });
    }
  }

  try {
    const directText = await runDirectTextCompletion({
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
    console.error("[career-chat:visible-text-recovery-failed]", {
      error: error instanceof Error ? error.message : String(error),
      reason: args.reason,
      usageLabel: args.usageLabel ?? null,
    });
    return "";
  }
}

async function runDirectTextCompletion(args: {
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
  const { model, response } = await createChatCompletionWithFallback({
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

function shouldUseRecommendationFinalizer(toolNames: readonly string[]) {
  return toolNames.includes("recommend_job_postings");
}

async function createRecommendationToolResultFinalText(args: {
  fallbackModel: string;
  messages: AnthropicMessage[];
  systemBlocks: CareerChatSystemBlock[];
  toolCostAttribution?: LlmToolCostAttribution;
  usageLabel: string;
}) {
  return runDirectTextCompletion({
    fallbackModel: args.fallbackModel,
    maxTokens: CAREER_LLM_CONFIG.chat.maxTokens,
    messages: [
      {
        role: "system",
        content: flattenCareerSystemBlocks(args.systemBlocks),
      },
      ...args.messages
        .map(
          (message): DirectOpenAIMessage => ({
            role: message.role,
            content: stringifyAnthropicContent(message.content),
          })
        )
        .filter((message) => message.content.trim().length > 0),
    ],
    model: CAREER_LLM_CONFIG.chat.recommendationFinalizer.model,
    reasoningEffort:
      CAREER_LLM_CONFIG.chat.recommendationFinalizer.reasoningEffort,
    temperature: CAREER_LLM_CONFIG.chat.temperature,
    toolCostAttribution: args.toolCostAttribution,
    usageLabel: `${args.usageLabel}:recommendation-finalizer`,
  });
}

type CareerAssistantModelConfig = {
  anthropicOverloadFallbackModel: string;
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

export async function runCareerChatAssistant(args: {
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
}) {
  const modelConfig = {
    ...(args.modelConfig ?? assistantModelConfig()),
    ...(args.primaryModel ? { primaryModel: args.primaryModel } : {}),
  };
  const usageLabel = args.usageLabel ?? "career/chat:assistant";
  const temperature = args.temperature ?? CAREER_LLM_CONFIG.chat.temperature;
  const openAIResponsesReasoningEffort =
    args.openAIResponsesReasoningEffort ??
    modelConfig.openAIResponsesReasoningEffort ??
    "xhigh";
  const outputLanguage = getCareerPromptLanguageName(args.responseLocale);
  const fallbackWithExistingClient = (
    activeModelConfig: CareerAssistantModelConfig = modelConfig
  ) => {
    const systemPrompt = flattenCareerSystemBlocks(args.systemBlocks);
    const fallbackMessages: TalentChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...args.messages,
    ];

    if (args.tools.length > 0) {
      return runTalentAssistantToolLoop({
        executeTool: args.executeTool,
        messages: fallbackMessages,
        modelConfig: activeModelConfig,
        onToolStart: args.onToolStart,
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

  if (!shouldUseAnthropicNativeMessages(modelConfig.primaryModel)) {
    return fallbackWithExistingClient();
  }

  try {
    const workingMessages: AnthropicMessage[] = args.messages
      .filter((message) => message.content.trim().length > 0)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
    const stopAfterToolNameSet = new Set(args.stopAfterToolNames ?? []);
    let totalToolCalls = 0;
    let pendingToolResultAttribution: string[] = [];
    let executedToolNamesForPolicy: string[] = [];

    if (args.tools.length === 0) {
      const text = await createAnthropicMessageText({
        messages: workingMessages,
        model: modelConfig.primaryModel,
        systemBlocks: args.systemBlocks,
        temperature,
        usageLabel,
      });
      if (text) return text;
      return recoverVisibleTextFromAnthropicMessages({
        messages: workingMessages,
        modelConfig,
        reason: "empty_text_without_tools",
        responseLocale: args.responseLocale,
        systemBlocks: args.systemBlocks,
        usageLabel,
      });
    }

    for (let loop = 0; loop < 3; loop += 1) {
      const activeToolNames = args.tools.map(getTalentChatToolName);
      const systemBlocksForStep =
        executedToolNamesForPolicy.length > 0
          ? withScopedContinuationToolPolicy({
              callableToolNames: activeToolNames,
              executedToolNames: executedToolNamesForPolicy,
              isOnboardingActive: args.isOnboardingActive,
              responseLocale: args.responseLocale,
              systemBlocks: args.systemBlocks,
            })
          : args.systemBlocks;
      const toolCostAttribution =
        pendingToolResultAttribution.length > 0
          ? {
              step: "tool_result_response",
              toolNames: pendingToolResultAttribution,
            }
          : undefined;
      pendingToolResultAttribution = [];
      const response = await createAnthropicMessage({
        messages: workingMessages,
        model: modelConfig.primaryModel,
        systemBlocks: systemBlocksForStep,
        temperature,
        toolCostAttribution,
        tools: args.tools,
        usageLabel,
      });

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
        if (responseText) return responseText;
        return recoverVisibleTextFromAnthropicMessages({
          messages: workingMessages,
          modelConfig,
          reason: "empty_text_without_tool_use",
          responseLocale: args.responseLocale,
          systemBlocks: systemBlocksForStep,
          usageLabel,
        });
      }

      workingMessages.push({
        role: "assistant",
        content: assistantBlocks,
      });

      const remainingToolCalls = 4 - totalToolCalls;
      const executableToolCalls =
        remainingToolCalls > 0
          ? toolUseBlocks.slice(0, remainingToolCalls)
          : [];
      const skippedToolCalls = toolUseBlocks.slice(executableToolCalls.length);
      const toolResultBlocks: AnthropicToolResultBlock[] = [];
      const attemptedToolNames: string[] = [];
      let shouldStopAfterTool = false;

      for (const skippedToolCall of skippedToolCalls) {
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: skippedToolCall.id,
          content: JSON.stringify({
            error: "Tool call limit reached. Continue without more tool usage.",
          }),
          is_error: true,
        });
      }

      for (const toolCall of executableToolCalls) {
        totalToolCalls += 1;
        attemptedToolNames.push(toolCall.name);

        const toolInput =
          toolCall.input && typeof toolCall.input === "object"
            ? toolCall.input
            : {};
        logTalentToolCall({
          callId: toolCall.id,
          input: toolInput,
          loop,
          name: toolCall.name,
          source: "career/chat:assistant:anthropic",
        });
        const toolStartedAt = Date.now();
        try {
          await args.onToolStart?.({
            name: toolCall.name,
            input: toolInput,
          });
          const result = await args.executeTool({
            name: toolCall.name,
            input: toolInput,
          });
          logTalentToolResult({
            callId: toolCall.id,
            durationMs: Date.now() - toolStartedAt,
            name: toolCall.name,
            result,
            source: "career/chat:assistant:anthropic",
          });
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: serializeToolResult(result),
          });
          if (stopAfterToolNameSet.has(toolCall.name)) {
            shouldStopAfterTool = true;
            break;
          }
        } catch (error) {
          if (isAbortLikeError(error)) throw error;
          logTalentToolError({
            callId: toolCall.id,
            durationMs: Date.now() - toolStartedAt,
            error,
            name: toolCall.name,
            source: "career/chat:assistant:anthropic",
          });
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content:
              error instanceof Error ? error.message : "Tool execution failed",
            is_error: true,
          });
        }
      }

      if (toolResultBlocks.length > 0) {
        workingMessages.push({
          role: "user",
          content: withToolResultFollowupInstruction(
            toolResultBlocks,
            args.responseLocale
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
      systemBlocks: args.systemBlocks,
    });
    const finalToolCostAttribution =
      pendingToolResultAttribution.length > 0
        ? {
            step: "tool_result_response",
            toolNames: pendingToolResultAttribution,
          }
        : undefined;
    const finalText = shouldUseRecommendationFinalizer(
      pendingToolResultAttribution
    )
      ? await createRecommendationToolResultFinalText({
          fallbackModel: modelConfig.fallbackModel,
          messages: finalMessages,
          systemBlocks: finalSystemBlocks,
          toolCostAttribution: finalToolCostAttribution,
          usageLabel,
        })
      : await createAnthropicMessageText({
          messages: finalMessages,
          model: modelConfig.primaryModel,
          systemBlocks: finalSystemBlocks,
          temperature,
          toolCostAttribution: finalToolCostAttribution,
          usageLabel,
        });
    if (finalText) return finalText;
    return recoverVisibleTextFromAnthropicMessages({
      messages: finalMessages,
      modelConfig,
      reason: "empty_text_after_tool_budget",
      responseLocale: args.responseLocale,
      systemBlocks: finalSystemBlocks,
      usageLabel,
    });
  } catch (error) {
    if (isAbortLikeError(error)) throw error;
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
    return fallbackWithExistingClient(nativeFallback.modelConfig);
  }
}

export async function recoverCareerChatAssistantText(args: {
  latestUserMessage?: string | null;
  messages: Array<{
    content: string;
    role: "user" | "assistant";
  }>;
  onTextDelta?: (delta: string) => void | Promise<void>;
  responseLocale?: string | null;
  systemBlocks: CareerChatSystemBlock[];
  usageLabel?: string;
}) {
  const workingMessages: AnthropicMessage[] = args.messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
  const latestUserMessage = String(args.latestUserMessage ?? "").trim();
  const instruction = [
    buildEmptyVisibleTextRecoveryInstruction(args.responseLocale),
    latestUserMessage ? `Latest user message: ${latestUserMessage}` : "",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");

  return recoverVisibleTextFromAnthropicMessages({
    instruction,
    messages: workingMessages,
    modelConfig: assistantModelConfig(),
    onTextDelta: args.onTextDelta,
    reason: "route_empty_assistant_text",
    responseLocale: args.responseLocale,
    systemBlocks: args.systemBlocks,
    usageLabel: args.usageLabel ?? "career/chat:assistant",
  });
}

export async function runCareerChatAssistantStream(args: {
  executeTool: (args: {
    input: Record<string, unknown>;
    name: string;
  }) => Promise<unknown>;
  messages: Array<{
    content: string;
    role: "user" | "assistant";
  }>;
  onStopToolStart?: (tool: AnthropicToolUseStart) => void | Promise<void>;
  onTextDelta: (delta: string) => void | Promise<void>;
  onToolStart?: (tool: AnthropicToolUseStart) => void | Promise<void>;
  stopAfterToolNames?: string[];
  systemBlocks: CareerChatSystemBlock[];
  tools: TalentChatTool[];
  isOnboardingActive?: boolean;
  modelConfig?: CareerAssistantModelConfig;
  responseLocale?: string | null;
  usageLabel?: string;
}) {
  const modelConfig = args.modelConfig ?? assistantModelConfig();
  const usageLabel = args.usageLabel ?? "career/chat:assistant";
  if (!shouldUseAnthropicNativeMessages(modelConfig.primaryModel)) {
    const text = await runCareerChatAssistant({
      executeTool: args.executeTool,
      messages: args.messages,
      modelConfig,
      onToolStart: args.onToolStart
        ? ({ name }) => args.onToolStart?.({ id: "", name })
        : undefined,
      stopAfterToolNames: args.stopAfterToolNames,
      systemBlocks: args.systemBlocks,
      tools: args.tools,
      isOnboardingActive: args.isOnboardingActive,
      responseLocale: args.responseLocale,
      usageLabel,
    });
    if (text) {
      await args.onTextDelta(text);
    }
    return text;
  }

  const workingMessages: AnthropicMessage[] = args.messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));

  let streamedAnyText = false;
  let startedAnyTool = false;
  let executedAnyTool = false;
  let forwardedVisibleText = "";
  const stopAfterToolNameSet = new Set(args.stopAfterToolNames ?? []);
  const forwardTextDelta = async (delta: string) => {
    if (!delta) return;
    streamedAnyText = true;
    forwardedVisibleText += delta;
    await args.onTextDelta(delta);
  };
  const getForwardedVisibleText = () => cleanModelText(forwardedVisibleText);
  let activeSystemBlocksForRecovery = args.systemBlocks;

  try {
    if (args.tools.length === 0) {
      const text = await createAnthropicMessageStream({
        messages: workingMessages,
        model: modelConfig.primaryModel,
        onTextDelta: forwardTextDelta,
        systemBlocks: args.systemBlocks,
        temperature: CAREER_LLM_CONFIG.chat.temperature,
        usageLabel,
      });
      if (text) return text;
      return recoverVisibleTextFromAnthropicMessages({
        messages: workingMessages,
        modelConfig,
        onTextDelta: forwardTextDelta,
        reason: "stream_empty_text_without_tools",
        responseLocale: args.responseLocale,
        systemBlocks: args.systemBlocks,
        usageLabel,
      });
    }

    let totalToolCalls = 0;
    let pendingToolResultAttribution: string[] = [];
    let activeTools = args.tools;
    let executedToolNamesForPolicy: string[] = [];
    let toolLoopIndex = 0;

    while (activeTools.length > 0) {
      const loop = toolLoopIndex;
      toolLoopIndex += 1;
      const activeToolNames = activeTools.map(getTalentChatToolName);
      const systemBlocksForStep =
        executedToolNamesForPolicy.length > 0
          ? withScopedContinuationToolPolicy({
              callableToolNames: activeToolNames,
              executedToolNames: executedToolNamesForPolicy,
              isOnboardingActive: args.isOnboardingActive,
              responseLocale: args.responseLocale,
              systemBlocks: args.systemBlocks,
            })
          : args.systemBlocks;
      activeSystemBlocksForRecovery = systemBlocksForStep;
      const toolCostAttribution =
        pendingToolResultAttribution.length > 0
          ? {
              step: "tool_result_response",
              toolNames: pendingToolResultAttribution,
            }
          : undefined;
      pendingToolResultAttribution = [];
      const response = await createAnthropicMessageStreamResponse({
        messages: workingMessages,
        model: modelConfig.primaryModel,
        onToolUseStart: async () => {
          startedAnyTool = true;
        },
        onTextDelta: forwardTextDelta,
        systemBlocks: systemBlocksForStep,
        temperature: CAREER_LLM_CONFIG.chat.temperature,
        toolCostAttribution,
        tools: activeTools,
        usageLabel,
      });

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
        if (!responseText) {
          const recoveredText = await recoverVisibleTextFromAnthropicMessages({
            messages: workingMessages,
            modelConfig,
            onTextDelta: forwardTextDelta,
            reason: "stream_empty_text_without_tool_use",
            responseLocale: args.responseLocale,
            systemBlocks: systemBlocksForStep,
            usageLabel,
          });
          return getForwardedVisibleText() || recoveredText;
        }
        const forwardedText = getForwardedVisibleText();
        if (forwardedText) return forwardedText;
        await forwardTextDelta(responseText);
        return responseText;
      }

      workingMessages.push({
        role: "assistant",
        content: assistantBlocks,
      });

      const remainingToolCalls =
        STREAMING_TOOL_CHAIN_MAX_CALLS - totalToolCalls;
      const executableToolCalls =
        remainingToolCalls > 0
          ? toolUseBlocks.slice(0, remainingToolCalls)
          : [];
      const skippedToolCalls = toolUseBlocks.slice(executableToolCalls.length);
      const toolResultBlocks: AnthropicToolResultBlock[] = [];
      const attemptedToolNames: string[] = [];
      let shouldStopAfterTool = false;

      for (const skippedToolCall of skippedToolCalls) {
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: skippedToolCall.id,
          content: JSON.stringify({
            error:
              "Additional tool calls are unavailable for this turn. Continue using the completed results.",
          }),
          is_error: true,
        });
      }

      for (const toolCall of executableToolCalls) {
        totalToolCalls += 1;
        attemptedToolNames.push(toolCall.name);

        const toolInput =
          toolCall.input && typeof toolCall.input === "object"
            ? toolCall.input
            : {};
        try {
          await args.onToolStart?.({
            id: toolCall.id,
            name: toolCall.name,
          });
          if (stopAfterToolNameSet.has(toolCall.name)) {
            await args.onStopToolStart?.({
              id: toolCall.id,
              name: toolCall.name,
            });
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
        executedAnyTool = true;
        try {
          const result = await args.executeTool({
            name: toolCall.name,
            input: toolInput,
          });
          logTalentToolResult({
            callId: toolCall.id,
            durationMs: Date.now() - toolStartedAt,
            name: toolCall.name,
            result,
            source: "career/chat:assistant:anthropic-stream",
          });
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: serializeToolResult(result),
          });
          if (stopAfterToolNameSet.has(toolCall.name)) {
            shouldStopAfterTool = true;
            break;
          }
        } catch (error) {
          if (isAbortLikeError(error)) throw error;
          logTalentToolError({
            callId: toolCall.id,
            durationMs: Date.now() - toolStartedAt,
            error,
            name: toolCall.name,
            source: "career/chat:assistant:anthropic-stream",
          });
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content:
              error instanceof Error ? error.message : "Tool execution failed",
            is_error: true,
          });
        }
      }

      const canContinueToolChain =
        !shouldStopAfterTool && totalToolCalls < STREAMING_TOOL_CHAIN_MAX_CALLS;
      const nextTools = canContinueToolChain
        ? resolveNextStreamingTools({
            allTools: args.tools,
            attemptedToolNames,
          })
        : [];
      const nextToolNames = nextTools.map(getTalentChatToolName);
      executedToolNamesForPolicy = normalizeUniqueToolNames([
        ...executedToolNamesForPolicy,
        ...attemptedToolNames,
      ]);

      if (toolResultBlocks.length > 0) {
        workingMessages.push({
          role: "user",
          content: withToolResultFollowupInstruction(
            toolResultBlocks,
            args.responseLocale,
            {
              callableToolNames: nextToolNames,
              forceFinalAnswer: nextToolNames.length === 0,
            }
          ),
        });
      }

      if (shouldStopAfterTool) {
        return "";
      }

      pendingToolResultAttribution = attemptedToolNames;
      if (nextTools.length > 0) {
        activeTools = nextTools;
        continue;
      }

      break;
    }

    const finalSystemBlocks = withScopedContinuationToolPolicy({
      callableToolNames: [],
      executedToolNames: executedToolNamesForPolicy,
      isOnboardingActive: args.isOnboardingActive,
      responseLocale: args.responseLocale,
      systemBlocks: args.systemBlocks,
    });
    activeSystemBlocksForRecovery = finalSystemBlocks;
    const finalToolCostAttribution =
      pendingToolResultAttribution.length > 0
        ? {
            step: "tool_result_response",
            toolNames: pendingToolResultAttribution,
          }
        : undefined;
    const useRecommendationFinalizer = shouldUseRecommendationFinalizer(
      pendingToolResultAttribution
    );
    const finalText = useRecommendationFinalizer
      ? await createRecommendationToolResultFinalText({
          fallbackModel: modelConfig.fallbackModel,
          messages: workingMessages,
          systemBlocks: finalSystemBlocks,
          toolCostAttribution: finalToolCostAttribution,
          usageLabel,
        })
      : await createAnthropicMessageStream({
          messages: workingMessages,
          model: modelConfig.primaryModel,
          onTextDelta: forwardTextDelta,
          systemBlocks: finalSystemBlocks,
          temperature: CAREER_LLM_CONFIG.chat.temperature,
          toolCostAttribution: finalToolCostAttribution,
          usageLabel,
        });
    if (useRecommendationFinalizer && finalText) {
      await forwardTextDelta(finalText);
    }
    if (finalText) return getForwardedVisibleText() || finalText;
    const recoveredText = await recoverVisibleTextFromAnthropicMessages({
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
    if (isAbortLikeError(error)) throw error;
    if (streamedAnyText || startedAnyTool || executedAnyTool) {
      const recoveredText = await recoverVisibleTextFromAnthropicMessages({
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
    const text = await runCareerChatAssistant({
      executeTool: args.executeTool,
      messages: args.messages,
      modelConfig: nativeFallback.modelConfig,
      stopAfterToolNames: args.stopAfterToolNames,
      systemBlocks: args.systemBlocks,
      tools: args.tools,
      isOnboardingActive: args.isOnboardingActive,
      responseLocale: args.responseLocale,
      usageLabel,
    });
    if (text) {
      await args.onTextDelta(text);
    }
    return text;
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

export async function runCareerKickoff(args: {
  messages: TalentChatMessage[];
}) {
  return runTalentAssistantCompletion({
    ...assistantModelConfig(),
    messages: args.messages,
    temperature: CAREER_LLM_CONFIG.kickoff.temperature,
  });
}

export async function runCareerOnboardingDeferClose(args: {
  messages: TalentChatMessage[];
}) {
  return runTalentAssistantCompletion({
    ...assistantModelConfig(),
    messages: args.messages,
    temperature: CAREER_LLM_CONFIG.onboardingDeferClose.temperature,
  });
}

export async function runCareerProfileIngestion(args: {
  messages: TalentChatMessage[];
  usageLabel?: string;
}) {
  return runTalentAssistantCompletion({
    ...assistantModelConfig(),
    messages: args.messages,
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

export function getCareerRealtimeSessionConfig(args: {
  providerOverride?: string | null;
  userCreatedAt?: string | null;
  userId: string;
}) {
  const provider = resolveCareerRealtimeProvider(args);
  const providerConfig = CAREER_LLM_CONFIG.realtime.providers[provider];

  return {
    ...providerConfig,
    outputModalities: ["audio"] as const,
    provider,
    reasoningEffort:
      provider === "xai"
        ? CAREER_LLM_CONFIG.realtime.providers.xai.reasoningEffort
        : null,
  };
}
