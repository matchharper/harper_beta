import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

export const TALENT_TOOL_USAGE_LOG_PREFIX = "career_tool_call";
export const TALENT_TOOL_FAILURE_LOG_PREFIX = "career_tool_call_failed";

function normalizeToolNameForLog(name: string) {
  const normalized = String(name ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.:-]/g, "_")
    .slice(0, 120);

  return normalized || "unknown_tool";
}

export function buildTalentToolUsageLogType(name: string) {
  return `${TALENT_TOOL_USAGE_LOG_PREFIX}:${normalizeToolNameForLog(name)}`;
}

export function buildTalentToolFailureLogType(name: string) {
  return `${TALENT_TOOL_FAILURE_LOG_PREFIX}:${normalizeToolNameForLog(name)}`;
}

export async function insertTalentToolUsageLog(args: {
  admin: TalentAdminClient;
  name: string;
  userId?: string | null;
}) {
  const userId = String(args.userId ?? "").trim();
  if (!userId) return false;

  try {
    const { error } = await args.admin.from("logs").insert({
      type: buildTalentToolUsageLogType(args.name),
      user_id: userId,
    });

    if (error) {
      console.error("[talent-tool-usage-log] insert failed:", error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "[talent-tool-usage-log] insert failed:",
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

export async function insertTalentToolFailureLog(args: {
  admin: TalentAdminClient;
  name: string;
  userId?: string | null;
  /** Kept with the record: runtime logs are retained for only a day. */
  error?: unknown;
}) {
  const userId = String(args.userId ?? "").trim();
  if (!userId) return false;
  const errorText = args.error === undefined ? ""
    : (args.error instanceof Error ? args.error.message : String(args.error)).slice(0, 2000);

  try {
    const { error } = await args.admin.from("logs").insert({
      type: buildTalentToolFailureLogType(args.name),
      user_id: userId,
      ...(errorText ? { meta_data: { error: errorText } } : {}),
    });

    if (error) {
      console.error("[talent-tool-failure-log] insert failed:", error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "[talent-tool-failure-log] insert failed:",
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}
