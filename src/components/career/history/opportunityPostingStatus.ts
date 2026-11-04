import { formatRelativeTime } from "@/lib/utils";
import type { Locale } from "@/i18n/useMessage";
import type { CareerHistoryOpportunity } from "../types";

const INACTIVE_ROLE_STATUSES = new Set([
  "archived",
  "closed",
  "ended",
  "expired",
  "inactive",
]);

export type OpportunityPostingStatus = {
  isExpired: boolean;
  label: string;
};

type CareerTLike = (
  key: string,
  koSource: string,
  options?: { values?: Record<string, string | number | null | undefined> }
) => string;

const interpolate = (
  value: string,
  values?: Record<string, string | number | null | undefined>
) => {
  if (!values) return value;
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) return match;
    const nextValue = values[name];
    return nextValue === null || nextValue === undefined
      ? ""
      : String(nextValue);
  });
};

const fallbackT: CareerTLike = (_key, koSource, options) =>
  interpolate(koSource, options?.values);

export function getOpportunityDeadlineLabel(
  item: Pick<CareerHistoryOpportunity, "expiresAt">,
  locale: Locale,
  t: CareerTLike = fallbackT,
  now = Date.now()
) {
  if (!item.expiresAt) return null;
  const expiresAt = Date.parse(item.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  const remainingDays = Math.ceil((expiresAt - now) / 86_400_000);
  if (remainingDays === 1) {
    return t("career.history.my_opportunities.closes_in_one_day", "1일 뒤 마감");
  }
  if (remainingDays <= 10) {
    return t("career.history.my_opportunities.closes_in_days", "{days}일 뒤 마감", {
      values: { days: remainingDays },
    });
  }
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    year: "numeric",
    month: locale === "en" ? "short" : "numeric",
    day: "numeric",
  }).format(new Date(expiresAt));
}

export function isCareerHistoryOpportunityExpired(
  item: Pick<CareerHistoryOpportunity, "expiresAt" | "isExpired" | "status">
) {
  if (item.isExpired === true) return true;

  const normalizedStatus = String(item.status ?? "")
    .trim()
    .toLowerCase();
  if (INACTIVE_ROLE_STATUSES.has(normalizedStatus)) return true;

  if (!item.expiresAt) return false;
  const expiresAtMs = Date.parse(item.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs < Date.now();
}

export function getOpportunityPostingStatus(
  item: CareerHistoryOpportunity,
  locale: Locale = "ko",
  tArg?: CareerTLike,
  isShort: boolean = false
): OpportunityPostingStatus | null {
  const t: CareerTLike = tArg ?? fallbackT;

  if (isCareerHistoryOpportunityExpired(item)) {
    return {
      isExpired: true,
      label: t("career.history.posting.closed", "마감됨"),
    };
  }

  const postedAgo = formatRelativeTime(item.postedAt, locale);
  if (!postedAgo) return null;

  return {
    isExpired: false,
    label: t(
      "career.history.posting.posted_ago",
      isShort ? "{postedAgo}" : "{postedAgo}에 게시됨",
      {
        values: { postedAgo },
      }
    ),
  };
}
