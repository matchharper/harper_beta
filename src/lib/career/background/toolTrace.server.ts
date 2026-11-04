import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { withToolTrace, type ToolTraceEvent } from "@/lib/llm/toolTrace";
import { formatToolError } from "@/lib/llm/toolError";
import { CAREER_BACKGROUND_TOOL_LOG } from "./toolTrace";

function render(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return (
      JSON.stringify(
        value,
        (_key, item) =>
          item instanceof Error
            ? formatToolError(item)
            : typeof item === "bigint"
              ? String(item)
              : item,
        2
      ) ?? "null"
    );
  } catch {
    return formatToolError(value);
  }
}

export function withCareerBackgroundToolTrace<T>(
  args: { admin: TalentAdminClient; userId: string; runId: string },
  work: () => T
): T {
  return withToolTrace(async (event: ToolTraceEvent) => {
    const { input, result, error, diagnostics, ...facts } = event;
    const { error: writeError } = await args.admin.from("logs").insert({
      user_id: args.userId,
      type: CAREER_BACKGROUND_TOOL_LOG,
      meta_data: {
        ...facts,
        runId: args.runId,
        ...(event.phase === "started"
          ? { inputText: render(input ?? {}) }
          : {}),
        ...(event.phase === "returned" ? { resultText: render(result) } : {}),
        ...(event.phase === "threw"
          ? { errorText: formatToolError(error) }
          : {}),
        ...(diagnostics?.length
          ? { diagnosticsText: render(diagnostics) }
          : {}),
      },
    });
    if (writeError) throw writeError;
  }, work);
}
