import assert from "node:assert/strict";
import test from "node:test";
import { queryKeys } from "@/lib/queryKeys";

test("isolates general company chat and every role creation history", () => {
  const general = queryKeys.org.agentMessages({ workspaceId: "workspace-1" });
  const firstRole = queryKeys.org.agentMessages({
    mode: "role_creation",
    roleId: "role-1",
    workspaceId: "workspace-1",
  });
  const secondRole = queryKeys.org.agentMessages({
    mode: "role_creation",
    roleId: "role-2",
    workspaceId: "workspace-1",
  });

  assert.notDeepEqual(general, firstRole);
  assert.notDeepEqual(firstRole, secondRole);
});
