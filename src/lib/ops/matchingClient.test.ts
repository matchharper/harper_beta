import assert from "node:assert/strict";
import test from "node:test";
import type {
  OpsMatchingFitItem,
  OpsMatchingFitListResponse,
  OpsMatchingReviewBoardResponse,
  OpsMatchingReviewItem,
  OpsMatchingTalentItem,
  OpsMatchingTalentListResponse,
} from "./matching";
import {
  applyOpsMatchingFitHumanLabelToFitList,
  applyOpsMatchingFitHumanLabelToTalentList,
  applyOpsMatchingReviewStageUpdate,
  buildPendingOpsMatchingFitHumanLabelIds,
  buildPendingOpsMatchingReviewStageMap,
} from "./matchingClient";

function buildReviewItem(
  talentId: string,
  stage: OpsMatchingReviewItem["stage"]
) {
  return {
    recommendationId: `recommendation-${talentId}`,
    stage,
    talent: {
      tags: [{ id: `old-tag-${talentId}`, tag: "기존 태그" }],
      userId: talentId,
    } as OpsMatchingTalentItem,
  } as OpsMatchingReviewItem;
}

test("tracks concurrent review-stage mutations per talent and role", () => {
  const pending = buildPendingOpsMatchingReviewStageMap(
    [
      { roleId: "role-1", stage: "archived", talentId: "talent-1" },
      { roleId: "role-1", stage: "process_stopped", talentId: "talent-2" },
      { roleId: "role-2", stage: "archived", talentId: "talent-3" },
    ],
    "role-1"
  );

  assert.deepEqual(Array.from(pending.entries()), [
    ["talent-1", "archived"],
    ["talent-2", "process_stopped"],
  ]);
});

test("applies a completed stage mutation to only the matching review card", () => {
  const current = {
    customStages: [],
    items: [
      buildReviewItem("talent-1", "accepted"),
      buildReviewItem("talent-2", "pending_connection"),
    ],
    roleId: "role-1",
    totalCount: 2,
  } satisfies OpsMatchingReviewBoardResponse;
  const next = applyOpsMatchingReviewStageUpdate(current, {
    ok: true,
    roleId: "role-1",
    stage: "archived",
    tags: [{ id: "archive-tag", tag: "내부:아카이브" }],
    talentId: "talent-1",
  });

  assert.equal(next?.items[0]?.stage, "archived");
  assert.deepEqual(next?.items[0]?.talent.tags, [
    { id: "archive-tag", tag: "내부:아카이브" },
  ]);
  assert.equal(next?.items[1], current.items[1]);
});

test("tracks concurrent human-label mutations per fit", () => {
  const pending = buildPendingOpsMatchingFitHumanLabelIds([
    { fitId: "fit-1", humanLabel: "fit" },
    { fitId: "fit-2", humanLabel: "hold" },
  ]);

  assert.deepEqual(Array.from(pending), ["fit-1", "fit-2"]);
});

test("applies a human-label response across fit and talent list cache shapes", () => {
  const talent = {
    fit: {
      effectiveLabel: "hold",
      fitId: "fit-1",
      humanLabel: null,
      humanReason: null,
      humanReviewedAt: null,
      humanReviewedBy: null,
    },
    userId: "talent-1",
  } as OpsMatchingTalentItem;
  const fit = {
    effectiveLabel: "hold",
    fitId: "fit-1",
    humanLabel: null,
    humanReason: null,
    humanReviewedAt: null,
    humanReviewedBy: null,
    talent,
  } as OpsMatchingFitItem;
  const update = {
    effectiveLabel: "fit",
    fitId: "fit-1",
    humanLabel: "fit" as const,
    humanReason: "manual review",
    humanReviewedAt: "2026-07-29T12:00:00.000Z",
    humanReviewedBy: "ops@matchharper.com",
  };
  const fitList = {
    items: [fit],
  } as OpsMatchingFitListResponse;
  const talentList = {
    items: [talent],
  } as OpsMatchingTalentListResponse;

  const nextFitList = applyOpsMatchingFitHumanLabelToFitList(fitList, update);
  const nextTalentList = applyOpsMatchingFitHumanLabelToTalentList(
    talentList,
    update
  );

  assert.equal(nextFitList?.items[0]?.humanLabel, "fit");
  assert.equal(nextFitList?.items[0]?.talent.fit?.humanReason, "manual review");
  assert.equal(nextTalentList?.items[0]?.fit?.effectiveLabel, "fit");
  assert.equal(
    nextTalentList?.items[0]?.fit?.humanReviewedBy,
    update.humanReviewedBy
  );
});
