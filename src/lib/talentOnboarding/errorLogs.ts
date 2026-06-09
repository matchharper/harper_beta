import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { Json } from "@/types/database.types";

const PROFILE_SOURCE_ERROR_LOG_PREFIX = "career_profile_source_save_failed";

type LogMetadataValue = string | number | boolean | null;

function normalizeLogKey(value: string) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.:-]/g, "_")
    .slice(0, 120);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return String(error ?? "Unknown error");
}

function normalizeMetadataValue(value: unknown): LogMetadataValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") return value.trim().slice(0, 500);
  return JSON.stringify(value).slice(0, 500);
}

function normalizeMetadata(
  metadata: Record<string, unknown>
): Record<string, LogMetadataValue> {
  return Object.fromEntries(
    Object.entries(metadata)
      .map(([key, value]) => [key, normalizeMetadataValue(value)] as const)
      .filter((entry): entry is readonly [string, LogMetadataValue] => {
        return entry[1] !== undefined;
      })
  );
}

export function buildTalentProfileSourceErrorLogType(stage: string) {
  const normalizedStage = normalizeLogKey(stage) || "unknown";
  return `${PROFILE_SOURCE_ERROR_LOG_PREFIX}:${normalizedStage}`;
}

export async function insertTalentProfileSourceErrorLog(args: {
  admin: TalentAdminClient;
  error: unknown;
  metadata?: Record<string, unknown>;
  stage: string;
  userId?: string | null;
}) {
  const userId = String(args.userId ?? "").trim();
  if (!userId) return false;

  const errorMessage = getErrorMessage(args.error);
  const metaData = normalizeMetadata({
    ...(args.metadata ?? {}),
    error: errorMessage,
    stage: args.stage,
  });

  try {
    const { error } = await args.admin.from("logs").insert({
      type: buildTalentProfileSourceErrorLogType(args.stage),
      user_id: userId,
      meta_data: metaData as Json,
    });

    if (error) {
      console.error("[talent-profile-source-error-log] insert failed:", {
        error: error.message,
        originalError: errorMessage,
        stage: args.stage,
        userId,
      });
      return false;
    }

    return true;
  } catch (logError) {
    console.error("[talent-profile-source-error-log] insert failed:", {
      error: getErrorMessage(logError),
      originalError: errorMessage,
      stage: args.stage,
      userId,
    });
    return false;
  }
}
