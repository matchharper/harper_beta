import assert from "node:assert/strict";
import test from "node:test";
import { sortOrgRolesForRecentList } from "@/lib/org/recentRoles";
import type { OrgRole } from "@/lib/org/server";

function role(args: {
  createdAt: string;
  lastConversationAt?: string | null;
  roleId: string;
  status?: string | null;
}): OrgRole {
  return {
    criteria: [],
    createdAt: args.createdAt,
    description: null,
    employmentTypes: [],
    externalJdUrl: null,
    lastConversationAt: args.lastConversationAt ?? null,
    locationText: null,
    name: args.roleId,
    request: null,
    roleId: args.roleId,
    status: args.status ?? "active",
    updatedAt: args.createdAt,
    workMode: null,
    workspaceId: "workspace",
  };
}

test("sorts Recent roles by status first, then creation date", () => {
  const sorted = sortOrgRolesForRecentList([
    role({
      createdAt: "2026-08-10T12:00:00.000Z",
      roleId: "ended-newest",
      status: "ended",
    }),
    role({
      createdAt: "2026-08-01T12:00:00.000Z",
      roleId: "draft-oldest",
      status: "draft",
    }),
    role({
      createdAt: "2026-08-09T12:00:00.000Z",
      lastConversationAt: "2026-08-10T11:00:00.000Z",
      roleId: "active-older",
      status: "active",
    }),
    role({
      createdAt: "2026-08-10T12:00:00.000Z",
      roleId: "active-newer",
      status: "top_priority",
    }),
    role({
      createdAt: "2026-08-11T12:00:00.000Z",
      roleId: "paused-newest",
      status: "paused",
    }),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.roleId),
    [
      "draft-oldest",
      "active-newer",
      "active-older",
      "paused-newest",
      "ended-newest",
    ]
  );
});

test("uses the role ID to keep same-status and same-date ordering stable", () => {
  const sorted = sortOrgRolesForRecentList([
    role({
      createdAt: "2026-08-10T12:00:00.000Z",
      roleId: "role-z",
    }),
    role({
      createdAt: "2026-08-10T12:00:00.000Z",
      roleId: "role-a",
    }),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.roleId),
    ["role-a", "role-z"]
  );
});
