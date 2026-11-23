import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SEND_WEEKDAYS, bySignalFirst, cleanSendWeekdays, dueBeforeNextChance, hoursFromSignal, kstWeekday, nextOpenTick,
  paceForTick, planSends, remainingOpenTicks, sendDay, sendWindowOpen, signalDelayLabel, type SendWindow,
} from "./sendTiming";
import { DEFAULT_AGENT_SETTINGS } from "./types";

const window: SendWindow = { startHour: 9, endHour: 21, weekdays: DEFAULT_SEND_WEEKDAYS };
// Korea time = UTC + 9. 2026-11-17 is a Tuesday, 2026-11-20 a Friday, 2026-11-21 a Saturday.
const kst = (day: string, time: string) => new Date(new Date(`${day}T${time}:00Z`).getTime() - 9 * 3_600_000);

test("defaults: weekdays 9-21 Korea time", () => {
  assert.equal(DEFAULT_AGENT_SETTINGS.sendStartHour, 9);
  assert.equal(DEFAULT_AGENT_SETTINGS.sendEndHour, 21);
  assert.deepEqual(DEFAULT_AGENT_SETTINGS.sendWeekdays, [1, 2, 3, 4, 5]);
  assert.deepEqual(cleanSendWeekdays([5, 1, 1, 7, -1, "3", 2.5]), [1, 3, 5]);
  assert.deepEqual(cleanSendWeekdays(null), [1, 2, 3, 4, 5]);
});

test("the window is the chosen Korea-time weekdays and hours", () => {
  assert.equal(kstWeekday(kst("2026-11-17", "08:00")), 2);
  assert.equal(kstWeekday(new Date("2026-11-20T23:30:00Z")), 6); // Saturday 08:30 in Korea
  assert.equal(sendWindowOpen(kst("2026-11-17", "09:00"), window), true);
  assert.equal(sendWindowOpen(kst("2026-11-17", "08:59"), window), false);
  assert.equal(sendWindowOpen(kst("2026-11-17", "21:00"), window), false);
  assert.equal(sendWindowOpen(kst("2026-11-21", "10:00"), window), false); // Saturday
  assert.equal(sendWindowOpen(kst("2026-11-21", "10:00"), { ...window, weekdays: [6] }), true);
});

test("a sending day is the chosen Korea-time weekday at any hour (the daily run finds people only then, 11/21)", () => {
  assert.equal(sendDay(kst("2026-11-20", "23:30"), window), true); // Friday night: still Friday
  assert.equal(sendDay(kst("2026-11-21", "00:10"), window), false); // Saturday just after midnight
  assert.equal(sendDay(kst("2026-11-22", "12:00"), window), false); // Sunday
  assert.equal(sendDay(kst("2026-11-23", "00:05"), window), true); // Monday before the hours open
  assert.equal(sendDay(kst("2026-11-21", "12:00"), { weekdays: [6] }), true);
  assert.equal(sendDay(kst("2026-11-17", "12:00"), { weekdays: [] }), false);
});

test("ticks left today and the next chance to send", () => {
  assert.equal(remainingOpenTicks(kst("2026-11-17", "09:00"), window), 144);
  assert.equal(remainingOpenTicks(kst("2026-11-17", "07:00"), window), 144);
  assert.equal(remainingOpenTicks(kst("2026-11-17", "20:50"), window), 2);
  assert.equal(remainingOpenTicks(kst("2026-11-17", "21:00"), window), 0);
  assert.equal(remainingOpenTicks(kst("2026-11-21", "10:00"), window), 0);
  assert.deepEqual(nextOpenTick(kst("2026-11-17", "10:00"), window), kst("2026-11-17", "10:05"));
  // Friday evening: the next chance is Monday morning.
  assert.deepEqual(nextOpenTick(kst("2026-11-20", "20:58"), window), kst("2026-11-23", "09:03"));
  assert.equal(nextOpenTick(kst("2026-11-20", "20:58"), { ...window, weekdays: [] }), null);
});

test("pace: the cap left over the ticks left, a tick skipped by chance when ahead", () => {
  assert.equal(paceForTick({ quotaLeft: 30, ticksLeft: 10 }), 3);
  assert.equal(paceForTick({ quotaLeft: 31, ticksLeft: 10 }), 4);
  assert.equal(paceForTick({ quotaLeft: 5, ticksLeft: 1 }), 5);
  assert.equal(paceForTick({ quotaLeft: 30, ticksLeft: 144, random: () => 0.1 }), 1);
  assert.equal(paceForTick({ quotaLeft: 30, ticksLeft: 144, random: () => 0.5 }), 0);
  assert.equal(paceForTick({ quotaLeft: 0, ticksLeft: 144 }), 0);
  assert.equal(paceForTick({ quotaLeft: -3, ticksLeft: 10 }), 0);
  assert.equal(paceForTick({ quotaLeft: 30, ticksLeft: 0 }), 0);
});

