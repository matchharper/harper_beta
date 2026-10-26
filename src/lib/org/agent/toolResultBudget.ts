import { appendToolDiagnosticText } from "@/lib/llm/toolError";
/** Legacy single-result debugger budget; production uses the soft rolling target. */
export const ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS = 80_000;

/** A working-context target, never a call limit or a reason to discard a result. */
export const ORG_AGENT_TOOL_CONTEXT_TARGET_CHARS = ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS;

type ToolContextMessage = {
  role: string;
  content: unknown;
  name?: string;
  tool_call_id?: string;
};

// Only side-effect-free reads with an understood company-safe presentation may
// be shortened. New tools stay fully visible until their contract is reviewed.
const COMPACTABLE_READS = new Set(["get_talents", "read_talent", "web_search", "open_url", "get_more_data"]);

export function canCompactOrgAgentRead(name: string, input: Record<string, unknown>) {
  if (!COMPACTABLE_READS.has(name)) return false;
  if (name !== "get_more_data") return true;
  // Matching evidence is reconstructible. Editable memory/company documents
  // require the exact read, even when mixed into one request with history.
  return Array.isArray(input.kinds) && input.kinds.length > 0
    && input.kinds.every(kind => kind === "matching_runs")
    && (!Array.isArray(input.fullTextKeys) || input.fullTextKeys.length === 0);
}
const OMITTABLE_TABLE_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  matches: ["headline", "fit", "profile_matches"],
  positions: ["fit", "fit_reasons", "tradeoffs"],
  recommendation_reasons: ["recommendation_reason"],
  experience: ["description"],
  education: ["description"],
  extras: ["description"],
  search_results: ["highlights"],
};

/**
 * Operate only on the already authorized formatter output, never raw DB rows.
 * This is a presentation contract: retain every non-prose column, including
 * all IDs, ratings, scope, state, pagination and timestamps without slicing.
 * Unknown sections, JSON, contact history, previews and failures stay exact.
 */
function abbreviateReadPresentation(content: string) {
  return content.replace(/<([a-z_]+)>\n([^<>]*)\n<\/\1>/g, (block: string, section: string, body: string) => {
    if (section === "page_markdown") return `<${section}>\n[Historical page body omitted; open its exact URL again for detail.]\n</${section}>`;
    if (section === "evaluation_explanations") return `<${section}>\n[Historical explanation bodies omitted; candidate/evaluation IDs, Brief versions, run references, timestamps and scores remain in the index. Read the exact evaluation again for its full explanation.]\n</${section}>`;
    if (section === "profile_summary") {
      // The formatter owns this field/value table. Keep location and every
      // unknown field; only the reconstructible biography body is shortened.
      const [header, ...rows] = body.split("\n");
      if (header !== "field\tvalue" || rows.some(row => row.split("\t").length !== 2)) return block;
      return `<${section}>\n${[header, ...rows.map(row => row.startsWith("bio\t")
        ? "bio\t[Historical biography body omitted; read this talent with includeProfile=true for detail.]"
        : row)].join("\n")}\n</${section}>`;
    }
    const omitted = OMITTABLE_TABLE_COLUMNS[section];
    if (!omitted) return block;
    const [header, ...rows] = body.split("\n");
    const columns = header.split("\t");
    const keep = columns.map((column, index) => omitted.includes(column) ? -1 : index).filter(index => index >= 0);
    if (keep.length === columns.length || !keep.length || rows.some(row => row.split("\t").length !== columns.length)) return block;
    return `<${section}>\n${[columns, ...rows.map(row => row.split("\t"))].map(row => keep.map(index => row[index]).join("\t")).join("\n")}\n</${section}>`;
  });
}

/**
 * Keep the full transcript immutable and make only the next model-input view
 * smaller. Protocol call/result pairs and newest evidence remain in place.
 * Pinned results are protected by the executor (actions, diagnostics and exact
 * full-document observations); exceeding the target is safer than losing them.
 */
export function buildOrgAgentRollingToolContext<T extends ToolContextMessage>(args: {
  messages: readonly T[];
  compactableResultIndexes: ReadonlySet<number>;
  targetChars?: number;
}): { messages: T[]; compactedCallIds: string[]; toolResultChars: number } {
  const messages = args.messages.map(message => ({ ...message }));
  let toolResultChars = messages.reduce((total, message) => total + (message.role === "tool" && typeof message.content === "string" ? message.content.length : 0), 0);
  const target = args.targetChars ?? ORG_AGENT_TOOL_CONTEXT_TARGET_CHARS;
  const compactedCallIds: string[] = [];
  const latestResultIndex = messages.findLastIndex(message => message.role === "tool");
  const latestAssistantIndex = messages.findLastIndex(message => message.role === "assistant");
  // The next completion has not seen any result from its latest tool-call
  // round yet. Preserve the whole parallel batch, even above the soft target.
  const newestRoundStart = latestAssistantIndex >= 0 ? latestAssistantIndex + 1 : latestResultIndex;
  const newestIdentical = new Map<string, number>();
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === "tool" && typeof message.content === "string" && args.compactableResultIndexes.has(index) && COMPACTABLE_READS.has(message.name ?? "")) {
      const key = `${message.name}\u0000${message.content}`;
      if (!newestIdentical.has(key)) newestIdentical.set(key, index);
    }
  }
  for (let index = 0; index < messages.length && toolResultChars > target; index++) {
    const message = messages[index];
    if (index >= newestRoundStart || message.role !== "tool" || typeof message.content !== "string" || !args.compactableResultIndexes.has(index) || !COMPACTABLE_READS.has(message.name ?? "")) continue;
    const newestIndex = newestIdentical.get(`${message.name}\u0000${message.content}`);
    const duplicateOf = newestIndex !== undefined && newestIndex > index ? messages[newestIndex].tool_call_id : null;
    const shortened = duplicateOf
      ? `historical_read_same_as=${duplicateOf}\nThe authorized result was byte-for-byte identical to that later read. Use its retained evidence; this is not a new action.`
      : abbreviateReadPresentation(message.content);
    if (shortened === message.content) continue;
    const content = `context_detail_complete=false\nHistorical read ${message.tool_call_id ?? ""} (${message.name}): descriptive detail was compacted for working context. Original call arguments remain above; re-read needed detail before relying on it. This does not change any execution outcome.\n${shortened}`;
    if (content.length >= message.content.length) continue;
    toolResultChars -= message.content.length - content.length;
    messages[index] = { ...message, content };
    compactedCallIds.push(message.tool_call_id ?? "");
  }
  return { messages, compactedCallIds, toolResultChars };
}

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
