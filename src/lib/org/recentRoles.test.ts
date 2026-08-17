import assert from "node:assert/strict";
import test from "node:test";
import { sortOrgRolesByRecentConversation } from "@/lib/org/recentRoles";
import type { OrgRole } from "@/lib/org/server";

function role(args: {
  createdAt: string;
  lastConversationAt?: string | null;
  roleId: string;
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
    status: "active",
    updatedAt: args.createdAt,
    workMode: null,
    workspaceId: "workspace",
  };
}

test("sorts chatted roles by last message, then untouched roles by creation", () => {
  const sorted = sortOrgRolesByRecentConversation([
    role({
      createdAt: "2026-08-10T12:00:00.000Z",
      roleId: "new-without-chat",
    }),
    role({
      createdAt: "2026-08-01T12:00:00.000Z",
      lastConversationAt: "2026-08-09T12:00:00.000Z",
      roleId: "second-chat",
    }),
    role({
      createdAt: "2026-07-01T12:00:00.000Z",
      lastConversationAt: "2026-08-10T11:00:00.000Z",
      roleId: "latest-chat",
    }),
    role({
      createdAt: "2026-08-09T12:00:00.000Z",
      roleId: "older-without-chat",
    }),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.roleId),
    ["latest-chat", "second-chat", "new-without-chat", "older-without-chat"]
  );
});
