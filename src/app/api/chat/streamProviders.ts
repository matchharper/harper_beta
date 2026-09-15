import { createChatCompletionStreamWithFallback } from "@/lib/llm/llm";
import { GPT_56_LUNA_MODEL } from "@/lib/llm/modelConfig";

type LunaChatMessage = {
  content: string;
  name?: string;
  role: "assistant" | "system" | "tool" | "user";
  tool_call_id?: string;
  tool_calls?: unknown[];
};

export function createLunaChatCompletion(args: {
  messages: LunaChatMessage[];
  onTextDelta: (delta: string) => void | Promise<void>;
  temperature: number;
  tool_choice?: unknown;
  tools?: unknown;
}) {
  return createChatCompletionStreamWithFallback({
    buildRequest: () => ({
      max_completion_tokens: 4_000,
      messages: args.messages,
      temperature: args.temperature,
      ...(args.tools ? { tools: args.tools } : {}),
      ...(args.tool_choice ? { tool_choice: args.tool_choice } : {}),
    }),
    debugLabel: "legacy-chat:luna",
    model: GPT_56_LUNA_MODEL,
    onTextDelta: args.onTextDelta,
    openAIResponses: { reasoningEffort: "xhigh" },
  });
}

export async function createLunaReadableStream(args: {
  messages: { role: "user" | "assistant"; content: string }[];
  systemPrompt: string;
  temperature: number;
  tool_choice?: unknown;
  tools?: unknown;
}) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await createLunaChatCompletion({
          messages: [
            { role: "system", content: args.systemPrompt },
            ...args.messages,
          ],
          onTextDelta: (delta) => {
            if (delta) controller.enqueue(encoder.encode(delta));
          },
          temperature: args.temperature,
          tool_choice: args.tool_choice,
          tools: args.tools,
        });
      } catch (error) {
        controller.error(error);
        return;
      }
      controller.close();
    },
  });

  return { provider: "openai" as const, stream };
}
