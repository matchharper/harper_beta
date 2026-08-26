export const ISO_WEEKDAYS = [
  { key: "1", label: "월요일", shortLabel: "월" },
  { key: "2", label: "화요일", shortLabel: "화" },
  { key: "3", label: "수요일", shortLabel: "수" },
  { key: "4", label: "목요일", shortLabel: "목" },
  { key: "5", label: "금요일", shortLabel: "금" },
  { key: "6", label: "토요일", shortLabel: "토" },
  { key: "7", label: "일요일", shortLabel: "일" },
] as const;

export type IsoWeekdayKey = (typeof ISO_WEEKDAYS)[number]["key"];

export type MeetingAvailabilityInterval = {
  end: string;
  start: string;
};

export type MeetingAvailabilityWeeklyRules = Record<
  IsoWeekdayKey,
  MeetingAvailabilityInterval[]
>;

export type MeetingAvailabilityDateOverrides = Record<
  string,
  MeetingAvailabilityInterval[]
>;

export type MeetingAvailabilityDocument = {
  dateOverrides: MeetingAvailabilityDateOverrides;
  timezone: string;
  weeklyRules: MeetingAvailabilityWeeklyRules;
};

export type SavedMeetingAvailability = MeetingAvailabilityDocument & {
  updatedAt: string;
  version: number;
};

export type MeetingAvailabilityResponse = {
  availability: SavedMeetingAvailability | null;
  ok: true;
};

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const MAX_INTERVALS_PER_DAY = 24;
const MAX_DATE_OVERRIDES = 120;
const MINUTE_STEP = 15;

