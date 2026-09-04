import assert from "node:assert/strict";
import test from "node:test";
import type { CareerHistoryOpportunity } from "../types";
import { buildTimelineEntries } from "./TalentRoleActivityTimeline";

test("merges talent activities and confirmed meetings in reverse chronological order", () => {
  const item = {
    confirmedMeetings: [
      {
        confirmedAt: "2026-08-31T03:00:00.000Z",
        endAt: "2026-09-03T03:00:00.000Z",
        id: "future-meeting",
        startAt: "2026-09-03T02:00:00.000Z",
        title: "Interview",
      },
      {
        confirmedAt: "2026-08-18T03:00:00.000Z",
        endAt: "2026-08-20T03:00:00.000Z",
        id: "past-meeting",
        startAt: "2026-08-20T02:00:00.000Z",
        title: null,
      },
    ],
    talentRoleActivities: [
      {
        content: "Bring portfolio",
        createdAt: "2026-08-31T02:00:00.000Z",
        id: "memo",
        kind: "memo",
        previousStage: null,
        savedStage: null,
      },
    ],
  } as CareerHistoryOpportunity;

  assert.deepEqual(
    buildTimelineEntries(item).map((entry) => entry.id),
    ["meeting-future-meeting", "activity-memo", "meeting-past-meeting"]
  );
});
