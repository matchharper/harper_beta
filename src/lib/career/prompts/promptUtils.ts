import { normalizeCareerPromptLocale } from "@/lib/career/promptLocale";
import type { CareerPromptBlock } from "@/lib/career/prompts/types";
import { safeSlice } from "@/lib/textSanitization";

export const CAREER_PROFILE_PROMPT_TIME_ZONE = "Asia/Seoul";

export type CareerPromptDateTimeOptions = {
  now?: Date;
  preferredLocale?: string | null;
  timeZone?: string | null;
};

const PROMPT_DAY_MS = 24 * 60 * 60 * 1000;

type CareerLocalizedPromptValue<T> = {
  ko: T;
  en: T;
};

export function getCareerLocalizedPromptValue<T>(
  value: CareerLocalizedPromptValue<T>,
  locale?: string | null
): T {
  return value[normalizeCareerPromptLocale(locale) === "en" ? "en" : "ko"];
}

export function interpolateCareerPromptText(
  template: string,
  vars: Record<string, string | number>
) {
  return template.replace(/{([a-zA-Z0-9_]+)}/g, (match, key) =>
    vars[key] !== undefined ? String(vars[key]) : match
  );
}

export function getCareerProfilePromptCurrentDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: CAREER_PROFILE_PROMPT_TIME_ZONE,
    year: "numeric",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return now.toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
}

export function renderCareerPromptBlocks(blocks: CareerPromptBlock[]) {
  return blocks
    .map((block) => sanitizeCareerPromptDateValues(block.text.trim()))
    .filter((text) => text.length > 0)
    .join("\n\n");
}

export function normalizeToolNames(toolNames?: readonly string[] | string) {
  if (Array.isArray(toolNames)) {
    return toolNames
      .map((name) => String(name ?? "").trim())
      .filter((name) => name.length > 0);
  }

  if (typeof toolNames === "string") {
    return toolNames
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
  }

  return [];
}

export function cleanCareerPromptInlineValue(value: unknown, maxLength = 180) {
  return typeof value === "string"
    ? safeSlice(value.replace(/\s+/g, " ").trim(), maxLength)
    : "";
}

export function parseCareerPromptTimestampMs(value: string | null | undefined) {
  if (typeof value !== "string") return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

const rawIsoTimestampPattern =
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?\b/g;

function normalizeTimestampForDateParse(value: string) {
  const trimmed = value.trim();
  const withMilliseconds = trimmed.replace(
    /(\.\d{3})\d+(?=(?:Z|[+-]\d{2}:?\d{2})?$)/,
    "$1"
  );
  const withColonOffset = withMilliseconds.replace(
    /([+-]\d{2})(\d{2})$/,
    "$1:$2"
  );
  if (
    withColonOffset.includes("T") &&
    !/(Z|[+-]\d{2}:?\d{2})$/.test(withColonOffset)
  ) {
    return `${withColonOffset}Z`;
  }
  return withColonOffset;
}

export function normalizeCareerPromptTimeZone(value: unknown) {
  const candidate =
    typeof value === "string" ? safeSlice(value.trim(), 100) : "";
  if (!candidate) return CAREER_PROFILE_PROMPT_TIME_ZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return CAREER_PROFILE_PROMPT_TIME_ZONE;
  }
}

function resolveCareerPromptDateTimeLocale(
  options?: CareerPromptDateTimeOptions
) {
  return options
    ? normalizeCareerPromptLocale(options.preferredLocale)
    : "ko";
}

function formatCareerPromptAbsoluteDateTime(
  date: Date,
  options?: CareerPromptDateTimeOptions
) {
  if (!Number.isFinite(date.getTime())) return "";
  const locale = resolveCareerPromptDateTimeLocale(options);
  const timeZone = normalizeCareerPromptTimeZone(options?.timeZone);
  const parts = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    timeZone,
    month: locale === "en" ? "short" : "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const month = partValue("month");
  const day = partValue("day");
  const hour = partValue("hour");
  const minute = partValue("minute");
  if (!month || !day || !hour || !minute) return "";

  return locale === "en"
    ? `${month} ${Number(day)}, ${hour}:${minute}`
    : `${Number(month)}월 ${Number(day)}일 ${hour}:${minute}`;
}