test("a day of ticks sends exactly the cap, spread over the window, at different minutes on different days", () => {
  const day = (seed: number) => {
    let state = seed;
    // mulberry32: the same "random" day every run of the test.
    const random = () => {
      state = (state + 0x6d2b79f5) | 0;
      let value = Math.imul(state ^ (state >>> 15), 1 | state);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
    let quota = 30;
    const sentAt: number[] = [];
    for (let tick = 0; tick < 144; tick += 1) {
      const n = paceForTick({ quotaLeft: quota, ticksLeft: 144 - tick, random });
      for (let i = 0; i < n; i += 1) sentAt.push(tick);
      quota -= n;
    }
    return sentAt;
  };
  const first = day(1);
  const second = day(2);
  assert.equal(first.length, 30);
  assert.equal(second.length, 30);
  assert.ok(Math.max(...first.map((tick, i) => (i ? tick - first[i - 1] : 0))) <= 30, "no long gap");
  assert.ok(first.filter((tick) => tick < 72).length >= 8 && first.filter((tick) => tick >= 72).length >= 8, "both halves of the day");
  assert.notDeepEqual(first, second);
  // Never more than the cap, however many ticks there are.
  assert.equal(day(3).length, 30);
});

test("24-hour rule: due when the 24 hours would end before the next chance to send", () => {
  const now = kst("2026-11-20", "20:58"); // Friday, the last tick of the week
  const monday = nextOpenTick(now, window);
  assert.equal(dueBeforeNextChance(kst("2026-11-20", "10:00").toISOString(), now, monday), true);
  assert.equal(dueBeforeNextChance(kst("2026-11-19", "20:00").toISOString(), now, monday), false); // already over 24 hours
  assert.equal(dueBeforeNextChance(null, now, monday), false);
  const midday = kst("2026-11-17", "12:00");
  const next = nextOpenTick(midday, window);
  assert.equal(dueBeforeNextChance(kst("2026-11-16", "12:03").toISOString(), midday, next), true); // ends 12:03, next tick 12:05
  assert.equal(dueBeforeNextChance(kst("2026-11-16", "12:30").toISOString(), midday, next), false); // later ticks still make it
});

test("plan: due people first, then the newest signals up to the pace; no signal last", () => {
  const now = kst("2026-11-17", "12:00");
  const nextOpen = nextOpenTick(now, window);
  const person = (id: string, signalAt: string | null, updatedAt = "2026-11-17T00:00:00Z") => ({ id, signalAt, updatedAt });
  const people = [
    person("none", null, "2026-11-01T00:00:00Z"),
    person("old", kst("2026-11-10", "10:00").toISOString()),
    person("due", kst("2026-11-16", "12:02").toISOString()),
    person("fresh", kst("2026-11-17", "11:00").toISOString()),
    person("fresher", kst("2026-11-17", "11:30").toISOString()),
  ];
  assert.deepEqual([...people].sort(bySignalFirst).map((item) => item.id), ["fresher", "fresh", "due", "old", "none"]);
  const ids = (pace: number, max = 6, dueMax = 20) =>
    planSends(people, { now, nextOpen, pace, max, dueMax }).map((item) => `${item.person.id}${item.due ? "!" : ""}`);
  assert.deepEqual(ids(0), ["due!"]); // a skipped tick still sends the due one
  assert.deepEqual(ids(1), ["due!"]);
  assert.deepEqual(ids(3), ["due!", "fresher", "fresh"]);
  assert.deepEqual(ids(10, 4), ["due!", "fresher", "fresh", "old"]);
  assert.deepEqual(ids(10, 6, 0), ["fresher", "fresh", "due", "old", "none"]);
});

test("hours from the signal to the mail", () => {
  assert.equal(hoursFromSignal("2026-11-17T00:00:00Z", "2026-11-17T05:30:00Z"), 5.5);
  assert.equal(hoursFromSignal("2026-11-17T06:00:00Z", "2026-11-17T05:00:00Z"), 0);
  assert.equal(hoursFromSignal(null, "2026-11-17T05:00:00Z"), null);
  assert.equal(signalDelayLabel(5.5), "6시간");
  assert.equal(signalDelayLabel(72), "3일");
});
