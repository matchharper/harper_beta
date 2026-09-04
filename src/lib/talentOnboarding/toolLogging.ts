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
      safeSerialize(args.input ?? {}),
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
      "result:",
      safeSerialize(
        sanitizeTalentToolResultForLog(args.name, args.result ?? {}),
        1500
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
      args.error instanceof Error
        ? args.error.stack || args.error.message
        : String(args.error),
      "============================================================",
      "",
    ]
      .filter(Boolean)
      .join("\n")
  );
}