function getCareerPromptLocalDateOrdinal(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const partNumber = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = partNumber("year");
  const month = partNumber("month");
  const day = partNumber("day");
  if (!year || !month || !day) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / PROMPT_DAY_MS);
}

export function formatCareerPromptCompactDateTime(
  value: unknown,
  options?: CareerPromptDateTimeOptions
) {
  if (value === null || value === undefined || value === "") return "";
  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "string"
        ? safeSlice(value.replace(/\s+/g, " ").trim(), 160)
        : safeSlice(
            String(value ?? "")
              .replace(/\s+/g, " ")
              .trim(),
            160
          );
  if (!text) return "";
  const existingKstHourMatch = text.match(
    /^\d{4}-(\d{2})-(\d{2}) (\d{1,2})시(?:\s*KST)?$/
  );
  if (existingKstHourMatch) {
    const date = new Date(
      `${text.slice(0, 10)}T${String(Number(existingKstHourMatch[3])).padStart(
        2,
        "0"
      )}:00:00+09:00`
    );
    return formatCareerPromptAbsoluteDateTime(date, options);
  }
  const dateOnlyMatch = text.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const locale = resolveCareerPromptDateTimeLocale(options);
    const date = new Date(`${text}T12:00:00.000Z`);
    return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
      timeZone: "UTC",
      month: locale === "en" ? "short" : "numeric",
      day: "numeric",
    }).format(date);
  }

  const date = new Date(normalizeTimestampForDateParse(text));
  if (Number.isNaN(date.getTime())) {
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
  }

  return formatCareerPromptAbsoluteDateTime(date, options) || text.slice(0, 10);
}

export function formatCareerPromptMessageTimeLabel(
  value: string | null | undefined,
  options?: CareerPromptDateTimeOptions
) {
  if (!value) return "";
  const createdAt = new Date(normalizeTimestampForDateParse(value));
  if (Number.isNaN(createdAt.getTime())) return "";

  const now = options?.now ?? new Date();
  const elapsedMs = now.getTime() - createdAt.getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 60 * 60 * 1000) return "";

  const locale = resolveCareerPromptDateTimeLocale(options);
  const timeZone = normalizeCareerPromptTimeZone(options?.timeZone);
  const currentDateOrdinal = getCareerPromptLocalDateOrdinal(now, timeZone);
  const createdDateOrdinal = getCareerPromptLocalDateOrdinal(
    createdAt,
    timeZone
  );
  if (currentDateOrdinal === null || createdDateOrdinal === null) return "";

  const calendarDaysAgo = currentDateOrdinal - createdDateOrdinal;
  if (calendarDaysAgo <= 0) {
    const hoursAgo = Math.max(1, Math.floor(elapsedMs / (60 * 60 * 1000)));
    return locale === "en"
      ? `${hoursAgo} hour${hoursAgo === 1 ? "" : "s"} ago`
      : `${hoursAgo}시간 전`;
  }
  if (calendarDaysAgo < 10) {
    return locale === "en"
      ? `${calendarDaysAgo} day${calendarDaysAgo === 1 ? "" : "s"} ago`
      : `${calendarDaysAgo}일 전`;
  }

  return formatCareerPromptAbsoluteDateTime(createdAt, options);
}

export function sanitizeCareerPromptDateValues(
  text: string,
  options?: CareerPromptDateTimeOptions
) {
  return text.replace(rawIsoTimestampPattern, (match) => {
    const compact = formatCareerPromptCompactDateTime(match, options);
    return compact || match;
  });
}

export function formatCareerPromptKoreanDateTime(
  value: string | null | undefined,
  options?: CareerPromptDateTimeOptions
) {
  if (!value) return "(없음)";
  return (
    formatCareerPromptCompactDateTime(value, options) ||
    (resolveCareerPromptDateTimeLocale(options) === "en"
      ? "(unrecognized time)"
      : "(인식할 수 없는 시각)")
  );
}
