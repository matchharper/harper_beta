import {
  ISO_WEEKDAYS,
  type IsoWeekdayKey,
  type MeetingAvailabilityDateOverrides,
  type MeetingAvailabilityDocument,
  type MeetingAvailabilityInterval,
  MeetingAvailabilityValidationError,
  normalizeMeetingAvailabilityInput,
  type SavedMeetingAvailability,
} from "@/lib/meetings/availability";

type AvailabilityEditInput = {
  dateOverrides?: unknown;
  removeDateOverrides?: unknown;
  timezone?: unknown;
  weeklyUpdates?: unknown;
};

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_KEYS = new Set<string>(ISO_WEEKDAYS.map(({ key }) => key));

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cloneIntervals(value: MeetingAvailabilityInterval[]) {
  return value.map((interval) => ({ ...interval }));
}

function cloneCurrent(
  current: SavedMeetingAvailability | null,
  timezone: string
): MeetingAvailabilityDocument {
  const weeklyRules = Object.fromEntries(
    ISO_WEEKDAYS.map(({ key }) => [
      key,
      cloneIntervals(current?.weeklyRules[key] ?? []),
    ])
  ) as MeetingAvailabilityDocument["weeklyRules"];
  const dateOverrides: MeetingAvailabilityDateOverrides = Object.fromEntries(
    Object.entries(current?.dateOverrides ?? {}).map(([dateKey, intervals]) => [
      dateKey,
      cloneIntervals(intervals),
    ])
  );
  return { dateOverrides, timezone, weeklyRules };
}

function parseDateKey(value: unknown, field: string) {
  const dateKey = String(value ?? "").trim();
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  if (
    !DATE_KEY_PATTERN.test(dateKey) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== dateKey
  ) {
    throw new MeetingAvailabilityValidationError(
      `${field}의 날짜를 YYYY-MM-DD 형식으로 확인해 주세요.`
    );
  }
  return dateKey;
}

function intervals(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new MeetingAvailabilityValidationError(
      `${field}의 가능 시간을 확인해 주세요.`
    );
  }
  return value;
}

export function applyMeetingAvailabilityEdits(args: {
  current: SavedMeetingAvailability | null;
  input: AvailabilityEditInput;
  now?: Date;
}) {
  const timezone = String(
    args.input.timezone ?? args.current?.timezone ?? "Asia/Seoul"
  ).trim();
  const next = cloneCurrent(args.current, timezone);
  let changed = args.input.timezone !== undefined;
  const overriddenDates = new Set<string>();

  if (args.input.weeklyUpdates !== undefined) {
    if (!Array.isArray(args.input.weeklyUpdates)) {
      throw new MeetingAvailabilityValidationError(
        "반복 가능 시간 변경 내용을 확인해 주세요."
      );
    }
    const changedDays = new Set<string>();
    for (const [index, rawUpdate] of args.input.weeklyUpdates.entries()) {
      const update = record(rawUpdate);
      if (!update || !Array.isArray(update.days) || update.days.length === 0) {
        throw new MeetingAvailabilityValidationError(
          `${index + 1}번째 반복 설정의 요일을 확인해 주세요.`
        );
      }
      const days = update.days.map((value) => String(value ?? "").trim());
      if (days.some((day) => !WEEKDAY_KEYS.has(day))) {
        throw new MeetingAvailabilityValidationError(
          `${index + 1}번째 반복 설정의 요일을 확인해 주세요.`
        );
      }
      for (const day of days) {
        if (changedDays.has(day)) {
          throw new MeetingAvailabilityValidationError(
            "같은 요일의 반복 가능 시간을 두 번 지정하지 말아 주세요."
          );
        }
        changedDays.add(day);
        next.weeklyRules[day as IsoWeekdayKey] = intervals(
          update.intervals,
          `${index + 1}번째 반복 설정`
        ) as MeetingAvailabilityInterval[];
      }
    }
    changed ||= args.input.weeklyUpdates.length > 0;
  }

  if (args.input.dateOverrides !== undefined) {
    if (!Array.isArray(args.input.dateOverrides)) {
      throw new MeetingAvailabilityValidationError(
        "날짜별 예외 변경 내용을 확인해 주세요."
      );
    }
    for (const [index, rawOverride] of args.input.dateOverrides.entries()) {
      const override = record(rawOverride);
      if (!override) {
        throw new MeetingAvailabilityValidationError(
          `${index + 1}번째 날짜별 예외를 확인해 주세요.`
        );
      }
      const dateKey = parseDateKey(
        override.date,
        `${index + 1}번째 날짜별 예외`
      );
      if (overriddenDates.has(dateKey)) {
        throw new MeetingAvailabilityValidationError(
          "같은 날짜의 예외 시간을 두 번 지정하지 말아 주세요."
        );
      }
      overriddenDates.add(dateKey);
      next.dateOverrides[dateKey] = intervals(
        override.intervals,
        `${dateKey} 예외`
      ) as MeetingAvailabilityInterval[];
    }
    changed ||= args.input.dateOverrides.length > 0;
  }

  if (args.input.removeDateOverrides !== undefined) {
    if (!Array.isArray(args.input.removeDateOverrides)) {
      throw new MeetingAvailabilityValidationError(
        "삭제할 날짜별 예외를 확인해 주세요."
      );
    }
    for (const [index, value] of args.input.removeDateOverrides.entries()) {
      const dateKey = parseDateKey(value, `${index + 1}번째 삭제할 예외`);
      if (overriddenDates.has(dateKey)) {
        throw new MeetingAvailabilityValidationError(
          "같은 날짜의 예외를 추가하고 삭제하도록 동시에 요청하지 말아 주세요."
        );
      }
      delete next.dateOverrides[dateKey];
    }
    changed ||= args.input.removeDateOverrides.length > 0;
  }

  if (!changed) {
    throw new MeetingAvailabilityValidationError(
      "바꿀 반복 시간이나 날짜별 예외를 알려 주세요."
    );
  }

  return normalizeMeetingAvailabilityInput(next, { now: args.now });
}
