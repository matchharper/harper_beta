import assert from "node:assert/strict";
import test from "node:test";

import {
  isRecommendJobPostingSearchStopped,
  splitRecommendJobPostingStatusLogs,
  upsertRecommendJobPostingStatusLog,
} from "./recommendJobPostingStatus";

test("persists stopped status while preserving ordinary thinking logs", () => {
  const logs = upsertRecommendJobPostingStatusLog(
    ["Searching roles", "[[recommend_job_postings:running]]"],
    { state: "stopped" }
  );

  assert.deepEqual(logs, [
    "Searching roles",
    "[[recommend_job_postings:stopped]]",
  ]);
  assert.equal(isRecommendJobPostingSearchStopped(logs), true);
  assert.deepEqual(splitRecommendJobPostingStatusLogs(logs), {
    latestStatus: { state: "stopped" },
    textLogs: ["Searching roles"],
  });
});

test("does not treat an earlier stopped marker as current after replacement", () => {
  const logs = upsertRecommendJobPostingStatusLog(
    ["[[recommend_job_postings:stopped]]"],
    { candidateCount: 12, recommendationCount: 4, state: "completed" }
  );

  assert.equal(isRecommendJobPostingSearchStopped(logs), false);
  assert.deepEqual(logs, [
    "[[recommend_job_postings:completed:candidates=12:recommendations=4]]",
  ]);
});
