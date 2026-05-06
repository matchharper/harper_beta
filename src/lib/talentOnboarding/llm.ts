import {
  createChatCompletionWithFallback,
  supportsResponseFormatForModel,
} from "@/lib/llm/llm";
import { logLlmTokenUsage } from "@/lib/llm/usageLogging";
import {
  logTalentToolCall,
  logTalentToolError,
  logTalentToolResult,
} from "./toolLogging";

export type TalentChatMessage = {
  content: string;
  name?: string;
  role: "system" | "user" | "assistant" | "tool";
  tool_call_id?: string;
  tool_calls?: Array<{
    function: {
      arguments: string;
      name: string;
    };
    id: string;
    type: "function";
  }>;
};

export type TalentChatTool = {
  function: {
    description: string;
    name: string;
    parameters: Record<string, unknown>;
  };
  type: "function";
};

type TalentAssistantModelConfig = {
  anthropicOverloadFallbackModel?: string;
  fallbackModel?: string;
  primaryModel?: string;
};

const DEFAULT_TALENT_PRIMARY_MODEL = "grok-4-1-fast-non-reasoning";
const DEFAULT_TALENT_FALLBACK_MODEL = "gpt-4.1-mini";
const DEFAULT_TALENT_ANTHROPIC_OVERLOAD_FALLBACK_MODEL =
  "grok-4-1-fast-reasoning";

