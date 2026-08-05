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
