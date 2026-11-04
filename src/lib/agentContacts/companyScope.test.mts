import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { companyAgentScope } from "./companyScope";
import { companyContactSource } from "./companyTools";

const require = createRequire(import.meta.url);
const receiverModule = require("./companyScope.ts") as typeof import("./companyScope");

test("a receiver capability survives CJS/ESM loading and forwarding client proxies", async () => {
  let checks = 0;
  const scope = {
    kind: "company_event" as const,
    workspaceId: "workspace", roleId: "role", jobId: "job", leaseOwner: "lease",
    assertCurrent: async () => { checks++; },
  };
  const client = { value: 4, read() { return this.value; } };
  const scoped = receiverModule.withCompanyAgentScope(client, scope);
  const forwarded = new Proxy(scoped, { get: Reflect.get });
  for (const admin of [scoped, forwarded]) {
    assert.equal(companyAgentScope(admin), scope);
    assert.equal(companyContactSource({ admin, workspaceId: "workspace", userId: "job", sourceMessageId: 1 }), scope);
    await companyAgentScope(admin)!.assertCurrent();
    assert.equal(admin.read(), 4);
  }
  assert.equal(checks, 2);
  assert.equal(companyAgentScope(client), undefined);
  assert.equal(companyAgentScope(JSON.parse(JSON.stringify(scoped))), undefined);
  assert.equal(companyContactSource({ admin: client, workspaceId: "workspace", userId: "member", sourceMessageId: 1 }).kind, "company");
});
