import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type RelativeTimeLocale = "ko" | "en";

function formatEnglishRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit
) {
  return new Intl.RelativeTimeFormat("en", {
    numeric: "always",
  }).format(-value, unit);
}

export function formatRelativeTime(
  value: string | null | undefined,
  locale: RelativeTimeLocale = "ko"
) {
  if (!value) return null;

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;

  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) return locale === "en" ? "just now" : "방금 전";

  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;
  const monthMs = 30 * dayMs;
  const yearMs = 365 * dayMs;

  if (diffMs < minuteMs) return locale === "en" ? "just now" : "방금 전";

  if (diffMs < hourMs) {
    const minutes = Math.floor(diffMs / minuteMs);
    return locale === "en"
      ? formatEnglishRelativeTime(minutes, "minute")
      : `${minutes}분 전`;
  }

  if (diffMs < dayMs) {
    const hours = Math.floor(diffMs / hourMs);
    return locale === "en"
      ? formatEnglishRelativeTime(hours, "hour")
      : `${hours}시간 전`;
  }

  if (diffMs < weekMs) {
    const days = Math.floor(diffMs / dayMs);
    return locale === "en"
      ? formatEnglishRelativeTime(days, "day")
      : `${days}일 전`;
  }

  if (diffMs < monthMs) {
    const weeks = Math.floor(diffMs / weekMs);
    return locale === "en"
      ? formatEnglishRelativeTime(weeks, "week")
      : `${weeks}주 전`;
  }

  if (diffMs < yearMs) {
    const months = Math.floor(diffMs / monthMs);
    return locale === "en"
      ? formatEnglishRelativeTime(months, "month")
      : `${months}달 전`;
  }

  const years = Math.floor(diffMs / yearMs);
  return locale === "en"
    ? formatEnglishRelativeTime(years, "year")
    : `${years}년 전`;
}
