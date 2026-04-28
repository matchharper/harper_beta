import {
  getChatClientForModel,
  supportsResponseFormatForModel,
} from "@/lib/llm/llm";
import { logLlmTokenUsage } from "@/lib/llm/usageLogging";

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
  fallbackModel?: string;
  primaryModel?: string;
};

const DEFAULT_TALENT_PRIMARY_MODEL = "grok-4-1-fast-non-reasoning";
const DEFAULT_TALENT_FALLBACK_MODEL = "gpt-4.1-mini";

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
  fallbackModel?: string;
  messages: TalentChatMessage[];
  primaryModel?: string;
  temperature: number;
  tools?: TalentChatTool[];
  usageLabel?: string;
}) {
  const {
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

  try {
    const primaryClient = getChatClientForModel(primaryModel);
    const response = await primaryClient.chat.completions.create({
      model: primaryModel,
      messages: messages as any,
      temperature,
      ...(toolPayload ?? {}),
    } as any);
    logLlmTokenUsage({
      label: usageLabel,
      model: primaryModel,
      response,
    });
    return response;
  } catch {
    const fallbackClient = getChatClientForModel(fallbackModel);
    const response = await fallbackClient.chat.completions.create({
      model: fallbackModel,
      messages: messages as any,
      temperature,
      ...(toolPayload ?? {}),
    } as any);
    logLlmTokenUsage({
      label: usageLabel,
      model: fallbackModel,
      response,
    });
    return response;
  }
}

export async function runTalentAssistantCompletion(args: {
  fallbackModel?: string;
  primaryModel?: string;
  messages: TalentChatMessage[];
  temperature?: number;
  jsonMode?: boolean;
  usageLabel?: string;
}) {
  const {
    fallbackModel = DEFAULT_TALENT_FALLBACK_MODEL,
    messages,
    primaryModel = DEFAULT_TALENT_PRIMARY_MODEL,
    temperature = 0.35,
    jsonMode = false,
    usageLabel,
  } = args;
  const primaryResponseFormat =
    jsonMode && supportsResponseFormatForModel(primaryModel)
      ? ({ type: "json_object" } as const)
      : undefined;
  const fallbackResponseFormat =
    jsonMode && supportsResponseFormatForModel(fallbackModel)
      ? ({ type: "json_object" } as const)
      : undefined;

  try {
    const primaryClient = getChatClientForModel(primaryModel);
    const response = await primaryClient.chat.completions.create({
      model: primaryModel,
      messages: messages as any,
      temperature,
      ...(primaryResponseFormat && { response_format: primaryResponseFormat }),
    } as any);
    logLlmTokenUsage({
      label: usageLabel,
      model: primaryModel,
      response,
    });
    return cleanModelText(getMessageContent(response.choices[0]?.message));
  } catch {
    const fallbackClient = getChatClientForModel(fallbackModel);
    const fallback = await fallbackClient.chat.completions.create({
      model: fallbackModel,
      messages: messages as any,
      temperature,
      ...(fallbackResponseFormat && {
        response_format: fallbackResponseFormat,
      }),
    } as any);
    logLlmTokenUsage({
      label: usageLabel,
      model: fallbackModel,
      response: fallback,
    });
    return cleanModelText(getMessageContent(fallback.choices[0]?.message));
  }
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

      try {
        const result = await executeTool({
          name: toolName,
          input: parsedArguments,
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
    fallbackModel: modelConfig?.fallbackModel,
    messages: workingMessages,
    primaryModel: modelConfig?.primaryModel,
    temperature,
    usageLabel,
  });

  return cleanModelText(getMessageContent(fallback.choices[0]?.message));
}
