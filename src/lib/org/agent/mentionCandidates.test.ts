import assert from "node:assert/strict";
import test from "node:test";
import { filterOrgAgentMentionCandidates } from "@/lib/org/agent/mentionCandidates";
import type { OrgAgentMentionCandidate } from "@/lib/org/agent/types";

function candidate(
  overrides: Partial<OrgAgentMentionCandidate> &
    Pick<OrgAgentMentionCandidate, "label" | "roleId" | "roleName" | "talentId">
): OrgAgentMentionCandidate {
  return {
    headline: null,
    profilePicture: null,
    recommendedAt: "2026-08-10T00:00:00.000Z",
    recommendationId: `recommendation-${overrides.talentId}-${overrides.roleId}`,
    stage: "recommended",
    stageLabel: "추천",
    subtitle: "",
    ...overrides,
  };
}

test("puts current-role talent first and keeps the current-role record for duplicates", () => {
  const results = filterOrgAgentMentionCandidates({
    candidates: [
      candidate({
        label: "같은 사람",
        recommendedAt: "2026-08-10T02:00:00.000Z",
        roleId: "other-role",
        roleName: "Backend Engineer",
        talentId: "talent-shared",
      }),
      candidate({
        label: "다른 역할 사람",
        roleId: "other-role",
        roleName: "Backend Engineer",
        talentId: "talent-other",
      }),
      candidate({
        label: "같은 사람",
        recommendedAt: "2026-08-09T00:00:00.000Z",
        roleId: "current-role",
        roleName: "Founding Designer",
        talentId: "talent-shared",
      }),
    ],
    roleId: "current-role",
  });

  assert.deepEqual(
    results.map((item) => [item.talentId, item.roleId]),
    [
      ["talent-shared", "current-role"],
      ["talent-other", "other-role"],
    ]
  );
});

test("filters the cached list by talent, role, stage, and subtitle text", () => {
  const candidates = [
    candidate({
      headline: "Product-minded builder",
      label: "Alex Kim",
      roleId: "role-design",
      roleName: "Founding Designer",
      stageLabel: "인터뷰",
      subtitle: "Seoul",
      talentId: "talent-1",
    }),
  ];

  for (const query of ["alex", "designer", "인터뷰", "seoul", "builder"]) {
    assert.equal(
      filterOrgAgentMentionCandidates({ candidates, query }).length,
      1
    );
  }
  assert.equal(
    filterOrgAgentMentionCandidates({ candidates, query: "backend" }).length,
    0
  );
});
