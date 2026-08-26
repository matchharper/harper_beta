import {
  getMeetingAvailabilityIntervalsForDate,
  type IsoWeekdayKey,
  meetingDateKeyInTimezone,
  meetingTimeToMinutes,
  type SavedMeetingAvailability,
} from "@/lib/meetings/availability";

export const MEETING_SLOT_STEP_MINUTES = 30;

export type MeetingBusyRange = {
  endAt: string;
  source: "external_calendar" | "harper";
  startAt: string;
};

export type MeetingCandidateSlot = {
  dateKey: string;
  endAt: string;
  startAt: string;
};

function dateKeyFromUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return dateKeyFromUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

function isoWeekdayForDateKey(dateKey: string): IsoWeekdayKey {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return String(day === 0 ? 7 : day) as IsoWeekdayKey;
}

function timezoneParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter((part) =>
        ["day", "hour", "minute", "month", "second", "year"].includes(part.type)
      )
      .map((part) => [part.type, Number(part.value)])
  ) as Record<string, number>;
}

function timezoneOffsetMilliseconds(date: Date, timezone: string) {
  const parts = timezoneParts(date, timezone);
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    ) - date.getTime()
  );
}

export function meetingLocalTimeToUtc(args: {
  dateKey: string;
  minutes: number;
  timezone: string;
}) {
  const [year, month, day] = args.dateKey.split("-").map(Number);
  const hour = Math.floor(args.minutes / 60);
  const minute = args.minutes % 60;
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let result = new Date(
    naiveUtc - timezoneOffsetMilliseconds(new Date(naiveUtc), args.timezone)
  );
  result = new Date(
    naiveUtc - timezoneOffsetMilliseconds(result, args.timezone)
  );

  const rendered = timezoneParts(result, args.timezone);
  if (
    rendered.year !== year ||
    rendered.month !== month ||
    rendered.day !== day ||
    rendered.hour !== hour ||
    rendered.minute !== minute
  ) {
    return null;
  }
  return result;
}

function overlapsBusyRange(
  startAt: Date,
  endAt: Date,
  busyRanges: MeetingBusyRange[]
) {
  return busyRanges.some((busy) => {
    const busyStart = new Date(busy.startAt);
    const busyEnd = new Date(busy.endAt);
    return (
      !Number.isNaN(busyStart.getTime()) &&
      !Number.isNaN(busyEnd.getTime()) &&
      startAt < busyEnd &&
      endAt > busyStart
    );
  });
}

export function calculateMeetingCandidateSlots(args: {
  availability: SavedMeetingAvailability;
  busyRanges?: MeetingBusyRange[];
  durationMinutes: number;
  stepMinutes?: number;
  windowEnd: Date;
  windowStart: Date;
}) {
  const stepMinutes = args.stepMinutes ?? MEETING_SLOT_STEP_MINUTES;
  if (
    !Number.isSafeInteger(args.durationMinutes) ||
    args.durationMinutes <= 0 ||
    !Number.isSafeInteger(stepMinutes) ||
    stepMinutes <= 0 ||
    args.windowStart >= args.windowEnd
  ) {
    return [];
  }

  const timezone = args.availability.timezone;
  const firstDateKey = meetingDateKeyInTimezone(args.windowStart, timezone);
  const lastDateKey = meetingDateKeyInTimezone(args.windowEnd, timezone);
  const slots: MeetingCandidateSlot[] = [];
  let dateKey = firstDateKey;

  while (dateKey <= lastDateKey) {
    const intervals = getMeetingAvailabilityIntervalsForDate(
      args.availability,
      dateKey,
      isoWeekdayForDateKey(dateKey)
    );
    for (const interval of intervals) {
      const intervalStart = meetingTimeToMinutes(interval.start);
      const intervalEnd = meetingTimeToMinutes(interval.end, true);
      if (intervalStart === null || intervalEnd === null) continue;
      const firstStart = Math.ceil(intervalStart / stepMinutes) * stepMinutes;
      for (
        let startMinutes = firstStart;
        startMinutes + args.durationMinutes <= intervalEnd;
        startMinutes += stepMinutes
      ) {
        const endMinutes = startMinutes + args.durationMinutes;
        const startAt = meetingLocalTimeToUtc({
          dateKey,
          minutes: startMinutes,
          timezone,
        });
        const endDateKey =
          endMinutes >= 24 * 60 ? addDaysToDateKey(dateKey, 1) : dateKey;
        const endAt = meetingLocalTimeToUtc({
          dateKey: endDateKey,
          minutes: endMinutes % (24 * 60),
          timezone,
        });
        if (
          !startAt ||
          !endAt ||
          startAt < args.windowStart ||
          endAt > args.windowEnd ||
          overlapsBusyRange(startAt, endAt, args.busyRanges ?? [])
        ) {
          continue;
        }
        slots.push({
          dateKey,
          endAt: endAt.toISOString(),
          startAt: startAt.toISOString(),
        });
      }
    }
    dateKey = addDaysToDateKey(dateKey, 1);
  }

  return slots.sort((left, right) => left.startAt.localeCompare(right.startAt));
}
