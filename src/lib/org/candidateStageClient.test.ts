import assert from "node:assert/strict";
import test from "node:test";
import type {
  OrgAcceptedTalentsResponse,
  OrgBoardItem,
  OrgBoardResponse,
  OrgTalentDetailResponse,
} from "./server";
import {
  applyOrgCandidateStageToAcceptedTalents,
  applyOrgCandidateStageToBoard,
  applyOrgCandidateStageToDetail,
  buildPendingOrgCandidateStageMap,
  getOrgCandidateStageMutationIdentity,
  type OrgCandidateStageMutationInput,
} from "./candidateStageClient";

function buildMutation(
  talentId: string,
  stage: OrgCandidateStageMutationInput["stage"],
  roleId = "role-1"
): OrgCandidateStageMutationInput {
  return {
    recommendationId: `recommendation-${talentId}`,
    roleId,
    stage,
    talentId,
    workspaceId: "workspace-1",
  };
}

test("tracks every pending candidate stage mutation by talent and role", () => {
  const first = buildMutation("talent-1", "connected");
  const second = buildMutation("talent-2", "process_stopped");
  const otherWorkspace = {
    ...buildMutation("talent-3", "connected"),
    workspaceId: "workspace-2",
  };

  const pending = buildPendingOrgCandidateStageMap(
    [first, second, otherWorkspace],
    "workspace-1"
  );

  assert.equal(pending.size, 2);
  assert.equal(
    pending.get(getOrgCandidateStageMutationIdentity(first))?.stage,
    "connected"
  );
  assert.equal(
    pending.get(getOrgCandidateStageMutationIdentity(second))?.stage,
    "process_stopped"
  );
});

test("applies a completed stage to duplicate board cards for the same pair", () => {
  const variables = buildMutation("talent-1", "connected");
  const matchingItem = {
    recommendationId: "recommendation-1",
    roleId: variables.roleId,
    stage: "pending_connection",
    stageTag: "old-tag",
    talentId: variables.talentId,
  } as OrgBoardItem;
  const duplicateItem = {
    ...matchingItem,
    recommendationId: "recommendation-2",
  };
  const otherItem = {
    ...matchingItem,
    recommendationId: "recommendation-3",
    talentId: "talent-2",
  };
  const current = {
    items: [matchingItem, duplicateItem, otherItem],
    workspaceId: variables.workspaceId,
  } as OrgBoardResponse;
  const update = {
    ok: true as const,
    roleId: variables.roleId,
    stage: variables.stage,
    stageTag: "내부:연결됨",
    talentId: variables.talentId,
  };

  const next = applyOrgCandidateStageToBoard(current, update, variables);

  assert.deepEqual(
    next?.items.map((item) => item.stage),
    ["connected", "connected", "pending_connection"]
  );
  assert.equal(next?.items[0]?.stageTag, "내부:연결됨");
});

test("keeps detail and accepted-list caches aligned with a stage response", () => {
  const variables = buildMutation("talent-1", "connected");
  const update = {
    ok: true as const,
    roleId: variables.roleId,
    stage: variables.stage,
    stageTag: "내부:연결됨",
    talentId: variables.talentId,
  };
  const detail = {
    recommendation: {
      recommendationId: variables.recommendationId,
      stage: "pending_connection",
    },
    role: { roleId: variables.roleId },
    talent: { userId: variables.talentId },
    workspace: { workspaceId: variables.workspaceId },
  } as OrgTalentDetailResponse;
  const accepted = {
    items: [
      {
        currentStage: "accepted",
        isAwaitingStageMove: true,
        roleId: variables.roleId,
        talentId: variables.talentId,
        workspaceId: variables.workspaceId,
      },
    ],
  } as OrgAcceptedTalentsResponse;

  const nextDetail = applyOrgCandidateStageToDetail(detail, update, variables);
  const nextAccepted = applyOrgCandidateStageToAcceptedTalents(
    accepted,
    update,
    variables
  );

  assert.equal(nextDetail?.recommendation.stage, "connected");
  assert.equal(nextAccepted?.items[0]?.currentStage, "connected");
  assert.equal(nextAccepted?.items[0]?.isAwaitingStageMove, false);
});
