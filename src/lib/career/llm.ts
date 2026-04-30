import {
  getChatClientForModel,
  getLlmChatProviderForModel,
  supportsResponseFormatForModel,
} from "@/lib/llm/llm";
import { logLlmTokenUsage } from "@/lib/llm/usageLogging";
import {
  runTalentAssistantCompletion,
  runTalentAssistantToolLoop,
  type TalentChatMessage,
  type TalentChatTool,
} from "@/lib/talentOnboarding/llm";

export const CAREER_LLM_CONFIG = {
  // 공통 talent assistant 모델 설정. runTalentAssistantCompletion/ToolLoop 기반
  // wrapper들이 이 primary/fallback 쌍을 공유한다.
  // 사용처: 일반 커리어 채팅, kickoff, reengagement, onboarding defer,
  // profile ingestion, refresh insights, ops 요약/추천.
  assistant: {
    primaryModel: "claude-sonnet-4-6",
    fallbackModel: "gpt-4.1-mini",
  },
  // 일반 텍스트 커리어 채팅 온도. Realtime 전화/음성 응답에는 적용되지 않는다.
  // 사용처: /api/talent/chat 에서 유저 메시지에 답하거나 tool loop를 돌릴 때.
  chat: {
    maxTokens: 1024,
    temperature: 0.55,
  },
  // 통화/음성 대화 종료 후 transcript를 보고 후속 메시지를 생성할 때.
  // 사용처: /api/talent/chat/call-wrapup.
  callWrapup: {
    model: "grok-4-fast-reasoning",
    temperature: 0.5,
  },
  // 대화 저장/응답 이후 assistant 답변에서 structured insight JSON을 뽑을 때.
  // 사용처: /api/talent/chat, /api/talent/chat/save.
  insightExtraction: {
    model: "grok-4-fast-reasoning",
    temperature: 0.2,
  },
  // 온보딩을 지금 끝내지 않고 나중으로 미룰 때 닫는 응답을 생성한다.
  // 모델은 assistant.primary/fallback을 쓰고 여기서는 온도만 조정한다.
  // 사용처: /api/talent/onboarding/defer.
  onboardingDeferClose: {
    temperature: 0.3,
  },
  // 운영자/백오피스에서 특정 role-candidate 매칭 추천 메모를 생성할 때.
  // 모델은 assistant.primary/fallback을 쓴다.
  // 사용처: src/lib/opsOpportunity.ts 의 runOpsTalentRecommendation.
  opsRecommendation: {
    temperature: 0.35,
  },
  // 외부 JD를 짧은 role summary로 압축할 때.
  // 모델은 assistant.primary/fallback을 쓴다.
  // 사용처: external role ingestion/sync 중 description_summary 생성.
  opsRoleSummary: {
    temperature: 0.2,
  },
  // LinkedIn/이력서/입력 링크에서 가져온 profile raw data를 정규화/보강할 때.
  // 모델은 assistant.primary/fallback을 쓴다.
  // 사용처: src/lib/talentOnboarding/profileIngestion.ts.
  profileIngestion: {
    temperature: 0.1,
  },
  // OpenAI Realtime 세션 생성 설정.
  // ElevenLabs TTS를 쓰면 OpenAI audio output은 끄고 text만 받는다.
  // 사용처: /api/realtime/token.
  realtime: {
    model: "gpt-realtime-1.5",
    transcriptionModel: "gpt-4o-mini-transcribe",
    voice: "coral",
  },
  // 오래 대화하지 않은 유저에게 다시 말을 걸 reengagement 메시지를 만들 때.
  // 모델은 assistant.primary/fallback을 쓴다.
  // 사용처: src/lib/talentOnboarding/reengagement.ts.
  reengagement: {
    temperature: 0.45,
  },
  // 히스토리의 internal recommendation 액션 이후 채팅창에 보여줄 짧은 응답.
  // 모델은 assistant.primary/fallback을 쓴다.
  // 사용처: /api/talent/opportunities, /api/talent/opportunities/question.
  historyActionReply: {
    temperature: 0.5,
  },
  // 기존 프로필/대화에서 비어 있는 insight key만 채우는 내부 refresh 작업.
  // 모델은 assistant.primary/fallback을 쓰고 JSON 응답을 기대한다.
  // 사용처: /api/internal/career/refresh-insights.
  refreshInsights: {
    temperature: 0.2,
  },
  // 온보딩/프로필 입력 직후 첫 kickoff 메시지를 만들 때.
  // 모델은 assistant.primary/fallback을 쓴다.
  // 사용처: src/lib/talentOnboarding/kickoff.ts.
  kickoff: {
    temperature: 0.25,
  },
} as const;

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
  delta?: {
    text?: string;
    type?: string;
  };
  error?: {
    message?: string;
    type?: string;
  };
  message?: {
    usage?: Record<string, unknown>;
  };
  type?: string;
  usage?: Record<string, unknown>;
};

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
  const lastCacheableIndex = normalizedBlocks.reduce(
    (index, block, currentIndex) => (block.cacheable ? currentIndex : index),
    -1
  );

  return normalizedBlocks.map((block, index) => ({
    type: "text" as const,
    text: block.text,
    ...(index === lastCacheableIndex
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

function extractAnthropicText(
  blocks: AnthropicAssistantContentBlock[] | undefined
) {
  if (!Array.isArray(blocks)) return "";

  return blocks
    .filter((block): block is AnthropicTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
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

function shouldUseAnthropicNativeMessages(model: string) {
  return (
    getLlmChatProviderForModel(model) === "anthropic" &&
    Boolean((process.env.ANTHROPIC_API_KEY ?? "").trim())
  );
}

async function createAnthropicMessage(args: {
  messages: AnthropicMessage[];
  model: string;
  systemBlocks: CareerChatSystemBlock[];
  temperature: number;
  tools?: TalentChatTool[];
  usageLabel?: string;
}) {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for Anthropic Messages API");
  }

  const tools = args.tools ?? [];
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: CAREER_LLM_CONFIG.chat.maxTokens,
      system: buildAnthropicSystemBlocks(args.systemBlocks),
      messages: args.messages,
      temperature: args.temperature,
      ...(tools.length > 0
        ? {
            tool_choice: { type: "auto" as const },
            tools: buildAnthropicTools(tools),
          }
        : {}),
    }),
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

async function createAnthropicMessageStream(args: {
  messages: AnthropicMessage[];
  model: string;
  onTextDelta: (delta: string) => void | Promise<void>;
  systemBlocks: CareerChatSystemBlock[];
  temperature: number;
  usageLabel?: string;
}) {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for Anthropic Messages API");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: CAREER_LLM_CONFIG.chat.maxTokens,
      system: buildAnthropicSystemBlocks(args.systemBlocks),
      messages: args.messages,
      temperature: args.temperature,
      stream: true,
    }),
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
  let content = "";
  let usage: Record<string, unknown> = {};

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

    if (parsed.type === "message_start" && parsed.message?.usage) {
      usage = { ...usage, ...parsed.message.usage };
      return;
    }

    if (parsed.type === "message_delta" && parsed.usage) {
      usage = { ...usage, ...parsed.usage };
      return;
    }

    if (
      parsed.type === "content_block_delta" &&
      parsed.delta?.type === "text_delta" &&
      typeof parsed.delta.text === "string" &&
      parsed.delta.text
    ) {
      content += parsed.delta.text;
      await args.onTextDelta(parsed.delta.text);
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

  console.info("[career-chat:anthropic-stream]", {
    label: args.usageLabel,
    messageCount: args.messages.length,
    model: args.model,
    systemBlockCount: args.systemBlocks.length,
    systemCacheableKeys: args.systemBlocks
      .filter((block) => block.cacheable)
      .map((block) => block.key ?? "system"),
  });

  return cleanModelText(content);
}

async function runDirectTextCompletion(args: {
  jsonMode?: boolean;
  messages: DirectOpenAIMessage[];
  model: string;
  temperature: number;
  usageLabel?: string;
}) {
  const llmClient = getChatClientForModel(args.model);
  const responseFormat =
    args.jsonMode && supportsResponseFormatForModel(args.model)
      ? ({ type: "json_object" } as const)
      : undefined;
  const response = await llmClient.chat.completions.create({
    model: args.model,
    messages: args.messages,
    temperature: args.temperature,
    ...(responseFormat && { response_format: responseFormat }),
  } as any);
  logLlmTokenUsage({
    label: args.usageLabel,
    model: args.model,
    response,
  });

  return cleanModelText(response.choices[0]?.message?.content ?? "");
}

function assistantModelConfig() {
  return {
    fallbackModel: CAREER_LLM_CONFIG.assistant.fallbackModel,
    primaryModel: CAREER_LLM_CONFIG.assistant.primaryModel,
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
}) {
  const fallbackWithExistingClient = () => {
    const systemPrompt = flattenCareerSystemBlocks(args.systemBlocks);
    const fallbackMessages: TalentChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...args.messages,
    ];

    if (args.tools.length > 0) {
      return runTalentAssistantToolLoop({
        executeTool: args.executeTool,
        messages: fallbackMessages,
        modelConfig: assistantModelConfig(),
        stopAfterToolNames: args.stopAfterToolNames,
        temperature: CAREER_LLM_CONFIG.chat.temperature,
        tools: args.tools,
        usageLabel: "career/chat:assistant",
      });
    }

    return runTalentAssistantCompletion({
      ...assistantModelConfig(),
      messages: fallbackMessages,
      temperature: CAREER_LLM_CONFIG.chat.temperature,
      usageLabel: "career/chat:assistant",
    });
  };

  if (!shouldUseAnthropicNativeMessages(assistantModelConfig().primaryModel)) {
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

    if (args.tools.length === 0) {
      const response = await createAnthropicMessage({
        messages: workingMessages,
        model: assistantModelConfig().primaryModel,
        systemBlocks: args.systemBlocks,
        temperature: CAREER_LLM_CONFIG.chat.temperature,
        usageLabel: "career/chat:assistant",
      });
      return cleanModelText(extractAnthropicText(response.content));
    }

    for (let loop = 0; loop < 3; loop += 1) {
      const response = await createAnthropicMessage({
        messages: workingMessages,
        model: assistantModelConfig().primaryModel,
        systemBlocks: args.systemBlocks,
        temperature: CAREER_LLM_CONFIG.chat.temperature,
        tools: args.tools,
        usageLabel: "career/chat:assistant",
      });

      const assistantBlocks = Array.isArray(response.content)
        ? response.content
        : [];
      const toolUseBlocks = assistantBlocks.filter(
        (block): block is AnthropicToolUseBlock => block.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) {
        return cleanModelText(extractAnthropicText(assistantBlocks));
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

        try {
          const result = await args.executeTool({
            name: toolCall.name,
            input:
              toolCall.input && typeof toolCall.input === "object"
                ? toolCall.input
                : {},
          });
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: serializeToolResult(result),
          });
          if (stopAfterToolNameSet.has(toolCall.name)) {
            shouldStopAfterTool = true;
          }
        } catch (error) {
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
          content: toolResultBlocks,
        });
      }

      if (shouldStopAfterTool) {
        return "";
      }
    }

    const finalResponse = await createAnthropicMessage({
      messages: workingMessages,
      model: assistantModelConfig().primaryModel,
      systemBlocks: args.systemBlocks,
      temperature: CAREER_LLM_CONFIG.chat.temperature,
      tools: args.tools,
      usageLabel: "career/chat:assistant",
    });

    return cleanModelText(extractAnthropicText(finalResponse.content));
  } catch (error) {
    console.error("[career-chat:anthropic-native-fallback]", {
      error: error instanceof Error ? error.message : String(error),
      model: assistantModelConfig().primaryModel,
    });
    return fallbackWithExistingClient();
  }
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
  onTextDelta: (delta: string) => void | Promise<void>;
  stopAfterToolNames?: string[];
  systemBlocks: CareerChatSystemBlock[];
  tools: TalentChatTool[];
}) {
  if (
    args.tools.length > 0 ||
    !shouldUseAnthropicNativeMessages(assistantModelConfig().primaryModel)
  ) {
    const text = await runCareerChatAssistant({
      executeTool: args.executeTool,
      messages: args.messages,
      stopAfterToolNames: args.stopAfterToolNames,
      systemBlocks: args.systemBlocks,
      tools: args.tools,
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
  try {
    return await createAnthropicMessageStream({
      messages: workingMessages,
      model: assistantModelConfig().primaryModel,
      onTextDelta: async (delta) => {
        streamedAnyText = true;
        await args.onTextDelta(delta);
      },
      systemBlocks: args.systemBlocks,
      temperature: CAREER_LLM_CONFIG.chat.temperature,
      usageLabel: "career/chat:assistant",
    });
  } catch (error) {
    if (streamedAnyText) {
      throw error;
    }

    console.error("[career-chat:anthropic-stream-fallback]", {
      error: error instanceof Error ? error.message : String(error),
      model: assistantModelConfig().primaryModel,
    });
    const text = await runCareerChatAssistant({
      executeTool: args.executeTool,
      messages: args.messages,
      stopAfterToolNames: args.stopAfterToolNames,
      systemBlocks: args.systemBlocks,
      tools: args.tools,
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
  systemPrompt: string;
}) {
  return runDirectTextCompletion({
    jsonMode: true,
    messages: [
      { role: "system", content: args.systemPrompt },
      ...args.conversationMessages,
    ],
    model: CAREER_LLM_CONFIG.insightExtraction.model,
    temperature: CAREER_LLM_CONFIG.insightExtraction.temperature,
    usageLabel: "career/chat:insight_extraction",
  });
}

export async function runCareerCallWrapup(args: { prompt: string }) {
  return runDirectTextCompletion({
    messages: [{ role: "user", content: args.prompt }],
    model: CAREER_LLM_CONFIG.callWrapup.model,
    temperature: CAREER_LLM_CONFIG.callWrapup.temperature,
    usageLabel: "career/chat:call_wrapup",
  });
}

export async function runCareerReengagementMessage(args: {
  messages: TalentChatMessage[];
}) {
  return runTalentAssistantCompletion({
    ...assistantModelConfig(),
    messages: args.messages,
    temperature: CAREER_LLM_CONFIG.reengagement.temperature,
  });
}

export async function runCareerHistoryActionReply(args: {
  messages: TalentChatMessage[];
}) {
  return runTalentAssistantCompletion({
    ...assistantModelConfig(),
    messages: args.messages,
    temperature: CAREER_LLM_CONFIG.historyActionReply.temperature,
    usageLabel: "career/history:action_reply",
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
}) {
  return runTalentAssistantCompletion({
    ...assistantModelConfig(),
    messages: args.messages,
    temperature: CAREER_LLM_CONFIG.profileIngestion.temperature,
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

export async function runOpsTalentRecommendation(args: {
  messages: TalentChatMessage[];
}) {
  return runTalentAssistantCompletion({
    ...assistantModelConfig(),
    messages: args.messages,
    temperature: CAREER_LLM_CONFIG.opsRecommendation.temperature,
  });
}

export function getCareerRealtimeSessionConfig(useElevenLabsTts: boolean) {
  return {
    model: CAREER_LLM_CONFIG.realtime.model,
    modalities: useElevenLabsTts ? ["text"] : ["text", "audio"],
    transcriptionModel: CAREER_LLM_CONFIG.realtime.transcriptionModel,
    voice: useElevenLabsTts ? undefined : CAREER_LLM_CONFIG.realtime.voice,
  };
}
