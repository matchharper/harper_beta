const MAX_DEBUG_DEPTH = 3;
const MAX_DEBUG_KEYS = 20;
const MAX_DEBUG_ARRAY_ITEMS = 10;
const MAX_DEBUG_STRING_CHARS = 240;
const MAX_SLACK_TOOL_TRACE_CHARS = 12_000;
const SENSITIVE_DEBUG_KEY =
  /token|secret|password|authorization|cookie|cipher|api.?key|message|content|body|email|context|subject/i;

export type OrgAgentToolDebugEvent = {
  callId: string;
  durationMs: number;
  input: unknown;
  loop: number;
  name: string;
  resultShape?: Record<string, unknown>;
  resultStatus?: "error" | "success" | "unchanged";
  status: "completed" | "failed" | "skipped";
  summary?: string;
};

function clipDebugString(value: string, maxChars = MAX_DEBUG_STRING_CHARS) {
  const characters = Array.from(value);
  if (characters.length <= maxChars) return value;
  return `${characters.slice(0, maxChars).join("")}…`;
}

function sanitizeDebugValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return clipDebugString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (depth >= MAX_DEBUG_DEPTH) {
    if (Array.isArray(value)) return `[array:${value.length}]`;
    if (typeof value === "object") return "[object]";
    return clipDebugString(String(value));
  }
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_DEBUG_ARRAY_ITEMS)
      .map((item) => sanitizeDebugValue(item, depth + 1));
    if (value.length > MAX_DEBUG_ARRAY_ITEMS) {
      items.push(`[+${value.length - MAX_DEBUG_ARRAY_ITEMS} more]`);
    }
    return items;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const result: Record<string, unknown> = {};
    for (const [key, item] of entries.slice(0, MAX_DEBUG_KEYS)) {
      result[key] = SENSITIVE_DEBUG_KEY.test(key)
        ? "[redacted]"
        : sanitizeDebugValue(item, depth + 1);
    }
    if (entries.length > MAX_DEBUG_KEYS) {
      result.__omittedKeys = entries.length - MAX_DEBUG_KEYS;
    }
    return result;
  }
  return clipDebugString(String(value));
}

export function summarizeOrgAgentToolInput(rawArguments: string): unknown {
  try {
    const parsed = rawArguments ? JSON.parse(rawArguments) : {};
    return sanitizeDebugValue(parsed);
  } catch {
    return { invalidJson: true, length: rawArguments.length };
  }
}

export function summarizeOrgAgentToolResult(
  result: Record<string, unknown>
): Record<string, unknown> {
  const entries = Object.entries(result);
  const collectionSizes = Object.fromEntries(
    entries
      .filter(([, value]) => Array.isArray(value))
      .slice(0, MAX_DEBUG_KEYS)
      .map(([key, value]) => [key, (value as unknown[]).length])
  );
  return {
    keys: entries.slice(0, MAX_DEBUG_KEYS).map(([key]) => key),
    ...(Object.keys(collectionSizes).length > 0 && { collectionSizes }),
    ...(entries.length > MAX_DEBUG_KEYS && {
      omittedKeyCount: entries.length - MAX_DEBUG_KEYS,
    }),
  };
}

export function clipOrgAgentToolDebugSummary(value: unknown) {
  return clipDebugString(String(value ?? ""), 300);
}

export function shouldShowLocalSlackToolTrace(args: {
  nodeEnv?: string;
  verbose: boolean;
}) {
  return args.verbose && args.nodeEnv === "development";
}

function escapeSlackMrkdwn(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function inlineSlackCode(value: unknown) {
  return `\`${escapeSlackMrkdwn(value).replaceAll("`", "'")}\``;
}

export function formatOrgAgentSlackToolTrace(events: OrgAgentToolDebugEvent[]) {
  if (events.length === 0) return "";
  const lines = ["---", "*Local tool trace*"];
  for (const [index, event] of events.entries()) {
    lines.push(
      `${index + 1}. ${inlineSlackCode(event.name)} · ${escapeSlackMrkdwn(
        event.status
      )} · ${Math.max(0, event.durationMs).toFixed(1)}ms`
    );
    lines.push(
      `   input: ${inlineSlackCode(
        clipDebugString(JSON.stringify(event.input ?? {}), 1_000)
      )}`
    );
    if (event.summary) {
      lines.push(`   result: ${escapeSlackMrkdwn(event.summary)}`);
    } else if (event.resultStatus) {
      lines.push(`   result: ${escapeSlackMrkdwn(event.resultStatus)}`);
    }
  }
  return clipDebugString(lines.join("\n"), MAX_SLACK_TOOL_TRACE_CHARS);
}
