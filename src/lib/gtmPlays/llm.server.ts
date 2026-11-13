import "server-only";

import { createChatCompletionWithFallback } from "@/lib/llm/llm";
import { GPT_6_LUNA_MODEL } from "@/lib/llm/modelConfig";
import { logLlmTokenUsage } from "@/lib/llm/usageLogging";

/** One structured-output call (gpt-6-luna, low effort). Inputs are facts; the model writes the words. */
export async function gtmStructuredCall<T>(args: {
  label: string;
  schemaName: string;
  schema: Record<string, unknown>;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<T> {
  const { model, response } = await createChatCompletionWithFallback({
    model: GPT_6_LUNA_MODEL,
    openAIResponses: { reasoningEffort: "low" },
    debugLabel: args.label,
    structuredOutput: { name: args.schemaName, schema: args.schema },
    buildRequest: (selected) => ({
      model: selected,
      max_completion_tokens: args.maxTokens ?? 4_000,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    }),
  });
  logLlmTokenUsage({ label: args.label, meta: { task: args.label }, model, response });
  const raw = response?.choices?.[0]?.message?.content;
  const text = typeof raw === "string"
    ? raw
    : Array.isArray(raw) ? raw.map((part: { text?: unknown }) => String(part?.text ?? "")).join("") : "";
  return JSON.parse(text) as T;
}
