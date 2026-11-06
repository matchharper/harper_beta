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


test("service capability loading provides ordinary research without membership mutations", async () => {
  const { companyAgentServiceTools } = await import("./companyScope");
  const { resolveCompanyCapabilities } = await import("@/lib/org/agent/capabilities/resolver");
  const allowed = companyAgentServiceTools();
  const resolved = resolveCompanyCapabilities({surface:"chat",mode:"progressive",loaded:new Set(["agent_correspondence", "web_research", "role_management", "candidate_contact", "candidate_search"]),allowedToolNames:allowed,agentService:true});
  for(const name of ["read_role","read_talent","get_talents","web_search","open_url","contact_talent","read_agent_messages","contact_user"])
    assert.ok(resolved.offeredToolNames.has(name), name);
  for(const name of ["change_role_status","update_role_criteria","decide_company_intro","move_candidate_stage"])
    assert.ok(!resolved.offeredToolNames.has(name), name);
  const loader=resolved.tools.find(t=>t.function.name==="load_capabilities")!;
  const ids=(loader.function.parameters as any).properties.capabilityIds.items.enum;
  assert.ok(ids.includes("web_research"));
  assert.ok(!ids.includes("role_management"));
  assert.ok(!ids.includes("candidate_search"));
  assert.ok(!ids.includes("candidate_contact"));
  assert.ok(!resolved.policyIds.includes("candidate_contact"));
  const contact = resolved.tools.find(t=>t.function.name==="contact_talent")!.function.parameters as any;
  assert.deepEqual(contact.properties.action.enum,["send_to_agent"]);
  assert.equal(contact.properties.contactPurpose,undefined);
  assert.equal(contact.properties.requestContext,undefined);
  assert.ok(contact.properties.messageContent);
  const publication = resolved.tools.find(t=>t.function.name==="publish_role_recommendations")!.function.parameters as any;
  assert.ok(publication.required.includes("introductionRootId"));
  assert.equal(publication.properties.kind,undefined);
  assert.equal(publication.properties.talentIds,undefined);
  const member = resolveCompanyCapabilities({surface:"chat",mode:"full",loaded:new Set()});
  const memberContact = member.tools.find(t=>t.function.name==="contact_talent")!.function.parameters as any;
  assert.ok(memberContact.properties.action.enum.includes("create_draft"));
  assert.ok(member.policyIds.includes("candidate_contact"));
});