function cleanModelText(raw: string) {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function getMessageContent(message: any) {
  if (typeof message?.content === "string") {
    return message.content;
  }

  if (Array.isArray(message?.content)) {
    return message.content
      .map((item: any) => {
        if (typeof item?.text === "string") return item.text;
        if (typeof item?.content === "string") return item.content;
        return "";
      })
      .join("");
  }

  return "";
}

async function createTalentChatCompletion(args: {
  anthropicOverloadFallbackModel?: string;
  fallbackModel?: string;
  messages: TalentChatMessage[];
  primaryModel?: string;
  temperature: number;
  tools?: TalentChatTool[];
  usageLabel?: string;
}) {
  const {
    anthropicOverloadFallbackModel =
      DEFAULT_TALENT_ANTHROPIC_OVERLOAD_FALLBACK_MODEL,
    fallbackModel = DEFAULT_TALENT_FALLBACK_MODEL,
    messages,
    primaryModel = DEFAULT_TALENT_PRIMARY_MODEL,
    temperature,
    tools,
    usageLabel,
  } = args;

  const toolPayload =
    tools && tools.length > 0
      ? ({ tools: tools as any, tool_choice: "auto" as const } as const)
      : undefined;

  const { model, response } = await createChatCompletionWithFallback({
    anthropicOverloadFallbackModel,
    fallbackModel,
    model: primaryModel,
    buildRequest: () => ({
      messages: messages as any,
      temperature,
      ...(toolPayload ?? {}),
    }),
  });
  logLlmTokenUsage({
    label: usageLabel,
    model,
    response,
  });
  return response;
}

export async function runTalentAssistantCompletion(args: {
  anthropicOverloadFallbackModel?: string;
  fallbackModel?: string;
  primaryModel?: string;
  messages: TalentChatMessage[];
  temperature?: number;
  jsonMode?: boolean;
  usageLabel?: string;
}) {
  const {
    anthropicOverloadFallbackModel =
      DEFAULT_TALENT_ANTHROPIC_OVERLOAD_FALLBACK_MODEL,
    fallbackModel = DEFAULT_TALENT_FALLBACK_MODEL,
    messages,
    primaryModel = DEFAULT_TALENT_PRIMARY_MODEL,
    temperature = 0.35,
    jsonMode = false,
    usageLabel,
  } = args;
  const { model, response } = await createChatCompletionWithFallback({
    anthropicOverloadFallbackModel,
    fallbackModel,
    model: primaryModel,
    buildRequest: (model) => {
      const responseFormat =
        jsonMode && supportsResponseFormatForModel(model)
          ? ({ type: "json_object" } as const)
          : undefined;
      return {
        messages: messages as any,
        temperature,
        ...(responseFormat && { response_format: responseFormat }),
      };
    },
  });
  logLlmTokenUsage({
    label: usageLabel,
    model,
    response,
  });
  return cleanModelText(getMessageContent(response.choices[0]?.message));
}

export async function runTalentAssistantToolLoop(args: {
  executeTool: (args: {
    input: Record<string, unknown>;
    name: string;
  }) => Promise<unknown>;
  maxToolLoops?: number;
  maxTotalToolCalls?: number;
  modelConfig?: TalentAssistantModelConfig;
  messages: TalentChatMessage[];
  stopAfterToolNames?: string[];
  temperature?: number;
  tools: TalentChatTool[];
  usageLabel?: string;
}) {
  const {
    executeTool,
    maxToolLoops = 3,
    maxTotalToolCalls = 4,
    modelConfig,
    messages,
    stopAfterToolNames = [],
    temperature = 0.35,
    tools,
    usageLabel,
  } = args;

  if (tools.length === 0) {
    return runTalentAssistantCompletion({
      anthropicOverloadFallbackModel:
        modelConfig?.anthropicOverloadFallbackModel,
      fallbackModel: modelConfig?.fallbackModel,
      messages,
      primaryModel: modelConfig?.primaryModel,
      temperature,
      usageLabel,
    });
  }

  const workingMessages = [...messages];
  const stopAfterToolNameSet = new Set(stopAfterToolNames);
  let totalToolCalls = 0;

  for (let loop = 0; loop < maxToolLoops; loop += 1) {
    const response = await createTalentChatCompletion({
      anthropicOverloadFallbackModel:
        modelConfig?.anthropicOverloadFallbackModel,
      fallbackModel: modelConfig?.fallbackModel,
      messages: workingMessages,
      primaryModel: modelConfig?.primaryModel,
      temperature,
      tools,
      usageLabel,
    });

    const message = response.choices[0]?.message as any;
    const assistantContent = cleanModelText(getMessageContent(message));
    const toolCalls = Array.isArray(message?.tool_calls)
      ? message.tool_calls
      : [];

    if (toolCalls.length === 0) {
      return assistantContent;
    }

    workingMessages.push({
      role: "assistant",
      content: assistantContent,
      tool_calls: toolCalls.map((toolCall: any) => ({
        id: String(toolCall.id ?? crypto.randomUUID()),
        type: "function",
        function: {
          name: String(toolCall.function?.name ?? ""),
          arguments: String(toolCall.function?.arguments ?? "{}"),
        },
      })),
    });

    const remainingToolCalls = maxTotalToolCalls - totalToolCalls;
    const executableToolCalls =
      remainingToolCalls > 0 ? toolCalls.slice(0, remainingToolCalls) : [];
    const skippedToolCalls = toolCalls.slice(executableToolCalls.length);

    for (const skippedToolCall of skippedToolCalls) {
      workingMessages.push({
        role: "tool",
        tool_call_id: String(skippedToolCall.id ?? crypto.randomUUID()),
        name: String(skippedToolCall.function?.name ?? "unknown_tool"),
        content: JSON.stringify({
          error: "Tool call limit reached. Continue without more tool usage.",
        }),
      });
    }

    for (const toolCall of executableToolCalls) {
      totalToolCalls += 1;

      const toolName = String(toolCall.function?.name ?? "").trim();
      const toolCallId = String(toolCall.id ?? crypto.randomUUID());
      const rawArguments = String(toolCall.function?.arguments ?? "{}");

      let parsedArguments: Record<string, unknown> = {};
      try {
        const parsed = rawArguments ? JSON.parse(rawArguments) : {};
        parsedArguments =
          parsed && typeof parsed === "object" ? parsed : { value: parsed };
      } catch {
        parsedArguments = { _raw: rawArguments };
      }

      logTalentToolCall({
        callId: toolCallId,
        input: parsedArguments,
        loop,
        name: toolName,
        source: usageLabel ?? "talent-assistant-tool-loop",
      });
      const toolStartedAt = Date.now();
      try {
        const result = await executeTool({
          name: toolName,
          input: parsedArguments,
        });
        logTalentToolResult({
          callId: toolCallId,
          durationMs: Date.now() - toolStartedAt,
          name: toolName,
          result,
          source: usageLabel ?? "talent-assistant-tool-loop",
        });

        workingMessages.push({
          role: "tool",
          tool_call_id: toolCallId,
          name: toolName,
          content: JSON.stringify(result),
        });
        if (stopAfterToolNameSet.has(toolName)) {
          return "";
        }
      } catch (error) {
        logTalentToolError({
          callId: toolCallId,
          durationMs: Date.now() - toolStartedAt,
          error,
          name: toolName,
          source: usageLabel ?? "talent-assistant-tool-loop",
        });
        workingMessages.push({
          role: "tool",
          tool_call_id: toolCallId,
          name: toolName,
          content: JSON.stringify({
            error:
              error instanceof Error ? error.message : "Tool execution failed",
          }),
        });
      }
    }
  }

  const fallback = await createTalentChatCompletion({
    anthropicOverloadFallbackModel: modelConfig?.anthropicOverloadFallbackModel,
    fallbackModel: modelConfig?.fallbackModel,
    messages: workingMessages,
    primaryModel: modelConfig?.primaryModel,
    temperature,
    usageLabel,
  });

  return cleanModelText(getMessageContent(fallback.choices[0]?.message));
}
