export type OpenAIResponsesReasoningEffort =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

type ChatMessageWithResponsesOutput = Record<string, any> & {
  _responses_output?: any[];
};

export function toOpenAIResponsesInput(messages: unknown) {
  if (!Array.isArray(messages)) return [];
  const input: any[] = [];

  for (const rawMessage of messages) {
    if (!rawMessage || typeof rawMessage !== "object") continue;
    const message = rawMessage as ChatMessageWithResponsesOutput;
    if (
      message.role === "assistant" &&
      Array.isArray(message._responses_output)
    ) {
      input.push(...message._responses_output);
      continue;
    }
    if (message.role === "tool") {
      input.push({
        call_id: String(message.tool_call_id ?? ""),
        output: String(message.content ?? ""),
        type: "function_call_output",
      });
      continue;
    }
    if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
      if (message.content) {
        input.push({ content: message.content, role: "assistant" });
      }
      for (const toolCall of message.tool_calls) {
        if (toolCall?.type !== "function") continue;
        input.push({
          arguments: String(toolCall.function?.arguments ?? "{}"),
          call_id: String(toolCall.id ?? ""),
          name: String(toolCall.function?.name ?? ""),
          type: "function_call",
        });
      }
      continue;
    }
    if (
      message.role === "assistant" ||
      message.role === "developer" ||
      message.role === "system" ||
      message.role === "user"
    ) {
      input.push({
        content: String(message.content ?? ""),
        role: message.role,
      });
    }
  }

  return input;
}

function toOpenAIResponsesTools(tools: unknown) {
  if (!Array.isArray(tools)) return undefined;
  return tools.flatMap((tool: any) => {
    if (tool?.type !== "function" || !tool.function?.name) return [];
    return [
      {
        description: tool.function.description,
        name: tool.function.name,
        parameters: tool.function.parameters ?? null,
        strict: tool.function.strict ?? false,
        type: "function" as const,
      },
    ];
  });
}

function toOpenAIResponsesToolChoice(toolChoice: unknown) {
  if (
    toolChoice === "auto" ||
    toolChoice === "none" ||
    toolChoice === "required"
  ) {
    return toolChoice;
  }
  const functionName = (toolChoice as any)?.function?.name;
  return functionName
    ? { name: functionName, type: "function" as const }
    : undefined;
}

function toOpenAIResponsesTextConfig(responseFormat: unknown) {
  if (
    responseFormat &&
    typeof responseFormat === "object" &&
    (responseFormat as { type?: unknown }).type === "json_object"
  ) {
    return { format: { type: "json_object" as const } };
  }
  return undefined;
}

export function buildOpenAIResponsesRequest(args: {
  model: string;
  reasoningEffort: OpenAIResponsesReasoningEffort;
  requestBody: Record<string, unknown>;
}) {
  const tools = toOpenAIResponsesTools(args.requestBody.tools);
  const text = toOpenAIResponsesTextConfig(args.requestBody.response_format);
  return {
    include: ["reasoning.encrypted_content"],
    input: toOpenAIResponsesInput(args.requestBody.messages),
    max_output_tokens: Number(
      args.requestBody.max_completion_tokens ??
        args.requestBody.max_tokens ??
        4_000
    ),
    model: args.model,
    reasoning: { effort: args.reasoningEffort },
    store: false,
    ...(text ? { text } : {}),
    ...(tools && tools.length > 0
      ? {
          tool_choice: toOpenAIResponsesToolChoice(
            args.requestBody.tool_choice
          ),
          tools,
        }
      : {}),
  };
}

export function toChatCompletionFromOpenAIResponse(response: any) {
  const output = Array.isArray(response?.output) ? response.output : [];
  const toolCalls = output.flatMap((item: any) =>
    item?.type === "function_call"
      ? [
          {
            function: {
              arguments: String(item.arguments ?? "{}"),
              name: String(item.name ?? ""),
            },
            id: String(item.call_id ?? item.id ?? ""),
            type: "function" as const,
          },
        ]
      : []
  );
  const text = output
    .flatMap((item: any) =>
      item?.type === "message" && Array.isArray(item.content)
        ? item.content
        : []
    )
    .flatMap((part: any) =>
      part?.type === "output_text" && typeof part.text === "string"
        ? [part.text]
        : []
    )
    .join("");
  const usage = response?.usage ?? {};

  return {
    choices: [
      {
        finish_reason:
          toolCalls.length > 0
            ? "tool_calls"
            : response?.status === "incomplete"
              ? "length"
              : "stop",
        index: 0,
        message: {
          _responses_output: output,
          content: text || null,
          role: "assistant",
          ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
        },
      },
    ],
    created: response?.created_at,
    id: response?.id,
    model: response?.model,
    object: "chat.completion",
    usage: {
      ...usage,
      completion_tokens: usage.output_tokens,
      prompt_tokens: usage.input_tokens,
    },
  };
}
