import "server-only";

import { createChatCompletionWithFallback } from "@/lib/llm/llm";
import type { OpenAIResponsesReasoningEffort } from "@/lib/llm/responsesChatAdapter";
import {
  estimateLlmUsageCost,
  extractLlmTokenUsage,
} from "@/lib/llm/usageLogging";

export const ROLE_START_DRAFT_MODEL = "gpt-6.1-sol";
export const ROLE_START_VERDICT_MODEL = "gpt-6.1-sol";
/** Interactive steps (next question, Brief edit by request). */
export const ROLE_START_FAST_MODEL = "gpt-6-luna";

export type RoleStartLlmUsage = {
  label: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usd: number | null;
  ms: number;
  at: string;
  /** Set when a malformed first attempt was retried; tokens include both. */
  attempts?: number;
};

/**
 * One strict-JSON call. Usage is returned so each Role start can report its
 * cost. A truncated or malformed answer is retried once before failing.
 */
export async function callRoleStartJson<T>(args: {
  label: string;
  model?: string;
  reasoningEffort?: OpenAIResponsesReasoningEffort;
  schema: Record<string, unknown>;
  system: string;
  user: string;
  signal?: AbortSignal;
  maxOutputTokens?: number;
}): Promise<{ data: T; usage: RoleStartLlmUsage }> {
  const started = Date.now();
  const model = args.model ?? ROLE_START_DRAFT_MODEL;
  let lastError: unknown = null;
  // A discarded attempt is still paid for; its tokens join the returned usage.
  const spent = { inputTokens: 0, outputTokens: 0, usd: 0, hasCost: false };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await createChatCompletionWithFallback({
      buildRequest: () => ({
        max_completion_tokens: args.maxOutputTokens ?? 16_000,
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
      }),
      debugLabel: `org/role-start:${args.label}`,
      model,
      openAIResponses: { reasoningEffort: args.reasoningEffort ?? "low" },
      signal: args.signal,
      structuredOutput: { name: args.label.replace(/\W+/g, "_"), schema: args.schema },
    });
    const content = completion.response?.choices?.[0]?.message?.content;
    const tokens = extractLlmTokenUsage(completion.response);
    const cost = estimateLlmUsageCost(completion.model, tokens);
    spent.inputTokens += tokens.inputTokens ?? 0;
    spent.outputTokens += tokens.outputTokens ?? 0;
    if (cost?.estimatedCostUsd !== undefined && cost?.estimatedCostUsd !== null) {
      spent.usd += cost.estimatedCostUsd;
      spent.hasCost = true;
    }
    try {
      if (typeof content !== "string" || !content.trim()) throw new Error("empty structured output");
      return {
        data: JSON.parse(content) as T,
        usage: {
          label: args.label,
          model: completion.model,
          inputTokens: spent.inputTokens,
          outputTokens: spent.outputTokens,
          usd: spent.hasCost ? spent.usd : null,
          ...(attempt ? { attempts: attempt + 1 } : {}),
          ms: Date.now() - started,
          at: new Date().toISOString(),
        },
      };
    } catch (error) {
      lastError = error;
      // Server log only: why the attempt failed and how the output ended.
      console.warn(`[role-start] ${args.label} output unusable (attempt ${attempt + 1})`, {
        outputTokens: tokens.outputTokens,
        finishReason: completion.response?.choices?.[0]?.finish_reason ?? null,
        length: typeof content === "string" ? content.length : 0,
        tail: typeof content === "string" ? content.slice(-600) : null,
      });
    }
  }
  throw new Error(`role start ${args.label}: ${lastError instanceof Error ? lastError.message : "invalid output"}`);
}

export async function embedTexts(
  texts: string[],
  options: { model?: string; dimensions?: number } = {}
) {
  if (!texts.length) return { vectors: [] as number[][], tokens: 0 };
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for role start");
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    body: JSON.stringify({
      input: texts,
      model: options.model ?? "text-embedding-3-small",
      ...(options.dimensions ? { dimensions: options.dimensions } : {}),
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`embedding request failed: ${response.status}`);
  }
  const body = (await response.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
    usage?: { total_tokens?: number };
  };
  const vectors = [...body.data]
    .sort((left, right) => left.index - right.index)
    .map((row) => row.embedding);
  if (vectors.length !== texts.length) {
    throw new Error("embedding coverage incomplete");
  }
  return { vectors, tokens: body.usage?.total_tokens ?? 0 };
}

export function vectorLiteral(vector: number[]) {
  return `[${vector.map((value) => Number(value).toFixed(7)).join(",")}]`;
}
