import { formatToolError, throwIfToolControlError } from "@/lib/llm/toolError";

function feedbackReceipt(result: Record<string, unknown>) {
  if (typeof result.modelOutput === "string") return result.modelOutput;
  const candidates = Array.isArray(result.candidates) ? result.candidates : [];
  return [
    result.ok === true ? "Decision recorded." : "Decision not recorded.",
    result.reason ? `Reason: ${result.reason}` : null,
    typeof result.message === "string" ? result.message : null,
    ...candidates.map((item) => {
      const candidate = item as Record<string, unknown>;
      return `Candidate: ${candidate.companyName}; ${candidate.title}; roleId ${candidate.roleId}; opportunityId ${candidate.id}`;
    }),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function executeOpportunityFeedbackBatch(
  input: Record<string, unknown>,
  execute: (item: Record<string, unknown>) => Promise<Record<string, unknown>>,
  signal?: AbortSignal
) {
  // Resume persisted single-item calls with their original result shape.
  if (input.items === undefined) return execute(input);
  if (!Array.isArray(input.items) || !input.items.length)
    throw new Error("items must be a non-empty array.");
  const results: Record<string, unknown>[] = [];
  // Decisions can target the same opportunity or share internal follow-through.
  // Preserve their order while removing the model round-trip between decisions.
  for (const [index, item] of input.items.entries()) {
    signal?.throwIfAborted();
    try {
      if (!item || typeof item !== "object" || Array.isArray(item))
        throw new Error("Each decision must be an object.");
      const result = await execute(item);
      results.push({
        index,
        roleId: item.roleId,
        opportunityId: item.opportunityId,
        feedback: item.feedback,
        ...result,
        modelOutput: feedbackReceipt(result),
      });
    } catch (error) {
      signal?.throwIfAborted();
      throwIfToolControlError(error);
      results.push({
        index,
        ...(item && typeof item === "object" && !Array.isArray(item)
          ? {
              roleId: item.roleId,
              opportunityId: item.opportunityId,
              feedback: item.feedback,
            }
          : {}),
        ok: false,
        modelOutput: `Decision did not complete successfully: ${formatToolError(error instanceof Error ? error.message : error)}`,
      });
    }
  }
  return {
    ok: results.every((result) => result.ok === true),
    results,
    modelOutput: results
      .map((result) =>
        [
          `Decision ${Number(result.index) + 1}${result.roleId ? `; roleId ${result.roleId}` : ""}${result.opportunityId ? `; opportunityId ${result.opportunityId}` : ""}${result.feedback ? `; feedback ${result.feedback}` : ""}`,
          result.modelOutput,
        ].join("\n")
      )
      .join("\n\n"),
  };
}
