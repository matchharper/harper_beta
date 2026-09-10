import assert from "node:assert/strict";
import test from "node:test";
import {
  compileOpsDebugInternalMatching,
  normalizeInternalMatchingDateRange,
  type InternalMatchingRecommendationSourceRow,
} from "./internalMatchingAnalytics";

function recommendation(
  overrides: Partial<InternalMatchingRecommendationSourceRow> & {
    exposureId: string;
    roleId: string;
    talentId: string;
  }
): InternalMatchingRecommendationSourceRow {
  return {
    clickedAt: null,
    companyName: "Acme",
    feedback: null,
    feedbackAt: null,
    isAuto: true,
    processedStage: null,
    recommendedAt: "2026-09-01T01:00:00.000Z",
    roleName: "Engineer",
    testOnly: false,
    updatedAt: "2026-09-01T01:00:00.000Z",
    viewedAt: null,
    ...overrides,
  };
}

test("normalizes a reversed KST date range", () => {
  const range = normalizeInternalMatchingDateRange({
    from: "2026-09-07",
    to: "2026-09-01",
  });

  assert.equal(range?.from, "2026-09-01");
  assert.equal(range?.to, "2026-09-07");
  assert.equal(
    new Date(range?.startMs ?? 0).toISOString(),
    "2026-08-31T15:00:00.000Z"
  );
});

test("deduplicates recommendation rows and compiles conversion quality", () => {
  const result = compileOpsDebugInternalMatching({
    from: "2026-09-01",
    generatedAt: "2026-09-30T00:00:00.000Z",
    progress: [
      {
        createdAt: "2026-09-05T00:00:00.000Z",
        metadata: {
          previousStage: "pending_connection",
          stage: "custom:first-interview",
        },
        roleId: "role-a",
        talentId: "talent-a",
      },
    ],
    recommendations: [
      recommendation({
        exposureId: "exposure-a-1",
        recommendedAt: "2026-09-01T01:00:00.000Z",
        roleId: "role-a",
        talentId: "talent-a",
        viewedAt: "2026-09-01T02:00:00.000Z",
      }),
      recommendation({
        clickedAt: "2026-09-02T01:00:00.000Z",
        exposureId: "exposure-a-2",
        feedback: "like",
        feedbackAt: "2026-09-02T01:00:00.000Z",
        recommendedAt: "2026-09-01T03:00:00.000Z",
        roleId: "role-a",
        talentId: "talent-a",
        updatedAt: "2026-09-02T01:00:00.000Z",
      }),
      recommendation({
        exposureId: "exposure-b",
        feedback: "dislike",
        feedbackAt: "2026-09-03T01:00:00.000Z",
        recommendedAt: "2026-09-02T01:00:00.000Z",
        roleId: "role-b",
        talentId: "talent-b",
        updatedAt: "2026-09-03T01:00:00.000Z",
      }),
      recommendation({
        exposureId: "exposure-c",
        recommendedAt: "2026-09-03T01:00:00.000Z",
        roleId: "role-c",
        talentId: "talent-c",
      }),
      recommendation({
        exposureId: "test-exposure",
        roleId: "test-role",
        talentId: "test-talent",
        testOnly: true,
      }),
      recommendation({
        exposureId: "previous-exposure",
        feedback: "like",
        feedbackAt: "2026-08-29T01:00:00.000Z",
        recommendedAt: "2026-08-28T01:00:00.000Z",
        roleId: "previous-role",
        talentId: "previous-talent",
        updatedAt: "2026-08-29T01:00:00.000Z",
      }),
    ],
    tags: [
      {
        createdAt: "2026-09-06T00:00:00.000Z",
        roleId: "role-a",
        tag: "내부:아카이브",
        tagId: "tag-a",
        talentId: "talent-a",
        updatedAt: "2026-09-06T00:00:00.000Z",
      },
    ],
    to: "2026-09-07",
  });

  assert.equal(result.summary.cohortPairCount, 3);
  assert.equal(result.summary.exposureCount, 4);
  assert.equal(result.summary.repeatedPairCount, 1);
  assert.equal(result.summary.acceptedCount, 1);
  assert.equal(result.summary.rejectedCount, 1);
  assert.equal(result.summary.respondedCount, 2);
  assert.equal(result.summary.acceptedArchivedCount, 1);
  assert.equal(result.summary.connectionReachedCount, 1);
  assert.equal(result.summary.processEnteredCount, 1);
  assert.equal(result.summary.staleNoResponseCount, 1);
  assert.equal(result.summary.viewedCount, 1);
  assert.equal(result.summary.clickedCount, 1);
  assert.equal(result.comparison?.cohortPairCount, 1);
  assert.equal(result.comparison?.acceptedCount, 1);
  assert.equal(
    result.stages.find((stage) => stage.id === "archived")?.count,
    1
  );
});

test("uses the latest internal tag before processed stage and feedback", () => {
  const result = compileOpsDebugInternalMatching({
    generatedAt: "2026-09-07T00:00:00.000Z",
    progress: [],
    recommendations: [
      recommendation({
        exposureId: "exposure-a",
        feedback: "dislike",
        processedStage: "rejected",
        roleId: "role-a",
        talentId: "talent-a",
      }),
    ],
    tags: [
      {
        createdAt: "2026-09-01T02:00:00.000Z",
        roleId: "role-a",
        tag: "내부:수락",
        tagId: "tag-a",
        talentId: "talent-a",
        updatedAt: "2026-09-01T02:00:00.000Z",
      },
      {
        createdAt: "2026-09-01T03:00:00.000Z",
        roleId: "role-a",
        tag: "내부:연결대기",
        tagId: "tag-b",
        talentId: "talent-a",
        updatedAt: "2026-09-01T03:00:00.000Z",
      },
    ],
  });

  assert.equal(result.summary.acceptedCount, 1);
  assert.equal(result.summary.rejectedCount, 0);
  assert.equal(result.summary.connectionReachedCount, 1);
  assert.equal(
    result.stages.find((stage) => stage.id === "pending_connection")?.count,
    1
  );
});

test("filters automatic and manual roles without counting test roles", () => {
  const recommendations = [
    recommendation({
      exposureId: "auto",
      isAuto: true,
      roleId: "auto-role",
      talentId: "talent-a",
    }),
    recommendation({
      exposureId: "manual",
      isAuto: false,
      roleId: "manual-role",
      talentId: "talent-b",
    }),
  ];

  const automatic = compileOpsDebugInternalMatching({
    progress: [],
    recommendations,
    roleMode: "auto",
    tags: [],
  });
  const manual = compileOpsDebugInternalMatching({
    progress: [],
    recommendations,
    roleMode: "manual",
    tags: [],
  });

  assert.equal(automatic.summary.cohortPairCount, 1);
  assert.equal(manual.summary.cohortPairCount, 1);
  assert.equal(automatic.breakdown[0]?.roleId, "auto-role");
  assert.equal(manual.breakdown[0]?.roleId, "manual-role");
});
