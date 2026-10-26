import {
  formatToolError,
  serializeToolResultForModel,
} from "@/lib/llm/toolError";
function safeSerialize(value: unknown, maxLength = 3000) {
  let serialized: string;
  try {
    serialized = JSON.stringify(value, null, 2);
  } catch {
    serialized = String(value);
  }

  return serialized.length > maxLength
    ? `${serialized.slice(0, maxLength)}\n...<truncated>`
    : serialized;
}

function sanitizeTalentToolResultForLog(name: string, result: unknown) {
  if (
    [
      "generate_resume",
      "write_document",
      "update_talent_profile",
      "read_document",
      "ready_for_role",
    ].includes(name)
  )
    return { redacted: true };
  if (name !== "search_connected_gmail") return result;

  const record =
    result && typeof result === "object" && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : null;
  const emails = Array.isArray(record?.emails) ? record.emails : [];

  return {
    emailCount: emails.length,
    status: typeof record?.status === "string" ? record.status : "unknown",
    truncated: record?.truncated === true,
  };
}

export function logTalentToolCall(args: {
  callId?: string | null;
  input?: unknown;
  loop?: number;
  name: string;
  source: string;
}) {
  console.warn(
    [
      "",
      "",
      "============================================================",
      "!!! TALENT TOOL CALL !!!",
      `source: ${args.source}`,
      `tool: ${args.name}`,
      args.callId ? `callId: ${args.callId}` : null,
      typeof args.loop === "number" ? `loop: ${args.loop}` : null,
      "input:",
      safeSerialize(
        [
          "generate_resume",
          "write_document",
          "update_talent_profile",
          "ready_for_role",
        ].includes(args.name)
          ? { redacted: true }
          : (args.input ?? {})
      ),
      "============================================================",
      "",
    ]
      .filter(Boolean)
      .join("\n")
  );
}

export function logTalentToolResult(args: {
  callId?: string | null;
  durationMs: number;
  name: string;
  result?: unknown;
  diagnostics?: readonly unknown[];
  source: string;
}) {
  console.warn(
    [
      "",
      "============================================================",
      "TALENT TOOL RESULT",
      `source: ${args.source}`,
      `tool: ${args.name}`,
      args.callId ? `callId: ${args.callId}` : null,
      `durationMs: ${Math.round(args.durationMs)}`,
      ...(args.diagnostics ?? []).map(
        (value) => `diagnostic: ${formatToolError(value)}`
      ),
      "result:",
      serializeToolResultForModel(
        sanitizeTalentToolResultForLog(args.name, args.result ?? {}),
        (value) => safeSerialize(value, 1500)
      ),
      "============================================================",
      "",
    ]
      .filter(Boolean)
      .join("\n")
  );
}

export function logTalentToolError(args: {
  callId?: string | null;
  durationMs: number;
  error: unknown;
  name: string;
  source: string;
}) {
  console.error(
    [
      "",
      "============================================================",
      "!!! TALENT TOOL ERROR !!!",
      `source: ${args.source}`,
      `tool: ${args.name}`,
      args.callId ? `callId: ${args.callId}` : null,
      `durationMs: ${Math.round(args.durationMs)}`,
      "error:",
      formatToolError(args.error),
      "============================================================",
      "",
    ]
      .filter(Boolean)
      .join("\n")
  );
}
