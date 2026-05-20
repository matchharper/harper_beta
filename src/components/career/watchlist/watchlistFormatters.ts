import type { ParsedUrlQuery } from "querystring";
import { formatRelativeTime } from "@/lib/utils";
import type { CompanyWatchlistTab } from "./watchlistTypes";

const numberFormatter = new Intl.NumberFormat("ko-KR");

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

export const formatFollowedAt = (value: string | null) => {
  const relative = formatRelativeTime(value);
  return relative ? `${relative}부터 팔로잉` : "팔로잉 중";
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

const formatNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? numberFormatter.format(parsed) : "";
};

export const formatEmployeeCountRange = (value: unknown) => {
  const record = toRecord(value);
  const start = formatNumber(record.start);
  const end = formatNumber(record.end);
  if (start && end) return `${start}-${end}명`;
  if (start) return `${start}명 이상`;
  if (end) return `${end}명 이하`;
  return "";
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
