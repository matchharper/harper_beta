import { client, xaiClient } from "@/lib/llm/llm";

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
  messages: TalentChatMessage[];
  temperature: number;
  tools?: TalentChatTool[];
}) {
  const { messages, temperature, tools } = args;
  const toolPayload =
    tools && tools.length > 0
      ? ({ tools: tools as any, tool_choice: "auto" as const } as const)
      : undefined;

  try {
    return await xaiClient.chat.completions.create({
      model: "grok-4-1-fast-non-reasoning",
      messages: messages as any,
      temperature,
      ...(toolPayload ?? {}),
    });
  } catch {
    return client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: messages as any,
      temperature,
      ...(toolPayload ?? {}),
    });
  }
}

export async function runTalentAssistantCompletion(args: {
  messages: TalentChatMessage[];
  temperature?: number;
  jsonMode?: boolean;
}) {
  const { messages, temperature = 0.35, jsonMode = false } = args;
  const responseFormat = jsonMode
    ? ({ type: "json_object" } as const)
    : undefined;

  try {
    const response = await xaiClient.chat.completions.create({
      model: "grok-4-1-fast-non-reasoning",
      messages: messages as any,
      temperature,
      ...(responseFormat && { response_format: responseFormat }),
    });
    return cleanModelText(getMessageContent(response.choices[0]?.message));
  } catch {
    const fallback = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: messages as any,
      temperature,
      ...(responseFormat && { response_format: responseFormat }),
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
  messages: TalentChatMessage[];
  temperature?: number;
  tools: TalentChatTool[];
}) {
  const {
    executeTool,
    maxToolLoops = 3,
    maxTotalToolCalls = 4,
    messages,
    temperature = 0.35,
    tools,
  } = args;

  if (tools.length === 0) {
    return runTalentAssistantCompletion({
      messages,
      temperature,
    });
  }

  const workingMessages = [...messages];
  let totalToolCalls = 0;

  for (let loop = 0; loop < maxToolLoops; loop += 1) {
    const response = await createTalentChatCompletion({
      messages: workingMessages,
      temperature,
      tools,
    });

    const message = response.choices[0]?.message as any;
    const assistantContent = cleanModelText(getMessageContent(message));
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];

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
    messages: workingMessages,
    temperature,
  });

  return cleanModelText(getMessageContent(fallback.choices[0]?.message));
}
