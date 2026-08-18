import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const settings = source(
  "../../components/org/role-overview/OrgRoleSettingsContent.tsx"
);
const server = source("./server.ts");

test("only matchharper.com users can activate a draft role from Settings", () => {
  assert.match(settings, /internalOpsAccess/);
  assert.match(settings, /roleCreation \? \([\s\S]*internalOpsAccess/);
  assert.match(server, /hasOrgAllWorkspaceAccess\(args\.user\)/);
  assert.match(server, /complete_company_role_creation_v1/);
  assert.match(
    server,
    /currentRoleStatus === "draft" && requestedStatus !== "draft"/
  );
});
