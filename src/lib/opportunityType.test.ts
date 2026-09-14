import assert from "node:assert/strict";
import test from "node:test";
import {
  compareNewOpportunityHistoryOrder,
  OpportunityType,
  paginateNewOpportunityHistory,
} from "./opportunityType";

type HistoryOrderFixture = Parameters<
  typeof compareNewOpportunityHistoryOrder
>[0];

const buildFixture = (
  id: string,
  overrides: Partial<HistoryOrderFixture> = {}
): HistoryOrderFixture => ({
  id,
  isInternal: false,
  opportunityType: OpportunityType.ExternalJd,
  recommendedAt: "2026-09-10T00:00:00.000Z",
  ...overrides,
});

test("orders new opportunities by the shared product priority", () => {
  const items = [
    buildFixture("external-newest", {
      recommendedAt: "2026-09-11T00:00:00.000Z",
    }),
    buildFixture("internal-recommendation", {
      isInternal: true,
      opportunityType: OpportunityType.InternalRecommendation,
    }),
    buildFixture("intro-request", {
      isInternal: true,
      opportunityType: OpportunityType.IntroRequest,
      recommendedAt: "2026-09-09T00:00:00.000Z",
    }),
    buildFixture("external-older", {
      recommendedAt: "2026-09-09T00:00:00.000Z",
    }),
  ];

  assert.deepEqual(
    items.sort(compareNewOpportunityHistoryOrder).map((item) => item.id),
    [
      "intro-request",
      "internal-recommendation",
      "external-newest",
      "external-older",
    ]
  );
});

test("uses the opportunity id as a stable final ordering key", () => {
  const items = [
    buildFixture("role-c"),
    buildFixture("role-a"),
    buildFixture("role-b"),
  ];

  assert.deepEqual(
    items.sort(compareNewOpportunityHistoryOrder).map((item) => item.id),
    ["role-a", "role-b", "role-c"]
  );
});

test("returns a stable ten-item first page without reshuffling later pages", () => {
  const items = Array.from({ length: 13 }, (_, index) =>
    buildFixture(`role-${String(index).padStart(2, "0")}`, {
      recommendedAt: new Date(Date.UTC(2026, 8, 11, 0, index)).toISOString(),
    })
  ).reverse();
  const expectedOrder = [...items].sort(compareNewOpportunityHistoryOrder);

  const firstPage = paginateNewOpportunityHistory(items, 0, 10);
  const secondPage = paginateNewOpportunityHistory(items, 10, 10);

  assert.equal(firstPage.items.length, 10);
  assert.equal(firstPage.nextOffset, 10);
  assert.equal(secondPage.items.length, 3);
  assert.equal(secondPage.nextOffset, null);
  assert.deepEqual(
    [...firstPage.items, ...secondPage.items].map((item) => item.id),
    expectedOrder.map((item) => item.id)
  );
});
