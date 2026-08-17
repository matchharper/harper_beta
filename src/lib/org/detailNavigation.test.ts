import assert from "node:assert/strict";
import test from "node:test";

import { getOrgTalentDetailNavigationState } from "./detailNavigation";

const items = [
  { recommendationId: "rec-1", roleId: "role-a", talentId: "talent-1" },
  { recommendationId: "rec-2", roleId: "role-a", talentId: "talent-2" },
  { recommendationId: "rec-3", roleId: "role-a", talentId: "talent-3" },
];

test("returns adjacent candidates and one-based position", () => {
  assert.deepEqual(
    getOrgTalentDetailNavigationState(items, {
      recommendationId: "rec-2",
      roleId: "role-a",
      talentId: "talent-2",
    }),
    {
      currentIndex: 1,
      next: items[2],
      position: 2,
      previous: items[0],
      total: 3,
    }
  );
});

test("disables navigation past the first and last candidates", () => {
  const first = getOrgTalentDetailNavigationState(items, {
    recommendationId: "rec-1",
  });
  const last = getOrgTalentDetailNavigationState(items, {
    recommendationId: "rec-3",
  });

  assert.equal(first?.previous, null);
  assert.equal(first?.next, items[1]);
  assert.equal(last?.previous, items[1]);
  assert.equal(last?.next, null);
});

test("falls back to role and talent identity without a recommendation id", () => {
  const sameTalentInAnotherRole = {
    recommendationId: "rec-4",
    roleId: "role-b",
    talentId: "talent-2",
  };
  const state = getOrgTalentDetailNavigationState(
    [...items, sameTalentInAnotherRole],
    { roleId: "role-b", talentId: "talent-2" }
  );

  assert.equal(state?.currentIndex, 3);
  assert.equal(state?.previous, items[2]);
});

test("returns null when the current candidate is outside the source list", () => {
  assert.equal(
    getOrgTalentDetailNavigationState(items, {
      recommendationId: "missing",
    }),
    null
  );
});
