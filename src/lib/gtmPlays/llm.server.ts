import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { createChatCompletionWithFallback } from "@/lib/llm/llm";
import { GPT_6_LUNA_MODEL } from "@/lib/llm/modelConfig";
import { logLlmTokenUsage } from "@/lib/llm/usageLogging";

/** The model and effort of every gtmStructuredCall (#5 keeps it in its 설정 묶음, agent/config.ts). */
export const GTM_STRUCTURED_MODEL = { model: GPT_6_LUNA_MODEL, reasoningEffort: "low" } as const;

/** One call's request, as captured by capturePrompts instead of being sent. */
export type CapturedPrompt = { label: string; model: string; system: string; user: string };

const promptCapture = new AsyncLocalStorage<CapturedPrompt[]>();

/** What a captured call throws (nothing was sent; the caller's own fallback, if any, runs as for any failed call). */
class PromptCaptured extends Error {
  constructor() {
    super("prompt captured for its version (no model call made)");
  }
}

/**
 * Runs `work` with every gtmStructuredCall inside it recorded instead of sent: no model call is made and no money
 * spent (each call throws once recorded). For a prompt's version (agent/config.server.ts), when the prompt is built
 * inside a server function rather than a pure one.
 */
export async function capturePrompts(work: () => Promise<unknown>): Promise<CapturedPrompt[]> {
  const captured: CapturedPrompt[] = [];
  await promptCapture.run(captured, async () => {
    try {
      await work();
    } catch (error) {
      if (!(error instanceof PromptCaptured)) throw error;
    }
  });
  return captured;
}

/** One structured-output call (gpt-6-luna, low effort). Inputs are facts; the model writes the words. */
export async function gtmStructuredCall<T>(args: {
  label: string;
  schemaName: string;
  schema: Record<string, unknown>;
  system: string;
  user: string;
  maxTokens?: number;
  /** Stops the call (and its retries), e.g. after a time limit. */
  signal?: AbortSignal;
}): Promise<T> {
  const capture = promptCapture.getStore();
  if (capture) {
    capture.push({ label: args.label, model: GTM_STRUCTURED_MODEL.model, system: args.system, user: args.user });
    throw new PromptCaptured();
  }
  const { model, response } = await createChatCompletionWithFallback({
    model: GTM_STRUCTURED_MODEL.model,
    signal: args.signal,
    openAIResponses: { reasoningEffort: GTM_STRUCTURED_MODEL.reasoningEffort },
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
