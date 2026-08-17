import assert from "node:assert/strict";
import test from "node:test";

import {
  createOpportunityRunMarker,
  ensureOpportunityRunMarker,
  extractOpportunityRunMarkers,
  stripOpportunityRunMarkers,
} from "./messageMarker";

const RUN_ID = "00000000-0000-4000-8000-000000000001";
const MIXED_CASE_RUN_ID = "A0B1C2D3-E4F5-4A6B-8C9D-E0F1A2B3C4D5";

test("creates and extracts a canonical opportunity run marker", () => {
  const marker = createOpportunityRunMarker(RUN_ID, "same_request");
  assert.equal(
    marker,
    `[opportunity_run](/career?opportunityRunId=${RUN_ID}&relation=same_request)`
  );
  assert.deepEqual(extractOpportunityRunMarkers(`접수했어요.\n\n${marker}`), [
    { relation: "same_request", runId: RUN_ID },
  ]);
});

test("accepts legacy missing relation but rejects invalid IDs and relations", () => {
  assert.deepEqual(
    extractOpportunityRunMarkers(
      `[opportunity_run](/career?opportunityRunId=${RUN_ID})`
    ),
    [{ relation: "accepted", runId: RUN_ID }]
  );
  assert.deepEqual(
    extractOpportunityRunMarkers(
      [
        "[opportunity_run](/career?opportunityRunId=not-a-uuid&relation=accepted)",
        `[opportunity_run](/career?opportunityRunId=${RUN_ID}&relation=completed)`,
        `[posting](${RUN_ID})`,
      ].join("\n")
    ),
    []
  );
});

test("normalizes UUID casing for stable owner-scoped lookups", () => {
  const canonicalRunId = MIXED_CASE_RUN_ID.toLowerCase();
  assert.equal(
    createOpportunityRunMarker(MIXED_CASE_RUN_ID),
    `[opportunity_run](/career?opportunityRunId=${canonicalRunId}&relation=accepted)`
  );
  assert.deepEqual(
    extractOpportunityRunMarkers(
      `[opportunity_run](/career?opportunityRunId=${MIXED_CASE_RUN_ID}&relation=accepted)`
    ),
    [{ relation: "accepted", runId: canonicalRunId }]
  );
});

test("strips only standalone marker lines and normalizes to one server marker", () => {
  const input = [
    "검색을 접수했어요.",
    "",
    `[opportunity_run](/career?opportunityRunId=${RUN_ID}&relation=accepted)`,
    `[opportunity_run](/career?opportunityRunId=${RUN_ID}&relation=bad)`,
  ].join("\n");

  assert.equal(stripOpportunityRunMarkers(input), "검색을 접수했어요.");
  assert.equal(
    ensureOpportunityRunMarker(input, {
      relation: "blocking_other_request",
      runId: RUN_ID,
    }),
    [
      "검색을 접수했어요.",
      "",
      `[opportunity_run](/career?opportunityRunId=${RUN_ID}&relation=blocking_other_request)`,
    ].join("\n")
  );
});

test("does not extract inline links and removes foreign or malformed relation links", () => {
  const content = [
    `본문 [opportunity_run](/career?opportunityRunId=${RUN_ID}&relation=accepted) 안쪽`,
    "[opportunity_run](https://example.com/private)",
    `[opportunity_run](/career?opportunityRunId=${RUN_ID}&relation=not_valid)`,
  ].join("\n");
  assert.deepEqual(extractOpportunityRunMarkers(content), []);
  assert.equal(stripOpportunityRunMarkers(content), "본문  안쪽");
});

test("rejects an invalid run ID when creating a marker", () => {
  assert.throws(() => createOpportunityRunMarker("not-a-uuid"));
});

test("hides an incomplete marker while a receipt is streaming", () => {
  assert.equal(
    stripOpportunityRunMarkers("검색을 접수했어요.\n\n[opportunity_run](/care"),
    "검색을 접수했어요."
  );
});
