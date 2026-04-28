type OpenAICompatibleUsage = {
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  completion_tokens?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  prompt_tokens?: number | null;
  total_tokens?: number | null;
};

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function extractLlmTokenUsage(response: any) {
  const usage = (response?.usage ?? null) as OpenAICompatibleUsage | null;
  const cacheCreationInputTokens = toNullableNumber(
    usage?.cache_creation_input_tokens
  );
  const cacheReadInputTokens = toNullableNumber(usage?.cache_read_input_tokens);
  const inputTokens = toNullableNumber(
    usage?.prompt_tokens ?? usage?.input_tokens
  );
  const outputTokens = toNullableNumber(
    usage?.completion_tokens ?? usage?.output_tokens
  );
  const totalProcessedInputTokens = toNullableNumber(
    (cacheCreationInputTokens ?? 0) +
      (cacheReadInputTokens ?? 0) +
      (inputTokens ?? 0)
  );
  const totalTokens = toNullableNumber(
    usage?.total_tokens ??
      (totalProcessedInputTokens !== null && outputTokens !== null
        ? totalProcessedInputTokens + outputTokens
        : null)
  );

  return {
    cacheCreationInputTokens,
    cacheReadInputTokens,
    inputTokens,
    outputTokens,
    totalProcessedInputTokens,
    totalTokens,
  };
}

export function logLlmTokenUsage(args: {
  label?: string;
  model: string;
  response: any;
}) {
  if (!args.label) return;

  const usage = extractLlmTokenUsage(args.response);
  console.info("[llm-usage]", {
    label: args.label,
    model: args.model,
    cacheCreationInputTokens: usage.cacheCreationInputTokens,
    cacheHit: (usage.cacheReadInputTokens ?? 0) > 0,
    cacheReadInputTokens: usage.cacheReadInputTokens,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalProcessedInputTokens: usage.totalProcessedInputTokens,
    totalTokens: usage.totalTokens,
  });
}