export class MeetingAvailabilityValidationError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function meetingTimeToMinutes(value: string, allowEndOfDay = false) {
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (allowEndOfDay && hour === 24 && minute === 0) return 24 * 60;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function meetingMinutesToTime(value: number) {
  const bounded = Math.max(0, Math.min(24 * 60, Math.round(value)));
  const hour = Math.floor(bounded / 60);
  const minute = bounded % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeIntervals(
  value: unknown,
  fieldLabel: string
): MeetingAvailabilityInterval[] {
  if (!Array.isArray(value)) {
    throw new MeetingAvailabilityValidationError(
      `${fieldLabel}의 시간 형식이 올바르지 않습니다.`
    );
  }
  if (value.length > MAX_INTERVALS_PER_DAY) {
    throw new MeetingAvailabilityValidationError(
      `${fieldLabel}에는 시간을 ${MAX_INTERVALS_PER_DAY}개까지 설정할 수 있습니다.`
    );
  }

  const intervals = value.map((item) => {
    if (!isRecord(item)) {
      throw new MeetingAvailabilityValidationError(
        `${fieldLabel}의 시간 형식이 올바르지 않습니다.`
      );
    }
    const start = typeof item.start === "string" ? item.start.trim() : "";
    const end = typeof item.end === "string" ? item.end.trim() : "";
    const startMinutes = meetingTimeToMinutes(start);
    const endMinutes = meetingTimeToMinutes(end, true);
    if (
      startMinutes === null ||
      endMinutes === null ||
      startMinutes % MINUTE_STEP !== 0 ||
      endMinutes % MINUTE_STEP !== 0 ||
      startMinutes >= endMinutes
    ) {
      throw new MeetingAvailabilityValidationError(
        `${fieldLabel}의 시작과 종료 시간을 15분 단위로 확인해 주세요.`
      );
    }
    return {
      end: meetingMinutesToTime(endMinutes),
      start: meetingMinutesToTime(startMinutes),
    };
  });

  intervals.sort(
    (left, right) =>
      (meetingTimeToMinutes(left.start) ?? 0) -
      (meetingTimeToMinutes(right.start) ?? 0)
  );

  return intervals.reduce<MeetingAvailabilityInterval[]>((merged, interval) => {
    const previous = merged.at(-1);
    if (!previous) {
      merged.push(interval);
      return merged;
    }
    const previousEnd = meetingTimeToMinutes(previous.end, true) ?? 0;
    const nextStart = meetingTimeToMinutes(interval.start) ?? 0;
    if (nextStart <= previousEnd) {
      const nextEnd = meetingTimeToMinutes(interval.end, true) ?? 0;
      previous.end = meetingMinutesToTime(Math.max(previousEnd, nextEnd));
    } else {
      merged.push(interval);
    }
    return merged;
  }, []);
}

export function isValidIanaTimezone(value: string) {
  if (!value || value.length > 128) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function utcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function meetingDateKeyInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => ["day", "month", "year"].includes(part.type))
      .map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function dateKeyDaysBefore(dateKey: string, dayCount: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return utcDateKey(new Date(Date.UTC(year, month - 1, day - dayCount)));
}

export function normalizeMeetingAvailabilityInput(
  input: unknown,
  options: { now?: Date } = {}
): MeetingAvailabilityDocument {
  if (!isRecord(input)) {
    throw new MeetingAvailabilityValidationError(
      "가능 시간 설정을 확인해 주세요."
    );
  }

  const timezone =
    typeof input.timezone === "string" ? input.timezone.trim() : "";
  if (!isValidIanaTimezone(timezone)) {
    throw new MeetingAvailabilityValidationError(
      "올바른 시간대를 선택해 주세요."
    );
  }

  if (!isRecord(input.weeklyRules)) {
    throw new MeetingAvailabilityValidationError(
      "반복 가능 시간을 확인해 주세요."
    );
  }
  const rawWeeklyRules = input.weeklyRules;
  const weeklyRules = Object.fromEntries(
    ISO_WEEKDAYS.map(({ key, label }) => [
      key,
      normalizeIntervals(rawWeeklyRules[key] ?? [], label),
    ])
  ) as MeetingAvailabilityWeeklyRules;

  if (!isRecord(input.dateOverrides)) {
    throw new MeetingAvailabilityValidationError(
      "날짜별 예외 시간을 확인해 주세요."
    );
  }
  const now = options.now ?? new Date();
  const oldestDateKey = dateKeyDaysBefore(
    meetingDateKeyInTimezone(now, timezone),
    30
  );
  const entries = Object.entries(input.dateOverrides)
    .filter(([dateKey]) => dateKey >= oldestDateKey)
    .sort(([left], [right]) => left.localeCompare(right));
  if (entries.length > MAX_DATE_OVERRIDES) {
    throw new MeetingAvailabilityValidationError(
      `날짜별 예외는 ${MAX_DATE_OVERRIDES}일까지 저장할 수 있습니다.`
    );
  }

  const dateOverrides: MeetingAvailabilityDateOverrides = {};
  for (const [dateKey, value] of entries) {
    if (!DATE_KEY_PATTERN.test(dateKey)) {
      throw new MeetingAvailabilityValidationError(
        "날짜별 예외의 날짜 형식을 확인해 주세요."
      );
    }
    const parsed = new Date(`${dateKey}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || utcDateKey(parsed) !== dateKey) {
      throw new MeetingAvailabilityValidationError(
        "날짜별 예외에 올바르지 않은 날짜가 있습니다."
      );
    }
    dateOverrides[dateKey] = normalizeIntervals(value, `${dateKey} 예외`);
  }

  return { dateOverrides, timezone, weeklyRules };
}

export function createDefaultMeetingAvailabilityDocument(
  timezone = "Asia/Seoul"
): MeetingAvailabilityDocument {
  const weekdayInterval = [{ end: "19:00", start: "10:00" }];
  return {
    dateOverrides: {},
    timezone: isValidIanaTimezone(timezone) ? timezone : "Asia/Seoul",
    weeklyRules: {
      "1": weekdayInterval.map((interval) => ({ ...interval })),
      "2": weekdayInterval.map((interval) => ({ ...interval })),
      "3": weekdayInterval.map((interval) => ({ ...interval })),
      "4": weekdayInterval.map((interval) => ({ ...interval })),
      "5": weekdayInterval.map((interval) => ({ ...interval })),
      "6": [],
      "7": [],
    },
  };
}

export function getMeetingAvailabilityIntervalsForDate(
  availability: MeetingAvailabilityDocument,
  dateKey: string,
  isoWeekday: IsoWeekdayKey
) {
  const override = availability.dateOverrides[dateKey];
  return (override ?? availability.weeklyRules[isoWeekday]).map((interval) => ({
    ...interval,
  }));
}

export function hasMeetingStartInTimeRange(args: {
  durationMinutes?: number;
  intervals: MeetingAvailabilityInterval[];
  rangeEnd: string;
  rangeStart: string;
  stepMinutes?: number;
}) {
  const durationMinutes = args.durationMinutes ?? 60;
  const stepMinutes = args.stepMinutes ?? MINUTE_STEP;
  const rangeStart = meetingTimeToMinutes(args.rangeStart);
  const rangeEnd = meetingTimeToMinutes(args.rangeEnd, true);
  if (
    rangeStart === null ||
    rangeEnd === null ||
    rangeStart >= rangeEnd ||
    !Number.isSafeInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    !Number.isSafeInteger(stepMinutes) ||
    stepMinutes <= 0
  ) {
    return false;
  }

  return args.intervals.some((interval) => {
    const intervalStart = meetingTimeToMinutes(interval.start);
    const intervalEnd = meetingTimeToMinutes(interval.end, true);
    if (intervalStart === null || intervalEnd === null) return false;
    const firstCandidate =
      Math.ceil(Math.max(intervalStart, rangeStart) / stepMinutes) *
      stepMinutes;
    return (
      firstCandidate < rangeEnd &&
      firstCandidate + durationMinutes <= intervalEnd
    );
  });
}

export function isMeetingTimeRangeAvailable(args: {
  intervals: MeetingAvailabilityInterval[];
  rangeEnd: string;
  rangeStart: string;
}) {
  const rangeStart = meetingTimeToMinutes(args.rangeStart);
  const rangeEnd = meetingTimeToMinutes(args.rangeEnd, true);
  if (rangeStart === null || rangeEnd === null || rangeStart >= rangeEnd) {
    return false;
  }

  return args.intervals.some((interval) => {
    const intervalStart = meetingTimeToMinutes(interval.start);
    const intervalEnd = meetingTimeToMinutes(interval.end, true);
    return (
      intervalStart !== null &&
      intervalEnd !== null &&
      intervalStart <= rangeStart &&
      intervalEnd >= rangeEnd
    );
  });
}

export function setMeetingTimeRangeAvailability(args: {
  available: boolean;
  intervals: MeetingAvailabilityInterval[];
  rangeEnd: string;
  rangeStart: string;
}) {
  const rangeStart = meetingTimeToMinutes(args.rangeStart);
  const rangeEnd = meetingTimeToMinutes(args.rangeEnd, true);
  if (rangeStart === null || rangeEnd === null || rangeStart >= rangeEnd) {
    throw new MeetingAvailabilityValidationError(
      "바꾸려는 시간 범위를 확인해 주세요."
    );
  }

  const next = args.available
    ? [...args.intervals, { end: args.rangeEnd, start: args.rangeStart }]
    : args.intervals.flatMap((interval) => {
        const intervalStart = meetingTimeToMinutes(interval.start);
        const intervalEnd = meetingTimeToMinutes(interval.end, true);
        if (
          intervalStart === null ||
          intervalEnd === null ||
          intervalEnd <= rangeStart ||
          intervalStart >= rangeEnd
        ) {
          return [{ ...interval }];
        }

        const remaining: MeetingAvailabilityInterval[] = [];
        if (intervalStart < rangeStart) {
          remaining.push({
            end: meetingMinutesToTime(rangeStart),
            start: interval.start,
          });
        }
        if (intervalEnd > rangeEnd) {
          remaining.push({
            end: interval.end,
            start: meetingMinutesToTime(rangeEnd),
          });
        }
        return remaining;
      });

  return normalizeIntervals(next, "가능 시간");
}

function intervalListKey(intervals: MeetingAvailabilityInterval[]) {
  return intervals
    .map((interval) => `${interval.start}-${interval.end}`)
    .join(",");
}

function formatIntervals(intervals: MeetingAvailabilityInterval[]) {
  return intervals
    .map((interval) => `${interval.start}–${interval.end}`)
    .join(", ");
}

export function formatMeetingAvailabilitySummary(
  availability: MeetingAvailabilityDocument
) {
  const weekdayKeys: IsoWeekdayKey[] = ["1", "2", "3", "4", "5"];
  const weekendKeys: IsoWeekdayKey[] = ["6", "7"];
  const allKeys = ISO_WEEKDAYS.map(({ key }) => key);
  const weekdayValue = intervalListKey(availability.weeklyRules["1"]);
  const allWeekdaysMatch = weekdayKeys.every(
    (key) => intervalListKey(availability.weeklyRules[key]) === weekdayValue
  );
  const weekendsEmpty = weekendKeys.every(
    (key) => availability.weeklyRules[key].length === 0
  );
  const allDaysMatch = allKeys.every(
    (key) => intervalListKey(availability.weeklyRules[key]) === weekdayValue
  );

  let recurringSummary = "반복 시간 없음";
  if (weekdayValue && allDaysMatch) {
    recurringSummary = `매일 ${formatIntervals(availability.weeklyRules["1"])}`;
  } else if (weekdayValue && allWeekdaysMatch && weekendsEmpty) {
    recurringSummary = `평일 ${formatIntervals(availability.weeklyRules["1"])}`;
  } else {
    const availableDayCount = allKeys.filter(
      (key) => availability.weeklyRules[key].length > 0
    ).length;
    if (availableDayCount > 0)
      recurringSummary = `주 ${availableDayCount}일 설정`;
  }

  const overrideCount = Object.keys(availability.dateOverrides).length;
  return [
    availability.timezone,
    recurringSummary,
    overrideCount > 0 ? `예외 ${overrideCount}일` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function meetingAvailabilityDocumentsEqual(
  left: MeetingAvailabilityDocument,
  right: MeetingAvailabilityDocument
) {
  const fingerprint = (availability: MeetingAvailabilityDocument) =>
    JSON.stringify({
      dateOverrides: Object.fromEntries(
        Object.entries(availability.dateOverrides).sort(
          ([leftDate], [rightDate]) => leftDate.localeCompare(rightDate)
        )
      ),
      timezone: availability.timezone,
      weeklyRules: Object.fromEntries(
        ISO_WEEKDAYS.map(({ key }) => [key, availability.weeklyRules[key]])
      ),
    });
  return fingerprint(left) === fingerprint(right);
}
