import { logger } from "@/utils/logger";
import {
  isTalentInsightKeyAlias,
  normalizeTalentInsightKey,
} from "@/lib/talentOnboarding/stateStore";

export type ExtractedInsightValue = {
  value: string;
  action: "new" | "update";
};

export type GeneratedTalentInsightValidationReason =
  | "empty_value"
  | "invalid_english_snake_case_key"
  | "profile_row_fact_key";

export type NormalizedGeneratedTalentInsightEntry =
  | { key: string; ok: true; value: string }
  | {
      key?: string;
      ok: false;
      reason: GeneratedTalentInsightValidationReason;
    };

const GENERATED_TALENT_INSIGHT_KEY_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

const PROFILE_ROW_FACT_INSIGHT_KEYS = new Set([
  "career_history",
  "education_history",
  "latest_experience",
  "latest_work_experience",
  "main_experience",
  "primary_experience",
  "profile_education",
  "profile_experience",
  "recent_experience",
  "recent_work_experience",
  "representative_achievement",
  "representative_career",
  "representative_education",
  "representative_experience",
  "representative_project",
  "work_history",
]);

const PROFILE_ROW_FACT_INSIGHT_KEY_PATTERN =
  /^(?:latest|main|primary|profile|recent|representative)_(?:achievement|career|education|experience|project|work)$/;

export function isProfileRowFactInsightKey(key: string) {
  return (
    PROFILE_ROW_FACT_INSIGHT_KEYS.has(key) ||
    PROFILE_ROW_FACT_INSIGHT_KEY_PATTERN.test(key)
  );
}

export function normalizeGeneratedTalentInsightEntry(args: {
  rawKey: unknown;
  rawValue: unknown;
  rejectProfileRowFactKeys?: boolean;
}): NormalizedGeneratedTalentInsightEntry {
  const rawKey = typeof args.rawKey === "string" ? args.rawKey.trim() : "";
  if (!rawKey || !GENERATED_TALENT_INSIGHT_KEY_PATTERN.test(rawKey)) {
    return {
      key: rawKey || undefined,
      ok: false,
      reason: "invalid_english_snake_case_key",
    };
  }

  const key = normalizeTalentInsightKey(rawKey);
  if (!key || (key !== rawKey && !isTalentInsightKeyAlias(rawKey))) {
    return {
      key: key ?? rawKey,
      ok: false,
      reason: "invalid_english_snake_case_key",
    };
  }

  if (args.rejectProfileRowFactKeys && isProfileRowFactInsightKey(key)) {
    return { key, ok: false, reason: "profile_row_fact_key" };
  }

  const value = typeof args.rawValue === "string" ? args.rawValue.trim() : "";
  if (!value) return { key, ok: false, reason: "empty_value" };

  return { key, ok: true, value: value.slice(0, 8000) };
}

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
