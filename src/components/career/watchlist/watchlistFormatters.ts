import type { ParsedUrlQuery } from "querystring";
import { formatRelativeTime } from "@/lib/utils";
import { careerT } from "@/lib/career/translatedCareerMessage";
import type { CompanyWatchlistTab } from "./watchlistTypes";
import type { Locale } from "@/i18n/useMessage";

const numberFormatters: Record<Locale, Intl.NumberFormat> = {
  en: new Intl.NumberFormat("en-US"),
  ko: new Intl.NumberFormat("ko-KR"),
};

export const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const parseWatchlistTab = (
  value: string | string[] | undefined
): CompanyWatchlistTab => {
  const text = getQueryValue(value);
  if (text === "following" || text === "signals") return text;
  return "recommended";
};

export const parseCompanyDbId = (value: string | string[] | undefined) => {
  const parsed = Number(getQueryValue(value) ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
};

export const getBaseCareerQuery = (query: ParsedUrlQuery) => {
  const next: Record<string, string> = {};
  const invite = getQueryValue(query.invite);
  const mail = getQueryValue(query.mail);
  if (invite) next.invite = invite;
  if (mail) next.mail = mail;
  return next;
};

export const formatFollowedAt = (
  value: string | null,
  locale: Locale = "ko"
) => {
  const relative = formatRelativeTime(value, locale);
  if (!relative) {
    return careerT(locale, "career.company.following", "팔로잉 중");
  }
  return careerT(
    locale,
    "career.company.followed_at",
    "{relative}부터 팔로잉",
    {
      values: { relative },
    }
  );
};

export const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const toStringArray = (value: unknown, limit = 24) =>
  Array.isArray(value)
    ? value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .slice(0, limit)
    : [];

export const splitTextList = (value: string | null | undefined, limit = 24) =>
  String(value ?? "")
    .split(/[,/·|]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);

const formatNumber = (value: unknown, locale: Locale) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? numberFormatters[locale].format(parsed) : "";
};

export const formatEmployeeCountRange = (
  value: unknown,
  locale: Locale = "ko"
) => {
  const record = toRecord(value);
  const start = formatNumber(record.start, locale);
  const end = formatNumber(record.end, locale);
  if (start && end) {
    return careerT(
      locale,
      "career.company.employee_count.range",
      "{start}-{end}명",
      {
        values: { start, end },
      }
    );
  }
  if (start) {
    return careerT(
      locale,
      "career.company.employee_count.min",
      "{start}명 이상",
      {
        values: { start },
      }
    );
  }
  if (end) {
    return careerT(
      locale,
      "career.company.employee_count.max",
      "{end}명 이하",
      {
        values: { end },
      }
    );
  }
  return "";
};

export const formatFoundedYear = (
  value: number | null,
  locale: Locale = "ko"
) => {
  if (!value) return "";
  return careerT(locale, "career.company.founded_year", "{year}년 설립", {
    values: { year: value },
  });
};

export const formatCrunchbaseLabel = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text
    .split(/[_-]+/g)
    .map((part) =>
      part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : ""
    )
    .join(" ");
};

export const formatCrunchbaseMetricValue = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(1);
};

export const formatSignedCrunchbaseMetricValue = (value: unknown) => {
  const formatted = formatCrunchbaseMetricValue(value);
  if (!formatted) return "";
  return formatted.startsWith("-") ? formatted : `+${formatted}`;
};
