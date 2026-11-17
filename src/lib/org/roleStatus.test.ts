import assert from "node:assert/strict";
import test from "node:test";
import {
  getOrgRoleStatusPresentation,
  getOrgRoleStatusFilterValue,
  getOrgRoleLifecycleUpdate,
  isOrgRoleCountedAsActive,
  normalizeOrgRoleStatus,
  ORG_ROLE_MUTATION_STATUS_VALUES,
  ORG_ROLE_STATUS_FILTER_OPTIONS,
  parseOrgRoleMutationStatus,
  resolveOrgRoleMutationExpiry,
} from "@/lib/org/roleStatus";

test("preserves the role creation draft lifecycle state", () => {
  assert.equal(normalizeOrgRoleStatus("draft"), "draft");
  assert.equal(normalizeOrgRoleStatus(" active "), "active");
});

test("soft deletes roles with a dedicated deleted lifecycle status", () => {
  assert.deepEqual(getOrgRoleLifecycleUpdate("delete"), {
    isExpired: true,
    status: "deleted",
  });
});

test("accepts only explicit writable lifecycle states for mutations", () => {
  for (const status of ORG_ROLE_MUTATION_STATUS_VALUES) {
    assert.equal(parseOrgRoleMutationStatus(` ${status} `), status);
  }
  for (const invalid of [
    "draft",
    "open",
    "DELETED",
    "invented",
    "",
    null,
    undefined,
  ]) {
    assert.equal(parseOrgRoleMutationStatus(invalid), null);
  }
});

test("normalizes user-visible lifecycle labels for mutations", () => {
  assert.equal(parseOrgRoleMutationStatus("진행 중"), "active");
  assert.equal(parseOrgRoleMutationStatus("중단"), "paused");
  assert.equal(parseOrgRoleMutationStatus("채용 종료"), "ended");
  assert.equal(parseOrgRoleMutationStatus("삭제됨"), "deleted");
  assert.equal(parseOrgRoleMutationStatus("open"), null);
});

test("always pairs deleted status with role expiry", () => {
  assert.equal(
    resolveOrgRoleMutationExpiry({ isExpired: undefined, status: "deleted" }),
    true
  );
  assert.equal(
    resolveOrgRoleMutationExpiry({ isExpired: false, status: "deleted" }),
    true
  );
  assert.equal(
    resolveOrgRoleMutationExpiry({ isExpired: false, status: "active" }),
    false
  );
  assert.equal(
    resolveOrgRoleMutationExpiry({ isExpired: null, status: "paused" }),
    undefined
  );
});

test("maps legacy role lifecycle aliases to the same presentation buckets", () => {
  assert.equal(getOrgRoleStatusPresentation(" pending ").status, "draft");
  assert.equal(getOrgRoleStatusPresentation("open").status, "active");
  assert.equal(getOrgRoleStatusPresentation("on_hold").status, "paused");
  assert.equal(getOrgRoleStatusPresentation("stopped").status, "ended");
  assert.equal(getOrgRoleStatusPresentation("archived").status, "ended");
});

test("groups top priority roles into the regular active sidebar filter", () => {
  assert.deepEqual(
    ORG_ROLE_STATUS_FILTER_OPTIONS.map((option) => option.status),
    ["draft", "active", "paused", "ended"]
  );
  assert.equal(getOrgRoleStatusFilterValue("top_priority"), "active");
});

test("recognizes statuses that consume active hiring capacity", () => {
  assert.equal(isOrgRoleCountedAsActive("active"), true);
  assert.equal(isOrgRoleCountedAsActive(" top_priority "), true);
  assert.equal(isOrgRoleCountedAsActive("open"), true);
  assert.equal(isOrgRoleCountedAsActive("draft"), false);
  assert.equal(isOrgRoleCountedAsActive("paused"), false);
});
