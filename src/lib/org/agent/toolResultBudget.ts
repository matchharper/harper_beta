import { appendToolDiagnosticText } from "@/lib/llm/toolError";
/** Shared by the production tool loop and exact-result debugging surfaces. */
export const ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS = 80_000;

export const ORG_AGENT_TOOL_RESULT_BUDGET_MARKER = [
  "status=tool_budget_exhausted",
  "complete=false",
  "message=The tool result was not delivered completely; read the needed field again before treating it as exact.",
].join("\n");

export function fitOrgAgentToolResultToBudget(args: {
  remainingChars: number;
  serializedResult: string;
}) {
  const serializationIncomplete = args.serializedResult.startsWith(
    "serialization_complete=false"
  );
  const budgetExceeded =
    args.serializedResult.length > Math.max(0, args.remainingChars);
  const complete = !serializationIncomplete && !budgetExceeded;
  return {
    complete,
    content: complete
      ? args.serializedResult
      : ORG_AGENT_TOOL_RESULT_BUDGET_MARKER,
  };
}

/** Fit supplements after all base results, preserving the existing base budget. */
export function fitOrgAgentDiagnosticSupplements(deliveries: readonly { content: string; diagnosticText?: string }[], remainingChars: number) {
  const result = deliveries.map(value => value.content);
  let remaining = Math.max(0, remainingChars);
  for (let index = deliveries.length - 1; index >= 0; index--) {
    const item = deliveries[index]!;
    if (!item.diagnosticText) continue;
    let additional = item.diagnosticText;
    let combined = appendToolDiagnosticText(item.content, additional);
    if (combined.length - item.content.length > remaining) {
      const marker = "[Additional diagnostic omitted by tool-result budget]";
      const framing = appendToolDiagnosticText(item.content, marker).length - item.content.length;
      if (framing > remaining) continue;
      additional = item.diagnosticText.slice(0, Math.max(0, remaining - framing)) + marker;
      combined = appendToolDiagnosticText(item.content, additional);
      // JSON escaping can increase size; retain only the omission marker then.
      if (combined.length - item.content.length > remaining) combined = appendToolDiagnosticText(item.content, marker);
    }
    remaining -= combined.length - item.content.length;
    result[index] = combined;
  }
  return result;
}
