import type { CareerCapabilityRuntime } from "@/lib/career/capabilities/runtime";
import {
  createChatCompletionStreamWithFallback,
  createChatCompletionWithFallback,
  getLlmChatProviderForModel,
  supportsResponseFormatForModel,
  type ChatCompletionReasoningEffort,
  usesMaxCompletionTokensForModel,
} from "@/lib/llm/llm";
import { GPT_6_LUNA_MODEL } from "@/lib/llm/modelConfig";
import type { OpenAIResponsesReasoningEffort } from "@/lib/llm/responsesChatAdapter";
import {
  logLlmTokenUsage,
  logLlmTokenUsageForToolCalls,
} from "@/lib/llm/usageLogging";
import {
  logTalentToolCall,
  logTalentToolError,
  logTalentToolResult,
} from "./toolLogging";

export type TalentChatTextContentBlock = {
  prompt_cache_breakpoint?: {
    mode: "explicit";
  };
  text: string;
  type: "input_text" | "text";
};

export type TalentChatMessage = {
  _responses_output?: any[];
  content: string | TalentChatTextContentBlock[];
  name?: string;
  reasoning?: string;
  reasoning_content?: string;
  reasoning_details?: unknown[];
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

type TalentJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

type TalentPromptCacheOptions = {
  key: string;
  mode: "explicit";
  ttl: "30m";
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
  chatCompletionReasoningEffort?: ChatCompletionReasoningEffort;
  fallbackModel?: string;
  primaryModel?: string;
};

type LlmToolCostAttribution = {
  step: string;
  toolNames: readonly string[];
};

const DEFAULT_TALENT_PRIMARY_MODEL = GPT_6_LUNA_MODEL;
const DEFAULT_TALENT_FALLBACK_MODEL = "gpt-4.1-mini";
const DEFAULT_TALENT_ANTHROPIC_OVERLOAD_FALLBACK_MODEL = GPT_6_LUNA_MODEL;

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

function flattenTalentMessageContent(content: TalentChatMessage["content"]) {
  if (typeof content === "string") return content;
  return content
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

function supportsExplicitPromptCache(model: string) {
  const normalized = model.trim().toLowerCase();
  return (
    getLlmChatProviderForModel(normalized) === "openai" &&
    (normalized === GPT_6_LUNA_MODEL ||
      normalized === "gpt-5.6" ||
      normalized.startsWith("gpt-5.6-"))
  );
}

function getOpenAiResponseToolCallNames(response: any) {
  const toolCalls = response?.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls
    .map((toolCall) => String(toolCall?.function?.name ?? "").trim())
    .filter(Boolean);
}

async function createTalentChatCompletion(args: {
  anthropicOverloadFallbackModel?: string;
  chatCompletionReasoningEffort?: ChatCompletionReasoningEffort;
  fallbackModel?: string;
  messages: TalentChatMessage[];
  onTextDelta?: (delta: string) => void | Promise<void>;
  openAIResponsesReasoningEffort?: OpenAIResponsesReasoningEffort;
  primaryModel?: string;
  temperature: number;
  toolCostAttribution?: LlmToolCostAttribution;
  tools?: TalentChatTool[];
  usageLabel?: string;
}) {
  const {
    anthropicOverloadFallbackModel = DEFAULT_TALENT_ANTHROPIC_OVERLOAD_FALLBACK_MODEL,
    chatCompletionReasoningEffort,
    fallbackModel = DEFAULT_TALENT_FALLBACK_MODEL,
    messages,
    onTextDelta,
    openAIResponsesReasoningEffort,
    primaryModel = DEFAULT_TALENT_PRIMARY_MODEL,
    temperature,
    tools,
    usageLabel,
  } = args;

  const toolPayload =
    tools && tools.length > 0
      ? ({ tools: tools as any, tool_choice: "auto" as const } as const)
      : undefined;

  const completionArgs = {
    anthropicOverloadFallbackModel,
    ...(chatCompletionReasoningEffort
      ? {
          chatCompletionReasoning: {
            reasoningEffort: chatCompletionReasoningEffort,
          },
        }
      : {}),
    fallbackModel,
    model: primaryModel,
    debugLabel: usageLabel,
    ...(openAIResponsesReasoningEffort
      ? {
          openAIResponses: {
            reasoningEffort: openAIResponsesReasoningEffort,
          },
        }
      : {}),
    buildRequest: () => ({
      messages: messages as any,
      temperature,
      ...(toolPayload ?? {}),
    }),
  };
  const { model, response } = onTextDelta
    ? await createChatCompletionStreamWithFallback({
        ...completionArgs,
        onTextDelta,
      })
    : await createChatCompletionWithFallback(completionArgs);
  logLlmTokenUsage({
    label: usageLabel,
    meta: { offeredToolNames: (tools ?? []).map(tool => tool.function.name) },
    model,
    response,
  });
  const toolCallNames = getOpenAiResponseToolCallNames(response);
  if (toolCallNames.length > 0) {
    logLlmTokenUsageForToolCalls({
      baseLabel: usageLabel,
      model,
      response,
      step: "tool_call",
      toolNames: toolCallNames,
    });
  } else if (args.toolCostAttribution) {
    logLlmTokenUsageForToolCalls({
      baseLabel: usageLabel,
      model,
      response,
      step: args.toolCostAttribution.step,
      toolNames: args.toolCostAttribution.toolNames,
    });
  }
  return response;
}

export async function runTalentAssistantCompletion(args: {
  abortSignal?: AbortSignal;
  anthropicOverloadFallbackModel?: string;
  chatCompletionReasoningEffort?: ChatCompletionReasoningEffort;
  fallbackModel?: string;
  jsonSchema?: TalentJsonSchema;
  maxTokens?: number;
  openAIResponsesPromptCache?: TalentPromptCacheOptions;
  primaryModel?: string;
  messages: TalentChatMessage[];
  openAIResponsesReasoningEffort?: OpenAIResponsesReasoningEffort;
  temperature?: number;
  jsonMode?: boolean;
  usageLabel?: string;
}) {
  const {
    abortSignal,
    anthropicOverloadFallbackModel = DEFAULT_TALENT_ANTHROPIC_OVERLOAD_FALLBACK_MODEL,
    chatCompletionReasoningEffort,
    fallbackModel = DEFAULT_TALENT_FALLBACK_MODEL,
    jsonSchema,
    maxTokens,
    messages,
    openAIResponsesPromptCache,
    openAIResponsesReasoningEffort,
    primaryModel = DEFAULT_TALENT_PRIMARY_MODEL,
    temperature = 0.35,
    jsonMode = false,
    usageLabel,
  } = args;
  const { model, response } = await createChatCompletionWithFallback({
    anthropicOverloadFallbackModel,
    ...(chatCompletionReasoningEffort
      ? {
          chatCompletionReasoning: {
            reasoningEffort: chatCompletionReasoningEffort,
          },
        }
      : {}),
    fallbackModel,
    model: primaryModel,
    debugLabel: usageLabel,
    signal: abortSignal,
    ...(openAIResponsesReasoningEffort
      ? {
          openAIResponses: {
            reasoningEffort: openAIResponsesReasoningEffort,
          },
        }
      : {}),
    buildRequest: (model) => {
      const useExplicitPromptCache = Boolean(
        openAIResponsesPromptCache && supportsExplicitPromptCache(model)
      );
      const responseFormat =
        (jsonMode || jsonSchema) && supportsResponseFormatForModel(model)
          ? jsonSchema
            ? ({
                json_schema: {
                  name: jsonSchema.name,
                  schema: jsonSchema.schema,
                  strict: jsonSchema.strict !== false,
                },
                type: "json_schema",
              } as const)
            : ({ type: "json_object" } as const)
          : undefined;
      return {
        messages: (useExplicitPromptCache
          ? messages
          : messages.map((message) => ({
              ...message,
              content: flattenTalentMessageContent(message.content),
            }))) as any,
        temperature,
        ...(maxTokens
          ? usesMaxCompletionTokensForModel(model)
            ? { max_completion_tokens: maxTokens }
            : { max_tokens: maxTokens }
          : {}),
        ...(useExplicitPromptCache
          ? {
              prompt_cache_key: openAIResponsesPromptCache!.key,
              prompt_cache_options: {
                mode: openAIResponsesPromptCache!.mode,
                ttl: openAIResponsesPromptCache!.ttl,
              },
            }
          : {}),
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
  toolRuntime?: CareerCapabilityRuntime;
  executeTool: (args: {
    input: Record<string, unknown>;
    name: string;
  }) => Promise<unknown>;
  maxToolLoops?: number;
  maxTotalToolCalls?: number;
  modelConfig?: TalentAssistantModelConfig;
  messages: TalentChatMessage[];
  onToolStart?: (args: {
    id: string;
    input: Record<string, unknown>;
    name: string;
  }) => void | Promise<void>;
  onStopToolStart?: (args: {
    id: string;
    input: Record<string, unknown>;
    name: string;
  }) => void | Promise<void>;
  onTextDelta?: (delta: string) => void | Promise<void>;
  openAIResponsesReasoningEffort?: OpenAIResponsesReasoningEffort;
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
    onStopToolStart,
    onTextDelta,
    onToolStart,
    openAIResponsesReasoningEffort,
    stopAfterToolNames = [],
    temperature = 0.35,
    tools,
    usageLabel,
  } = args;

  if (tools.length === 0 && !onTextDelta) {
    return runTalentAssistantCompletion({
      anthropicOverloadFallbackModel:
        modelConfig?.anthropicOverloadFallbackModel,
      chatCompletionReasoningEffort: modelConfig?.chatCompletionReasoningEffort,
      fallbackModel: modelConfig?.fallbackModel,
      messages,
      openAIResponsesReasoningEffort,
      primaryModel: modelConfig?.primaryModel,
      temperature,
      usageLabel,
    });
  }

  if (tools.length === 0) {
    const response = await createTalentChatCompletion({
      anthropicOverloadFallbackModel:
        modelConfig?.anthropicOverloadFallbackModel,
      chatCompletionReasoningEffort: modelConfig?.chatCompletionReasoningEffort,
      fallbackModel: modelConfig?.fallbackModel,
      messages,
      onTextDelta,
      openAIResponsesReasoningEffort,
      primaryModel: modelConfig?.primaryModel,
      temperature,
      usageLabel,
    });
    return cleanModelText(getMessageContent(response.choices[0]?.message));
  }

  const workingMessages = [...messages];
  const stopAfterToolNameSet = new Set(stopAfterToolNames);
  let totalToolCalls = 0;
  let pendingToolResultAttribution: string[] = [];

  for (let loop = 0; loop < (args.toolRuntime?.maxToolLoops ?? maxToolLoops); loop += 1) {
    const capabilityStep = args.toolRuntime?.resolveStep();
    const stepTools = capabilityStep?.tools ?? tools;
    const offeredNames = new Set(stepTools.map(tool => tool.function.name));
    if (capabilityStep) {
      const content = capabilityStep.systemBlocks.map(b => b.text).join("\n\n");
      const systemIndex = workingMessages.findIndex(m => m.role === "system");
      if (systemIndex >= 0) workingMessages[systemIndex] = { role: "system", content };
    }
    const toolCostAttribution =
      pendingToolResultAttribution.length > 0
        ? {
            step: "tool_result_response",
            toolNames: pendingToolResultAttribution,
          }
        : undefined;
    pendingToolResultAttribution = [];
    const response = await createTalentChatCompletion({
      anthropicOverloadFallbackModel:
        modelConfig?.anthropicOverloadFallbackModel,
      chatCompletionReasoningEffort: modelConfig?.chatCompletionReasoningEffort,
      fallbackModel: modelConfig?.fallbackModel,
      messages: workingMessages,
      onTextDelta,
      openAIResponsesReasoningEffort,
      primaryModel: modelConfig?.primaryModel,
      temperature,
      toolCostAttribution,
      tools: stepTools,
      usageLabel,
    });

    const message = response.choices[0]?.message as any;
    const assistantContent = cleanModelText(getMessageContent(message));
    const toolCalls = Array.isArray(message?.tool_calls)
      ? message.tool_calls.map((call: any) => ({ ...call, id: String(call.id ?? crypto.randomUUID()) }))
      : [];

    if (toolCalls.length === 0) {
      return assistantContent;
    }

    workingMessages.push({
      ...(Array.isArray(message?._responses_output)
        ? { _responses_output: message._responses_output }
        : {}),
      ...(typeof message?.reasoning === "string"
        ? { reasoning: message.reasoning }
        : {}),
      ...(typeof message?.reasoning_content === "string"
        ? { reasoning_content: message.reasoning_content }
        : {}),
      ...(Array.isArray(message?.reasoning_details)
        ? { reasoning_details: message.reasoning_details }
        : {}),
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

    const remainingToolCalls = (args.toolRuntime?.maxToolCalls ?? maxTotalToolCalls) - totalToolCalls;
    const executableToolCalls =
      remainingToolCalls > 0 ? toolCalls.slice(0, remainingToolCalls) : [];
    const skippedToolCalls = toolCalls.slice(executableToolCalls.length);
    const attemptedToolNames: string[] = [];

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

      const callError = capabilityStep ? args.toolRuntime!.claimCall(toolName, capabilityStep)
        : !offeredNames.has(toolName) ? "tool_not_offered" : null;
      if (callError || args.toolRuntime?.isInternalTool(toolName)) {
        const result = callError ? { ok: false, error: callError } : args.toolRuntime!.load(parsedArguments, capabilityStep!);
        workingMessages.push({ role: "tool", tool_call_id: toolCallId, name: toolName, content: JSON.stringify(result) });
        continue;
      }
      attemptedToolNames.push(toolName);
      logTalentToolCall({
        callId: toolCallId,
        input: parsedArguments,
        loop,
        name: toolName,
        source: usageLabel ?? "talent-assistant-tool-loop",
      });
      const toolStartedAt = Date.now();
      try {
        await onToolStart?.({
          id: toolCallId,
          name: toolName,
          input: parsedArguments,
        });
        if (stopAfterToolNameSet.has(toolName)) {
          await onStopToolStart?.({
            id: toolCallId,
            name: toolName,
            input: parsedArguments,
          });
        }
        const result = await executeTool({
          name: toolName,
          input: parsedArguments,
        });
        if (capabilityStep) await args.toolRuntime!.recordResult(toolName, result, capabilityStep);
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
          for (const pending of executableToolCalls.slice(executableToolCalls.indexOf(toolCall) + 1)) {
            workingMessages.push({ role: "tool", tool_call_id: pending.id, name: pending.function?.name,
              content: JSON.stringify({ ok: false, error: "turn_ended_by_terminal_tool", executed: false }) });
          }
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
    pendingToolResultAttribution = attemptedToolNames;
  }

  if (args.toolRuntime) {
    const finalStep = args.toolRuntime.resolveStep();
    const content = finalStep.systemBlocks.map(block => block.text).join("\n\n") +
      "\n\nTool calls are exhausted for this turn. Answer using the completed results; do not claim unexecuted work is complete.";
    const systemIndex = workingMessages.findIndex(message => message.role === "system");
    if (systemIndex >= 0) workingMessages[systemIndex] = { role: "system", content };
  }

  const fallback = await createTalentChatCompletion({
    anthropicOverloadFallbackModel: modelConfig?.anthropicOverloadFallbackModel,
    chatCompletionReasoningEffort: modelConfig?.chatCompletionReasoningEffort,
    fallbackModel: modelConfig?.fallbackModel,
    messages: workingMessages,
    onTextDelta,
    openAIResponsesReasoningEffort,
    primaryModel: modelConfig?.primaryModel,
    temperature,
    toolCostAttribution:
      pendingToolResultAttribution.length > 0
        ? {
            step: "tool_result_response",
            toolNames: pendingToolResultAttribution,
          }
        : undefined,
    usageLabel,
  });

  return cleanModelText(getMessageContent(fallback.choices[0]?.message));
}
