import {
  meetingTimeToMinutes,
  type MeetingCalendarBusyBlock,
} from "@/lib/meetings/availability";
import { meetingLocalTimeToUtc } from "@/lib/meetings/slots";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function addDaysToDateKey(dateKey: string, days: number) {
  if (!DATE_KEY_PATTERN.test(dateKey)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return Number.isNaN(result.getTime())
    ? null
    : result.toISOString().slice(0, 10);
}

function busyBlockRangeForDate(args: {
  busyBlock: MeetingCalendarBusyBlock;
  dateKey: string;
  timezone: string;
}) {
  const nextDateKey = addDaysToDateKey(args.dateKey, 1);
  if (!nextDateKey) return null;
  const dayStart = meetingLocalTimeToUtc({
    dateKey: args.dateKey,
    minutes: 0,
    timezone: args.timezone,
  });
  const dayEnd = meetingLocalTimeToUtc({
    dateKey: nextDateKey,
    minutes: 0,
    timezone: args.timezone,
  });
  const blockStart = new Date(args.busyBlock.startAt);
  const blockEnd = new Date(args.busyBlock.endAt);
  if (
    !dayStart ||
    !dayEnd ||
    Number.isNaN(blockStart.getTime()) ||
    Number.isNaN(blockEnd.getTime()) ||
    blockStart >= blockEnd
  ) {
    return null;
  }
  const start = new Date(Math.max(blockStart.getTime(), dayStart.getTime()));
  const end = new Date(Math.min(blockEnd.getTime(), dayEnd.getTime()));
  return start < end ? { dayEnd, dayStart, end, start } : null;
}

export function calendarBusyBlockOverlapsDate(args: {
  busyBlock: MeetingCalendarBusyBlock;
  dateKey: string;
  timezone: string;
}) {
  return Boolean(busyBlockRangeForDate(args));
}

export function calendarBusyBlockOverlapsTimeRange(args: {
  busyBlock: MeetingCalendarBusyBlock;
  dateKey: string;
  rangeEnd: string;
  rangeStart: string;
  timezone: string;
}) {
  const nextDateKey = addDaysToDateKey(args.dateKey, 1);
  const rangeStartMinutes = meetingTimeToMinutes(args.rangeStart);
  const rangeEndMinutes = meetingTimeToMinutes(args.rangeEnd, true);
  if (
    !nextDateKey ||
    rangeStartMinutes === null ||
    rangeEndMinutes === null ||
    rangeStartMinutes >= rangeEndMinutes
  ) {
    return false;
  }
  const rangeStart = meetingLocalTimeToUtc({
    dateKey: args.dateKey,
    minutes: rangeStartMinutes,
    timezone: args.timezone,
  });
  const rangeEnd = meetingLocalTimeToUtc({
    dateKey: rangeEndMinutes === 24 * 60 ? nextDateKey : args.dateKey,
    minutes: rangeEndMinutes === 24 * 60 ? 0 : rangeEndMinutes,
    timezone: args.timezone,
  });
  const blockStart = new Date(args.busyBlock.startAt);
  const blockEnd = new Date(args.busyBlock.endAt);
  return Boolean(
    rangeStart &&
    rangeEnd &&
    !Number.isNaN(blockStart.getTime()) &&
    !Number.isNaN(blockEnd.getTime()) &&
    blockStart < rangeEnd &&
    blockEnd > rangeStart
  );
}

export function formatCalendarBusyBlockTimeForDate(args: {
  busyBlock: MeetingCalendarBusyBlock;
  dateKey: string;
  timezone: string;
}) {
  if (args.busyBlock.allDay) return "하루 종일";
  const range = busyBlockRangeForDate(args);
  if (!range) return "시간 확인 필요";
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: args.timezone,
  });
  const start =
    range.start.getTime() === range.dayStart.getTime()
      ? "00:00"
      : formatter.format(range.start);
  const end =
    range.end.getTime() === range.dayEnd.getTime()
      ? "24:00"
      : formatter.format(range.end);
  return `${start}–${end}`;
}
