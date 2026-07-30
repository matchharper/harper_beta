import assert from "node:assert/strict";
import test from "node:test";
import {
  getOrgRoleLifecycleUpdate,
  normalizeOrgRoleStatus,
} from "./roleStatus";

test("soft-deletes a role with values allowed by company_roles", () => {
  assert.deepEqual(getOrgRoleLifecycleUpdate("delete"), {
    isExpired: true,
    status: "ended",
  });
});

test("maps the legacy deleted status to ended", () => {
  assert.equal(normalizeOrgRoleStatus("deleted"), "ended");
});

test("preserves supported role statuses and defaults invalid values", () => {
  assert.equal(normalizeOrgRoleStatus("top_priority"), "top_priority");
  assert.equal(normalizeOrgRoleStatus("paused"), "paused");
  assert.equal(normalizeOrgRoleStatus("not-a-status"), "active");
});
