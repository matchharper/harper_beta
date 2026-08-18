import assert from "node:assert/strict";
import test from "node:test";
import { buildOrgHref } from "@/lib/org/routes";

test("uses separate canonical URLs for company information and members", () => {
  assert.equal(
    buildOrgHref({ orgId: "workspace-id", page: "team" }),
    "/org/team?orgId=workspace-id"
  );
  assert.equal(
    buildOrgHref({ orgId: "workspace-id", page: "member" }),
    "/org/member?orgId=workspace-id"
  );
});

test("keeps new role creation separate from an existing role workspace", () => {
  assert.equal(
    buildOrgHref({ orgId: "workspace-id", page: "new-role" }),
    "/org/new?orgId=workspace-id"
  );
  assert.equal(
    buildOrgHref({
      orgId: "workspace-id",
      page: "role",
      roleId: "role-id",
    }),
    "/org/role?orgId=workspace-id&roleId=role-id"
  );
});

test("builds the role pipeline tab URL separately from the all-roles page", () => {
  assert.equal(
    buildOrgHref({
      orgId: "workspace-id",
      page: "role",
      roleId: "role-id",
      tab: "pipeline",
      view: "board",
    }),
    "/org/role?orgId=workspace-id&roleId=role-id&tab=pipeline&view=board"
  );
});
