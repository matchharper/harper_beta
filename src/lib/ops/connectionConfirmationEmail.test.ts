import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateInternalConnectionConfirmationScheduledAt,
  isInternalConnectionWorkingTime,
} from "./connectionConfirmationSchedule";

test("schedules exactly 24 hours after acceptance inside KST working time", () => {
  const scheduledAt = calculateInternalConnectionConfirmationScheduledAt({
    acceptedAt: new Date("2026-07-27T01:00:00.000Z"),
    stageChangedAt: new Date("2026-07-27T03:00:00.000Z"),
  });

  assert.equal(scheduledAt.toISOString(), "2026-07-28T01:00:00.000Z");
});

test("moves an after-hours acceptance boundary to next KST 08:00", () => {
  const scheduledAt = calculateInternalConnectionConfirmationScheduledAt({
    acceptedAt: new Date("2026-07-27T11:00:00.000Z"),
    stageChangedAt: new Date("2026-07-28T01:00:00.000Z"),
  });

  assert.equal(scheduledAt.toISOString(), "2026-07-28T23:00:00.000Z");
});

test("moves an early stage change to the same KST day at 08:00", () => {
  const scheduledAt = calculateInternalConnectionConfirmationScheduledAt({
    acceptedAt: new Date("2026-07-25T01:00:00.000Z"),
    stageChangedAt: new Date("2026-07-28T22:00:00.000Z"),
  });

  assert.equal(scheduledAt.toISOString(), "2026-07-28T23:00:00.000Z");
});

test("treats 19:00 KST as outside the automatic delivery window", () => {
  assert.equal(
    isInternalConnectionWorkingTime(new Date("2026-07-27T09:59:59.999Z")),
    true
  );
  assert.equal(
    isInternalConnectionWorkingTime(new Date("2026-07-27T10:00:00.000Z")),
    false
  );
});
