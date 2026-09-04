type CareerMeetingDisplayLocale = "ko" | "en";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const KST_DATE_PART_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Seoul",
  year: "numeric",
});

function kstDateParts(value: Date) {
  const parts = KST_DATE_PART_FORMATTER.formatToParts(value);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  return {
    day: Number(valueByType.get("day")),
    month: Number(valueByType.get("month")),
    year: Number(valueByType.get("year")),
  };
}

function kstDayNumber(value: Date) {
  const parts = kstDateParts(value);
  return Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_IN_MS;
}

function dateTimeParts(value: string, locale: CareerMeetingDisplayLocale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const dateText = new Intl.DateTimeFormat(
    locale === "en" ? "en-US" : "ko-KR",
    {
      day: "numeric",
      month: "long",
      timeZone: "Asia/Seoul",
      weekday: "short",
    }
  ).format(date);
  const timeText = new Intl.DateTimeFormat(
    locale === "en" ? "en-US" : "ko-KR",
    {
      hour: "numeric",
      hour12: true,
      minute: "2-digit",
      timeZone: "Asia/Seoul",
    }
  ).format(date);

  return { dateText, timeText };
}

export function formatCareerMeetingDateTimeRange(args: {
  endAt: string;
  locale: CareerMeetingDisplayLocale;
  startAt: string;
}) {
  const start = dateTimeParts(args.startAt, args.locale);
  const end = dateTimeParts(args.endAt, args.locale);
  if (!start || !end) return null;

  return `${start.dateText} ${start.timeText}–${end.timeText} KST`;
}

export function formatCareerActivityRelativeTime(
  value: string,
  locale: CareerMeetingDisplayLocale,
  now = new Date()
) {
  const activityDate = new Date(value);
  if (Number.isNaN(activityDate.getTime()) || Number.isNaN(now.getTime())) {
    return null;
  }

  const dayDifference = kstDayNumber(now) - kstDayNumber(activityDate);
  const elapsedMs = Math.max(0, now.getTime() - activityDate.getTime());
  if (dayDifference <= 0) {
    const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));
    if (elapsedMinutes < 1) return locale === "en" ? "Just now" : "방금 전";
    if (elapsedMinutes < 60) {
      return locale === "en"
        ? `${elapsedMinutes}m ago`
        : `${elapsedMinutes}분 전`;
    }
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    return locale === "en" ? `${elapsedHours}h ago` : `${elapsedHours}시간 전`;
  }

  if (dayDifference === 1) return locale === "en" ? "Yesterday" : "어제";
  if (dayDifference < 30) return `${dayDifference}d`;

  const activityParts = kstDateParts(activityDate);
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Seoul",
    ...(activityParts.year === kstDateParts(now).year
      ? {}
      : { year: "numeric" }),
  }).format(activityDate);
}
