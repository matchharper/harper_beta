import {
  differenceInCalendarDays,
  differenceInMonths,
  differenceInYears,
  format,
  isSameWeek,
} from "date-fns";

const weekdays = {
  ko: new Intl.DateTimeFormat("ko-KR", { weekday: "long" }),
  en: new Intl.DateTimeFormat("en-US", { weekday: "short" }),
};
const clock = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const relativeEnglish = new Intl.RelativeTimeFormat("en-US");

export function formatCareerMessageTime(
  createdAt: string,
  locale: "ko" | "en" = "ko",
  now = new Date()
) {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "";

  const days = differenceInCalendarDays(now, created);
  if (days === 0) {
    return `${locale === "ko" ? "오늘" : "Today"} ${clock.format(created)}`;
  }
  if (days === 1) {
    return `${locale === "ko" ? "어제" : "Yesterday"} ${clock.format(created)}`;
  }
  if (isSameWeek(created, now, { weekStartsOn: 1 })) {
    return `${weekdays[locale].format(created)} ${clock.format(created)}`;
  }
  if (differenceInYears(now, created) >= 1) return format(created, "yy.MM.dd");

  const months = differenceInMonths(now, created);
  if (months >= 1) {
    return locale === "ko"
      ? `${months}달전`
      : relativeEnglish.format(-months, "month");
  }
  const weeks = Math.floor(days / 7);
  if (weeks >= 1) {
    return locale === "ko"
      ? `${weeks}주전`
      : relativeEnglish.format(-weeks, "week");
  }
  return locale === "ko" ? `${days}일전` : relativeEnglish.format(-days, "day");
}
