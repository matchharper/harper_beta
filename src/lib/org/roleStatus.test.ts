import assert from "node:assert/strict";
import test from "node:test";
import {
  getOrgRoleStatusPresentation,
  getOrgRoleStatusFilterValue,
  getOrgRoleLifecycleUpdate,
  normalizeOrgRoleStatus,
  ORG_ROLE_STATUS_FILTER_OPTIONS,
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

test("presents every role lifecycle status with its sidebar label and tone", () => {
  assert.deepEqual(getOrgRoleStatusPresentation("draft"), {
    label: "역할 작성 중",
    status: "draft",
    tone: "action",
  });
  assert.deepEqual(getOrgRoleStatusPresentation("top_priority"), {
    label: "최우선 진행 중",
    status: "top_priority",
    tone: "primary",
  });
  assert.deepEqual(getOrgRoleStatusPresentation("active"), {
    label: "진행 중",
    status: "active",
    tone: "positive",
  });
  assert.deepEqual(getOrgRoleStatusPresentation("paused"), {
    label: "중지",
    status: "paused",
    tone: "primary",
  });
  assert.deepEqual(getOrgRoleStatusPresentation("ended"), {
    label: "종료",
    status: "ended",
    tone: "neutral",
  });
  assert.deepEqual(getOrgRoleStatusPresentation("deleted"), {
    label: "삭제됨",
    status: "deleted",
    tone: "neutral",
  });
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
