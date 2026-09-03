import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateCareerActivityEvents,
  toKstDateOnly,
  toKstEndExclusiveIso,
  toKstStartIso,
} from "./utils";

test("uses KST boundaries for date conversion", () => {
  assert.equal(toKstStartIso("2026-04-01"), "2026-03-31T15:00:00.000Z");
  assert.equal(toKstEndExclusiveIso("2026-04-01"), "2026-04-01T15:00:00.000Z");
  assert.equal(toKstDateOnly("2026-03-31T15:00:00.000Z"), "2026-04-01");
});

test("deduplicates people while preserving activity event counts", () => {
  const result = aggregateCareerActivityEvents({
    endDate: "2026-04-02",
    events: [
      {
        kind: "signup",
        occurredAt: "2026-04-01T00:00:00.000Z",
        userId: "talent-1",
      },
      {
        kind: "visit",
        occurredAt: "2026-04-01T01:00:00.000Z",
        userId: "talent-1",
      },
      {
        kind: "textChat",
        occurredAt: "2026-04-01T02:00:00.000Z",
        userId: "talent-1",
      },
      {
        kind: "textChat",
        occurredAt: "2026-04-01T03:00:00.000Z",
        userId: "talent-1",
      },
      {
        kind: "feedback",
        occurredAt: "2026-04-02T01:00:00.000Z",
        userId: "talent-2",
      },
    ],
    interval: "day",
    startDate: "2026-04-01",
  });

  assert.equal(result.buckets.length, 2);
  assert.deepEqual(result.buckets[0], {
    activityCount: 2,
    careerVisitorCount: 1,
    emailCount: 0,
    endDate: "2026-04-01",
    feedbackCount: 0,
    interactingTalentCount: 1,
    label: "04.01",
    liveDbTalentCount: 1,
    positionViewCount: 0,
    signupCount: 1,
    startDate: "2026-04-01",
    textChatCount: 2,
    voiceCount: 0,
  });
  assert.equal(result.totals.activityCount, 3);
  assert.equal(result.totals.interactingTalentCount, 2);
  assert.equal(result.totals.liveDbTalentCount, 2);
});

test("recomputes unique people for weekly buckets and clips edge labels", () => {
  const result = aggregateCareerActivityEvents({
    endDate: "2026-04-12",
    events: [
      {
        kind: "voice",
        occurredAt: "2026-04-01T00:00:00.000Z",
        userId: "talent-1",
      },
      {
        kind: "email",
        occurredAt: "2026-04-04T00:00:00.000Z",
        userId: "talent-1",
      },
      {
        kind: "positionView",
        occurredAt: "2026-04-07T00:00:00.000Z",
        userId: "talent-1",
      },
    ],
    interval: "week",
    startDate: "2026-04-01",
  });

  assert.equal(result.buckets.length, 2);
  assert.equal(result.buckets[0].startDate, "2026-04-01");
  assert.equal(result.buckets[0].endDate, "2026-04-05");
  assert.equal(result.buckets[0].interactingTalentCount, 1);
  assert.equal(result.buckets[0].activityCount, 2);
  assert.equal(result.buckets[1].interactingTalentCount, 1);
  assert.equal(result.totals.interactingTalentCount, 1);
});
