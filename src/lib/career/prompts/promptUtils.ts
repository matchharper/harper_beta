import { normalizeCareerPromptLocale } from "@/lib/career/promptLocale";
import type { CareerPromptBlock } from "@/lib/career/prompts/types";
import { safeSlice } from "@/lib/textSanitization";

export const CAREER_PROFILE_PROMPT_TIME_ZONE = "Asia/Seoul";

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

const compactPromptKstDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CAREER_PROFILE_PROMPT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

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

export function formatCareerPromptCompactDateTime(value: unknown) {
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
  if (/^\d{4}-\d{2}-\d{2} \d{1,2}시(?:\s*KST)?$/.test(text)) {
    return text.replace(/\s*KST$/, "");
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const date = new Date(normalizeTimestampForDateParse(text));
  if (Number.isNaN(date.getTime())) {
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
  }

  const parts = compactPromptKstDateTimeFormatter.formatToParts(date);
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = partValue("year");
  const month = partValue("month");
  const day = partValue("day");
  const hour = partValue("hour");
  if (!year || !month || !day || !hour) {
    return text.slice(0, 10);
  }
  return `${year}-${month}-${day} ${hour}시`;
}

export function sanitizeCareerPromptDateValues(text: string) {
  return text.replace(rawIsoTimestampPattern, (match) => {
    const compact = formatCareerPromptCompactDateTime(match);
    return compact || match;
  });
}

const careerPromptKstDateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: CAREER_PROFILE_PROMPT_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

export function formatCareerPromptKoreanDateTime(
  value: string | null | undefined
) {
  if (!value) return "(없음)";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const parts = careerPromptKstDateTimeFormatter.formatToParts(date);
  const partValue = (type: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find((item) => item.type === type);
    if (!part) return null;

    const numberValue = Number(part.value);
    return Number.isFinite(numberValue) ? numberValue : null;
  };

  const year = partValue("year");
  const month = partValue("month");
  const day = partValue("day");
  const hour = partValue("hour");
  const minute = partValue("minute");

  if (
    year === null ||
    month === null ||
    day === null ||
    hour === null ||
    minute === null
  ) {
    return careerPromptKstDateTimeFormatter.format(date);
  }

  const hourLabel = String(hour).padStart(2, "0");
  const minuteLabel = String(minute).padStart(2, "0");
  return `${year}년 ${month}월 ${day}일 ${hourLabel}:${minuteLabel} KST`;
}
