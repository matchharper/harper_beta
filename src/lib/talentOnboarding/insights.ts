import { logger } from "@/utils/logger";

export type ExtractedInsightValue = {
  value: string;
  action: "new" | "update";
};

/** Normalize raw extracted_insights: supports both legacy string and {value, action} formats */
export function normalizeExtractedInsights(
  raw: Record<string, unknown> | null
): Record<string, ExtractedInsightValue> | null {
  if (!raw) return null;
  const result: Record<string, ExtractedInsightValue> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (val == null) continue;
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) continue;
      result[key] = { value: trimmed, action: "new" };
    } else if (typeof val === "object" && val !== null) {
      const obj = val as Record<string, unknown>;
      const value = typeof obj.value === "string" ? obj.value.trim() : "";
      if (!value) continue;
      const action = obj.action === "update" ? "update" : "new";
      if (obj.action && obj.action !== "new" && obj.action !== "update") {
        logger.log(
          "[TalentInsights] Unrecognized insight action, defaulting to new",
          { key, action: obj.action }
        );
      }
      result[key] = { value, action };
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}
