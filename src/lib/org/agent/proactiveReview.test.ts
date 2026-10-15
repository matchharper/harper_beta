import assert from "node:assert/strict";
import test from "node:test";
import { proactiveReviewWindow, parseProactiveReviewAudiences, parseProactiveReviewSchedule } from "./proactiveReview.server";

test("scheduled window is weekdays 17-19 KST, with no next-day catchup", () => {
  assert.equal(proactiveReviewWindow(new Date("2026-10-15T16:59:59+09:00")).due, false);
  const window = proactiveReviewWindow(new Date("2026-10-15T17:00:00+09:00"));
  assert.equal(window.due, true);
  assert.equal(window.date, "2026-10-15");
  assert.equal(window.deadlineAt, "2026-10-15T10:00:00.000Z");
  assert.equal(proactiveReviewWindow(new Date("2026-10-15T19:00:00+09:00")).due, false);
  assert.equal(proactiveReviewWindow(new Date("2026-10-17T17:00:00+09:00")).due, false);
});
test("rollout requires an explicit unique trusted audience", () => {
  assert.deepEqual(parseProactiveReviewAudiences(undefined), []);
  assert.throws(() => parseProactiveReviewAudiences("{}"));
  assert.throws(() => parseProactiveReviewAudiences('[{"workspaceId":"w"}]'));
  assert.throws(() => parseProactiveReviewAudiences(JSON.stringify(Array(2).fill({ workspaceId: "w", channelDbId: "c", actorUserId: "u" }))));
});

test("external schedule moves the window and selected weekdays without changing defaults", () => {
  const schedule = parseProactiveReviewSchedule('{"daysOfWeek":[2,6],"startTimeKst":"09:30","windowMinutes":45}');
  assert.equal(proactiveReviewWindow(new Date("2026-10-15T09:30:00+09:00"), schedule).due, false);
  assert.equal(proactiveReviewWindow(new Date("2026-10-17T09:29:59+09:00"), schedule).due, false);
  const start = proactiveReviewWindow(new Date("2026-10-17T09:30:00+09:00"), schedule);
  assert.equal(start.due, true);
  assert.equal(start.deadlineAt, "2026-10-17T01:15:00.000Z");
  assert.equal(proactiveReviewWindow(new Date("2026-10-17T10:15:00+09:00"), schedule).due, false);
  assert.equal(proactiveReviewWindow(new Date("2026-10-15T17:00:00+09:00"), parseProactiveReviewSchedule()).due, true);
  assert.equal(proactiveReviewWindow(new Date("2026-10-15T17:00:00+09:00"), parseProactiveReviewSchedule('{"daysOfWeek":[]}')).due, false);
});

test("overnight windows keep the start-day deadline and idempotency date", () => {
  const schedule = parseProactiveReviewSchedule('{"daysOfWeek":[5],"startTimeKst":"23:30","windowMinutes":90}');
  const before = proactiveReviewWindow(new Date("2026-10-16T23:30:00+09:00"), schedule);
  const after = proactiveReviewWindow(new Date("2026-10-17T00:30:00+09:00"), schedule);
  assert.equal(before.due, true);
  assert.deepEqual(after, before);
  assert.equal(after.date, "2026-10-16");
  assert.equal(after.deadlineAt, "2026-10-16T16:00:00.000Z");
  assert.equal(proactiveReviewWindow(new Date("2026-10-17T01:00:00+09:00"), schedule).due, false);
});

test("invalid schedule values fail explicitly instead of triggering an unintended time", () => {
  for (const raw of ['[]', 'null', '{"daysOfWeek":[7]}', '{"startTimeKst":"24:00"}', '{"windowMinutes":0}', '{"windowMinutes":1441}']) {
    assert.throws(() => parseProactiveReviewSchedule(raw));
  }
});
