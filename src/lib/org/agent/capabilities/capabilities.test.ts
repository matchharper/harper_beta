import assert from "node:assert/strict";
import test from "node:test";
import { COMPANY_BASE_TOOLS, COMPANY_CAPABILITIES, type CompanyCapabilityId } from "./registry";
import { getCompanyPolicy } from "./policies";
import { loadCompanyCapabilities } from "./loader";
import { continuationCapabilities, resolveCompanyCapabilities } from "./resolver";
import type { OrgAgentConversationInput } from "../conversationInput";
import { getEnabledOrgAgentTools } from "../tools";
import { buildCompanySystemInput } from "../input";

test("each domain tool has exactly one base or capability owner", () => {
  const names = [...COMPANY_BASE_TOOLS, ...COMPANY_CAPABILITIES.flatMap((c) => [...c.toolIds])];
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual([...names].sort(), getEnabledOrgAgentTools("slack").map((t) => t.function.name).sort());
  for (const c of COMPANY_CAPABILITIES) for (const id of c.policyIds) assert.ok(getCompanyPolicy(id, "slack").length > 0);
});

test("initial request includes core communication, deferring heavy schemas AND detailed policies", () => {
  const resolved = resolveCompanyCapabilities({ surface: "slack", mode: "progressive", loaded: new Set() });
  assert.deepEqual([...resolved.offeredToolNames].sort(), [...COMPANY_BASE_TOOLS, "list_contacts", "read_contact", "contact_talent", "load_capabilities"].sort());
  assert.deepEqual(resolved.policyIds, ["candidate_contact"]);
  const system = buildCompanySystemInput({ resolved, surface: "slack" });
  for (const c of COMPANY_CAPABILITIES) assert.ok(system.includes(c.id));
  assert.ok(!system.includes("<hiring_brief_authoring_contract>"));
  assert.ok(!JSON.stringify(resolved.tools).includes('"update_data"'));
});

test("continuation warms only the last real Harper turn's actual tools, never user/candidate text", () => {
  const row = (toolNames: string[], source: OrgAgentConversationInput["source"] = "harper", role: OrgAgentConversationInput["role"] = "assistant"): OrgAgentConversationInput => ({
    id: 1, role, source, toolNames, content: "contact_talent update_data", speaker: "test", references: "", complete: true,
  });
  assert.deepEqual([...continuationCapabilities([row(["contact_talent", "invented"]), row(["update_data"], "company", "user"), row(["update_data"], "candidate_contact")])], ["candidate_contact"]);
  assert.equal(continuationCapabilities([row(["contact_talent"]), row(["read_talent"]) ]).size, 0);
  assert.equal(continuationCapabilities([row([])]).size, 0);
  assert.equal(continuationCapabilities().size, 0);
});

test("load is atomic, idempotent and shares policy once in deterministic order", () => {
  const loaded = new Set<CompanyCapabilityId>();
  assert.equal(loadCompanyCapabilities({ capabilityIds: ["candidate_contact", "invented"] }, loaded, "slack").ok, false);
  assert.equal(loaded.size, 0);
  assert.equal(loadCompanyCapabilities({ capabilityIds: ["role_calibration", "company_role_edit"] }, loaded, "slack").ok, true);
  const a = resolveCompanyCapabilities({ surface: "slack", mode: "progressive", loaded });
  assert.equal(a.policyIds.filter((id) => id === "hiring_brief").length, 1);
  assert.ok(a.offeredToolNames.has("update_data"));
  assert.ok(a.policyText.includes("<hiring_brief_authoring_contract>"));
  loadCompanyCapabilities({ capabilityIds: ["role_calibration"] }, loaded, "slack");
  assert.equal(loaded.size, 2);
  const b = resolveCompanyCapabilities({ surface: "slack", mode: "progressive", loaded: new Set(["company_role_edit", "role_calibration"]) });
  assert.deepEqual(a, b);
});

test("surface gates and full compatibility mode do not expose unsupported tools", () => {
  const loaded = new Set<CompanyCapabilityId>(["role_management"]);
  const web = resolveCompanyCapabilities({ surface: "chat", mode: "progressive", loaded });
  assert.ok(!web.offeredToolNames.has("start_role_creation"));
  const full = resolveCompanyCapabilities({ surface: "chat", mode: "full", loaded: new Set() });
  assert.ok(!full.offeredToolNames.has("load_capabilities"));
  assert.deepEqual([...full.offeredToolNames].sort(), getEnabledOrgAgentTools("chat").map((t) => t.function.name).sort());
});
