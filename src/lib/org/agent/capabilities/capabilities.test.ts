import assert from "node:assert/strict";
import test from "node:test";
import { COMPANY_BASE_TOOLS, COMPANY_CAPABILITIES, type CompanyCapabilityId } from "./registry";
import { getCompanyPolicy } from "./policies";
import { loadCompanyCapabilities } from "./loader";
import { continuationCapabilities, resolveCompanyCapabilities } from "./resolver";
import type { OrgAgentConversationInput } from "../conversationInput";
import { getEnabledOrgAgentTools } from "../tools";
import { EXTERNAL_SOURCING_TOOL_NAMES } from "../externalSourcing";
import { buildCompanySystemInput } from "../input";

test("domain tools are discoverable, including shared correspondence capabilities", () => {
  const names = [...COMPANY_BASE_TOOLS, ...COMPANY_CAPABILITIES.flatMap((c) => [...c.toolIds])];
  // Trusted callers only: scheduled matching recommends, Harper's own review of pass reasons suggests criteria,
  // and runs Harper starts itself leave To-do suggestions.
  const trustedOnly = ["recommend_talents", "propose_criteria_change", "manage_todo_suggestions"];
  assert.deepEqual([...new Set(names)].filter(name => !trustedOnly.includes(name)).sort(), getEnabledOrgAgentTools("slack").map((t) => t.function.name).sort());
  for (const c of COMPANY_CAPABILITIES) for (const id of c.policyIds) assert.ok(getCompanyPolicy(id, "slack").length > 0);
});

test("initial request includes core communication, deferring heavy schemas AND detailed policies", () => {
  const resolved = resolveCompanyCapabilities({ surface: "slack", mode: "progressive", loaded: new Set() });
  assert.deepEqual([...resolved.offeredToolNames].sort(), [...COMPANY_BASE_TOOLS, "list_contacts", "read_contact", "read_agent_messages", "contact_talent", "load_capabilities"].sort());
  assert.deepEqual(resolved.policyIds, ["agent_correspondence", "candidate_contact"]);
  const system = buildCompanySystemInput({ resolved, surface: "slack" });
  // external_sourcing is offered only to workspaces that have it turned on (tested below);
  // criteria_proposal only to Harper's own review, never to a member's conversation.
  for (const c of COMPANY_CAPABILITIES) if (c.id !== "external_sourcing" && c.id !== "criteria_proposal" && c.id !== "todo_suggestion") assert.ok(system.includes(c.id));
  assert.ok(!system.includes("criteria_proposal"));
  assert.ok(!system.includes("todo_suggestion"));
  assert.ok(!system.includes("<hiring_brief_authoring_contract>"));
  assert.ok(!JSON.stringify(resolved.tools).includes('"update_data"'));
});

test("continuation warms only the last real Harper turn's actual tools, never user/candidate text", () => {
  const row = (toolNames: string[], source: OrgAgentConversationInput["source"] = "harper", role: OrgAgentConversationInput["role"] = "assistant"): OrgAgentConversationInput => ({
    id: 1, role, source, toolNames, content: "contact_talent update_data", speaker: "test", references: "", complete: true,
  });
  assert.deepEqual([...continuationCapabilities([row(["contact_talent", "invented"]), row(["update_data"], "company", "user"), row(["update_data"], "candidate_contact")])], ["agent_correspondence"]);
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
  assert.deepEqual([...full.offeredToolNames].sort(), getEnabledOrgAgentTools("chat").map((t) => t.function.name)
    .filter((name) => !(EXTERNAL_SOURCING_TOOL_NAMES as readonly string[]).includes(name)).sort());
});

test("external sourcing is offered only to listed workspaces, and loading cannot broaden that", () => {
  const previous = process.env.ORG_EXTERNAL_SOURCING_WORKSPACE_IDS;
  process.env.ORG_EXTERNAL_SOURCING_WORKSPACE_IDS = "w-on";
  try {
    const on = resolveCompanyCapabilities({ surface: "slack", mode: "full", loaded: new Set(), workspaceId: "w-on" });
    const off = resolveCompanyCapabilities({ surface: "slack", mode: "full", loaded: new Set(), workspaceId: "w-off" });
    assert.ok(on.offeredToolNames.has("request_external_search") && on.catalogText.includes("external_sourcing"));
    assert.ok(!off.offeredToolNames.has("request_external_search") && !off.catalogText.includes("external_sourcing"));
    assert.equal(loadCompanyCapabilities({ capabilityIds: ["external_sourcing"] }, new Set(), "slack", "w-off").ok, false);
    const loaded = new Set<CompanyCapabilityId>();
    assert.equal(loadCompanyCapabilities({ capabilityIds: ["external_sourcing"] }, loaded, "slack", "w-on").ok, true);
    const progressive = resolveCompanyCapabilities({ surface: "slack", mode: "progressive", loaded, workspaceId: "w-on" });
    assert.deepEqual(progressive.policyIds.filter((id) => id === "external_sourcing"), ["external_sourcing"]);
    assert.ok(progressive.policyText.includes("not Harper members"));
  } finally {
    if (previous === undefined) delete process.env.ORG_EXTERNAL_SOURCING_WORKSPACE_IDS;
    else process.env.ORG_EXTERNAL_SOURCING_WORKSPACE_IDS = previous;
  }
});

test("To-do suggestions: offered in runs Harper starts itself, never in a member's conversation", async () => {
  const { companyAgentCorrespondenceTools, companyAgentServiceTools } = await import("@/lib/agentContacts/companyScope");
  const { SCHEDULED_MATCHING_TOOLS } = await import("../scheduledMatching");
  const tool = "manage_todo_suggestions";
  // A member's conversation, even in full mode or after asking to load it.
  for (const surface of ["chat", "slack"] as const) {
    const member = resolveCompanyCapabilities({ surface, mode: "full", loaded: new Set(["todo_suggestion"]) });
    assert.ok(!member.offeredToolNames.has(tool));
    assert.ok(!member.policyIds.includes("todo_suggestion" as never));
    assert.ok(!member.catalogText.includes("todo_suggestion"));
    assert.equal(loadCompanyCapabilities({ capabilityIds: ["todo_suggestion"] }, new Set(), surface).ok, false);
  }
  // A Harper event or review: the tool and its policy come with the run.
  const event = resolveCompanyCapabilities({ surface: "chat", mode: "progressive", loaded: new Set(["todo_suggestion"]), harperInitiated: true });
  assert.ok(event.offeredToolNames.has(tool));
  assert.ok(event.policyText.includes('<capability_policy id="todo_suggestion">'));
  // Harper's own schedules: tier 1 proposes, tier 0 only looks again (allowed sets as companyReceiver builds them).
  const tier = (proposes: boolean) => new Set(["read_role", "get_more_data", "manage_agent_schedule", ...(proposes ? [tool] : [])]);
  const service = (allowed: Set<string>) => resolveCompanyCapabilities({ surface: "chat", mode: "full", loaded: new Set(), allowedToolNames: allowed, agentService: true, harperInitiated: true });
  assert.ok(service(tier(true)).offeredToolNames.has(tool));
  assert.ok(!service(tier(false)).offeredToolNames.has(tool));
  assert.ok(companyAgentServiceTools().has(tool));
  // Correspondence with a candidate's agent keeps its own tools only.
  assert.ok(!companyAgentCorrespondenceTools().has(tool));
  // Scheduled matching may suggest widening a thin search.
  assert.ok(SCHEDULED_MATCHING_TOOLS.has(tool));
});
