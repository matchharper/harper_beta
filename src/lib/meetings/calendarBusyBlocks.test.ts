import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarBusyBlockOverlapsDate,
  calendarBusyBlockOverlapsTimeRange,
  formatCalendarBusyBlockTimeForDate,
} from "./calendarBusyBlocks";

const overnightBlock = {
  allDay: false,
  endAt: "2026-08-29T16:00:00.000Z",
  id: "4b859944-bd75-4dc0-bc37-6ac8aa7446db",
  isBlocking: true,
  startAt: "2026-08-29T14:00:00.000Z",
};

test("treats a busy block end as exclusive at the local date boundary", () => {
  const endingAtMidnight = {
    ...overnightBlock,
    endAt: "2026-08-29T15:00:00.000Z",
  };
  assert.equal(
    calendarBusyBlockOverlapsDate({
      busyBlock: endingAtMidnight,
      dateKey: "2026-08-29",
      timezone: "Asia/Seoul",
    }),
    true
  );
  assert.equal(
    calendarBusyBlockOverlapsDate({
      busyBlock: endingAtMidnight,
      dateKey: "2026-08-30",
      timezone: "Asia/Seoul",
    }),
    false
  );
});

test("clips an overnight busy block to the selected local date", () => {
  assert.equal(
    formatCalendarBusyBlockTimeForDate({
      busyBlock: overnightBlock,
      dateKey: "2026-08-29",
      timezone: "Asia/Seoul",
    }),
    "23:00–24:00"
  );
  assert.equal(
    formatCalendarBusyBlockTimeForDate({
      busyBlock: overnightBlock,
      dateKey: "2026-08-30",
      timezone: "Asia/Seoul",
    }),
    "00:00–01:00"
  );
});

test("keeps all-day blocks privacy-minimal in the UI", () => {
  assert.equal(
    formatCalendarBusyBlockTimeForDate({
      busyBlock: { ...overnightBlock, allDay: true },
      dateKey: "2026-08-29",
      timezone: "Asia/Seoul",
    }),
    "하루 종일"
  );
});

test("matches only the local hour ranges overlapped by a busy block", () => {
  const partialHourBlock = {
    ...overnightBlock,
    endAt: "2026-08-29T02:30:00.000Z",
    startAt: "2026-08-29T01:30:00.000Z",
  };
  for (const range of [
    { rangeEnd: "11:00", rangeStart: "10:00" },
    { rangeEnd: "12:00", rangeStart: "11:00" },
  ]) {
    assert.equal(
      calendarBusyBlockOverlapsTimeRange({
        busyBlock: partialHourBlock,
        dateKey: "2026-08-29",
        ...range,
        timezone: "Asia/Seoul",
      }),
      true
    );
  }

  assert.equal(
    calendarBusyBlockOverlapsTimeRange({
      busyBlock: overnightBlock,
      dateKey: "2026-08-29",
      rangeEnd: "23:00",
      rangeStart: "22:00",
      timezone: "Asia/Seoul",
    }),
    false
  );
  assert.equal(
    calendarBusyBlockOverlapsTimeRange({
      busyBlock: overnightBlock,
      dateKey: "2026-08-29",
      rangeEnd: "24:00",
      rangeStart: "23:00",
      timezone: "Asia/Seoul",
    }),
    true
  );
  assert.equal(
    calendarBusyBlockOverlapsTimeRange({
      busyBlock: overnightBlock,
      dateKey: "2026-08-30",
      rangeEnd: "01:00",
      rangeStart: "00:00",
      timezone: "Asia/Seoul",
    }),
    true
  );
  assert.equal(
    calendarBusyBlockOverlapsTimeRange({
      busyBlock: overnightBlock,
      dateKey: "2026-08-30",
      rangeEnd: "02:00",
      rangeStart: "01:00",
      timezone: "Asia/Seoul",
    }),
    false
  );
});
