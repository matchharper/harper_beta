import { formatToolError, redactToolDiagnosticText } from "@/lib/llm/toolError";

export type CareerToolFailure = {
  name: string;
  callId: string;
  input: Record<string, unknown>;
  error: unknown;
  diagnostics?: readonly unknown[];
};

function diagnosticFacts(error: unknown): string[] {
  // Reuse credential redaction and safe property access, then select only facts
  // that help the model understand this failed call. Logs keep the full diagnostic.
  const safe = formatToolError(error);
  let value: unknown = safe;
  try { value = JSON.parse(safe); } catch { /* A thrown string is already readable. */ }
  const facts: string[] = [];
  const visit = (item: unknown) => {
    if (typeof item === "string") {
      try {
        const nested = JSON.parse(item);
        if (nested && typeof nested === "object") { visit(nested); return; }
      } catch { /* Plain provider message. */ }
      if (item && item !== "[Accessor not evaluated]") facts.push(item);
      return;
    }
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) { item.forEach(visit); return; }
    const record = item as Record<string, unknown>;
    if (Array.isArray(record.issues)) {
      for (const issue of record.issues) {
        if (!issue || typeof issue !== "object") continue;
        const path = Array.isArray(issue.path) ? issue.path.join(".") : "input";
        const reason = issue.code === "invalid_string" && issue.validation === "uuid"
          ? "must be a valid UUID"
          : typeof issue.message === "string" ? issue.message : "invalid value";
        facts.push(`Input field ${path || "input"}: ${reason}.`);
      }
    } else if (typeof record.message === "string") visit(record.message);
    for (const key of ["code", "status", "statusCode"]) {
      if (typeof record[key] === "string" || typeof record[key] === "number")
        facts.push(`${key}: ${record[key]}`);
    }
    for (const key of ["cause", "error", "errors", "response"]) {
      // Zod's errors repeat issues, so the field-specific explanation above wins.
      if (key === "errors" && Array.isArray(record.issues)) continue;
      if (record[key] !== undefined) visit(record[key]);
    }
  };
  visit(value);
  return [...new Set(facts)];
}

export function formatCareerToolFailure(args: CareerToolFailure): string {
  const facts = diagnosticFacts(args.error);
  const identifiers = Object.entries(args.input)
    .filter(([key, value]) => (key === "id" || key.endsWith("_id") || key.endsWith("Id"))
      && (typeof value === "string" || typeof value === "number"))
    .map(([key, value]) => `Provided ${key}: ${redactToolDiagnosticText(String(value))}`);
  const additional = [...new Set((args.diagnostics ?? []).flatMap(diagnosticFacts))]
    .filter(fact => !facts.includes(fact));
  return [
    `Tool ${args.name} failed. Call ID: ${args.callId}.`,
    ...(facts.length ? facts : ["The tool did not provide a readable failure reason."]),
    ...identifiers,
    ...additional.map(fact => `Additional failure detail: ${fact}`),
  ].join("\n");
}
