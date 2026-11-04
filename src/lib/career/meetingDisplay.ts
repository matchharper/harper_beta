import type { CareerHistoryOpportunity } from "@/components/career/types";
import type { TalentMeetingSchedule } from "./meetings/types";
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
  calendarDate?: string | null;
  endAt: string | null;
  locale: CareerMeetingDisplayLocale;
  startAt: string;
}) {
  if (
    args.calendarDate &&
    Number.isFinite(Date.parse(`${args.calendarDate}T00:00:00Z`))
  )
    return new Intl.DateTimeFormat(args.locale === "en" ? "en-US" : "ko-KR", {
      month: "long",
      day: "numeric",
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(`${args.calendarDate}T00:00:00Z`));
  const start = dateTimeParts(args.startAt, args.locale);
  if (!start) return null;
  const end = args.endAt ? dateTimeParts(args.endAt, args.locale) : null;
  if (!end) return `${start.dateText} ${start.timeText} KST`;

  const endText =
    start.dateText === end.dateText
      ? end.timeText
      : `${end.dateText} ${end.timeText}`;
  return `${start.dateText} ${start.timeText}–${endText} KST`;
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

export function mergeCreatedAppointment(
  item: CareerHistoryOpportunity,
  schedule: TalentMeetingSchedule
): CareerHistoryOpportunity {
  if (!schedule.confirmed_start_at) return item;
  const calendarDate =
    typeof schedule.source_refs?.calendarDate === "string"
      ? schedule.source_refs.calendarDate
      : null;
  const meeting = {
    startAt: schedule.confirmed_start_at,
    endAt: schedule.confirmed_end_at,
    title: schedule.title,
    calendarDate,
  };
  const today = careerMeetingToday();
  const upcoming = calendarDate
    ? calendarDate >= today
    : Date.parse(meeting.startAt) >= Date.now();
  if (!upcoming) return item;
  if (
    item.upcomingMeeting &&
    (item.upcomingMeeting.calendarDate
      ? item.upcomingMeeting.calendarDate >= today
      : Date.parse(item.upcomingMeeting.startAt) >= Date.now()) &&
    Date.parse(item.upcomingMeeting.startAt) < Date.parse(meeting.startAt)
  )
    return item;
  return { ...item, upcomingMeeting: meeting };
}

export function careerMeetingToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function upcomingMeetingFilter(now = new Date()) {
  return `confirmed_start_at.gte.${now.toISOString()},source_refs->>calendarDate.gte.${careerMeetingToday(now)}`;
}
