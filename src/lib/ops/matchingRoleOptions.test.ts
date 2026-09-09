import assert from "node:assert/strict";
import test from "node:test";
import {
  getOpsMatchingRoleOptionLabel,
  OPS_MATCHING_ROLE_OPTION_STATUSES,
} from "./matchingRoleOptions";

test("matching role options include paused and ended roles", () => {
  assert.deepEqual(OPS_MATCHING_ROLE_OPTION_STATUSES, [
    "active",
    "top_priority",
    "paused",
    "ended",
  ]);
});

test("matching role option labels mark inactive roles", () => {
  assert.equal(
    getOpsMatchingRoleOptionLabel({ roleName: "Engineer", status: "paused" }),
    "Role: Engineer · 중단"
  );
  assert.equal(
    getOpsMatchingRoleOptionLabel({ roleName: "Designer", status: "ended" }),
    "Role: Designer · 종료"
  );
  assert.equal(
    getOpsMatchingRoleOptionLabel({ roleName: "PM", status: "active" }),
    "Role: PM"
  );
});
