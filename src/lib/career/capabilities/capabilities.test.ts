import assert from "node:assert/strict";
import test from "node:test";
import {
  CAREER_CAPABILITIES,
  CAREER_CORE_TOOLS,
  CAREER_CONDITIONAL_TOOLS,
  CAREER_CAPABILITY_LOADER as LOADER,
} from "./registry";
import { resolveCareerCapabilities } from "./resolver";
import {
  CareerCapabilityRuntime,
  type CareerCapabilityPromptArgs,
} from "./runtime";
import {
  initialCareerCapabilityPayload,
  parseCareerCapabilityTurn,
  restoreCareerCapabilityLeases,
} from "./lease";
import { CAREER_HANDBOOK_LOADER } from "../handbooks/registry";
import { buildCareerConversationPromptPlan } from "../prompts/conversationPlan";
import { withCareerGmailConnectionDescription } from "../gmailToolSelection";
import { CAREER_CHAT_POST_ONBOARDING_TOOL_NAMES } from "../llmTools";
import type { TalentChatTool } from "@/lib/talentOnboarding/llm";

const names = [
  ...new Set([
    ...CAREER_CORE_TOOLS,
    ...CAREER_CAPABILITIES.flatMap((c) => c.tools.map(([n]) => n)),
  ]),
];
const tools: TalentChatTool[] = names.map((name) => ({
  type: "function",
  function: {
    name,
    description: name,
    parameters: {
      type: "object",
      properties: { testField: { type: "string" } },
    },
  },
}));
const prompt: CareerCapabilityPromptArgs = {
  channel: "chat",
  isOnboardingDone: true,
  profile: null,
  structuredProfileText: "",
  talentContextSection: "",
  currentPreferences: { preferredLocale: "ko" },
  gmailCapability: "available",
};
const make = (
  options: Partial<
    ConstructorParameters<typeof CareerCapabilityRuntime>[0]
  > = {}
) =>
  new CareerCapabilityRuntime({
    mode: "progressive",
    eligibleTools: tools,
    promptArgs: () => prompt,
    ...options,
  });

test("registry covers the real post-onboarding selector; no unexposed reconsideration", () => {
  for (const name of CAREER_CHAT_POST_ONBOARDING_TOOL_NAMES)
    assert.ok(
      names.includes(name as (typeof names)[number]) ||
        (CAREER_CONDITIONAL_TOOLS as readonly string[]).includes(name),
      name
    );
  assert.ok(
    !names.some(
      (name) => name === ("request_internal_role_reconsideration" as string)
    )
  );
});
test("cold input retains all capability awareness but excludes their schemas and detailed policies", () => {
  const step = make().resolveStep();
  assert.deepEqual([...step.offeredNames], [...CAREER_CORE_TOOLS, LOADER, CAREER_HANDBOOK_LOADER]);
  for (const c of CAREER_CAPABILITIES)
    assert.ok(step.catalogText.includes(c.id));
  const text = step.systemBlocks.map((b) => b.text).join("\n");
  assert.ok(!text.includes("### Resume creation and revision"));
  assert.ok(!text.includes("## Opportunity request triage"));
  assert.ok(!text.includes("## Active focused career-coaching conversation"));
  assert.ok(step.eligibleIds.includes("connected_inbox"));
  assert.ok(step.systemBlocks.some(block => block.key === "gmail_capability"));
  for (const name of [
    "update_talent_profile",
    "upsert_document",
    "save_job_posting",
  ])
    assert.ok(!step.offeredNames.has(name));
  for (const capability of ["profile", "documents", "opportunities"])
    assert.ok(step.catalogText.includes(capability));
});
test("loading is atomic, idempotent, and grants schemas only in the next response", () => {
  const runtime = make(),
    before = runtime.resolveStep();
  assert.equal(
    runtime.load({ capabilityIds: ["documents", "invented"] }, before)
      .ok,
    false
  );
  assert.equal(runtime.loaded.size, 0);
  assert.equal(
    runtime.load({ capabilityIds: ["documents"], _uiStatusMessage: "지원 자료를 준비하고 있어요." }, before)
      .ok,
    true
  );
  assert.equal(
    runtime.load(
      { capabilityIds: ["documents", "documents"] },
      before
    ).ok,
    true
  );
  assert.equal(
    runtime.claimCall("upsert_document", before),
    "tool_not_offered"
  );
  const after = runtime.resolveStep();
  assert.ok(after.offeredNames.has("upsert_document"));
  assert.ok(!after.offeredNames.has("generate_resume"));
  assert.ok(after.systemBlocks.some(block => block.key === "handbook:resume"), "document authoring receives the current resume handbook");
  assert.deepEqual(before.catalogText, after.catalogText);
  assert.deepEqual(
    runtime.load({ capabilityIds: ["documents"] }, after).alreadyLoaded,
    ["documents"]
  );
});
test("partial allowlists describe only supported effects; empty request has no loader", () => {
  const partial = resolveCareerCapabilities({
    mode: "progressive",
    loaded: new Set(),
    eligibleTools: tools.filter((t) => t.function.name === "read_document"),
  });
  assert.deepEqual(partial.eligibleIds, ["documents"]);
  assert.ok(partial.catalogText.includes("Only: read saved document content"));
  const empty = resolveCareerCapabilities({
    mode: "progressive",
    loaded: new Set(),
    eligibleTools: [],
  });
  assert.equal(empty.tools.length, 0);
  assert.equal(empty.catalogText, "");
});
test("document reads refresh only the loaded document capability and schema order is stable", async () => {
  const runtime = make({ preloads: ["documents"] });
  const step = runtime.resolveStep();
  await runtime.recordResult("read_document", { ok: true }, step);
  assert.deepEqual([...runtime.used], ["documents"]);
  assert.ok(!runtime.loaded.has("activity_history"));
  await runtime.recordResult(
    "upsert_document",
    { ok: false, status: "conflict" },
    step
  );
  const resolve = (ids: ("documents" | "activity_history")[]) =>
    resolveCareerCapabilities({
      mode: "progressive",
      loaded: new Set(ids),
      eligibleTools: tools,
    });
  const a = resolve(["documents", "activity_history"]),
    b = resolve(["activity_history", "documents"]);
  assert.deepEqual(a.tools, b.tools);
  assert.equal(
    a.tools.filter((t) => t.function.name === "read_document").length,
    1
  );
});
test("offered tools remain callable beyond the old domain and loader counts", () => {
  const runtime = make(), step = runtime.resolveStep();
  for (let i = 0; i < 12; i++) {
    assert.equal(runtime.claimCall(LOADER, step), null);
    assert.equal(runtime.claimCall("write_talent_context", step), null);
  }
});
test("full preserves prompt blocks and keeps the optional delegation loader", () => {
  const resolved = resolveCareerCapabilities({
    mode: "full",
    loaded: new Set(),
    eligibleTools: tools,
  });
  const old = buildCareerConversationPromptPlan({
    ...prompt,
    toolNames: names,
  });
  const full = buildCareerConversationPromptPlan({
    ...prompt,
    toolNames: names,
    capabilities: resolved,
  });
  assert.deepEqual(
    full.promptBlocks.filter((b) => b.key !== "capability_catalog"),
    old.promptBlocks
  );
  assert.ok(resolved.offeredNames.has(LOADER));
  assert.ok(!resolved.offeredNames.has("manage_work"));
});
test("N counts completed source turns and stops at incomplete/full/invalid/time boundaries", () => {
  const now = "2026-10-09T12:00:00Z";
  const row = (
    minutes: number,
    activated: string[] = [],
    patch: Record<string, unknown> = {}
  ) => ({
    created_at: new Date(Date.parse(now) - minutes * 60000).toISOString(),
    payload: {
      careerCapabilityTurn: {
        ...initialCareerCapabilityPayload("progressive").careerCapabilityTurn,
        status: "completed",
        activated,
        ...patch,
      },
    },
  });
  const restore = (rows: ReturnType<typeof row>[]) =>
    restoreCareerCapabilityLeases({ currentCreatedAt: now, rows });
  assert.deepEqual(
    [
      ...restore([
        row(1),
        row(2),
        row(3, ["documents", "web_research"]),
      ]),
    ],
    ["documents"]
  );
  assert.equal(
    restore([row(1), row(2), row(3), row(4, ["documents"])]).size,
    0
  );
  for (const patch of [
    { status: "in_progress" },
    { mode: "full" },
    { version: 3 },
  ])
    assert.equal(
      restore([row(1, [], patch), row(2, ["documents"])]).size,
      0
    );
  assert.equal(restore([row(31, ["documents"])]).size, 0);
  assert.equal(restore([row(1), row(32, ["documents"])]).size, 0);
});
test("saved resume leases migrate to documents without advertising the retired capability", () => {
  const payload = {
    careerCapabilityTurn: {
      version: 1,
      status: "completed",
      mode: "progressive",
      activated: ["resume_authoring", "documents"],
      used: ["resume_authoring"],
    },
  };
  assert.deepEqual(parseCareerCapabilityTurn(payload), {
    ...payload.careerCapabilityTurn,
    activated: ["documents"],
    used: ["documents"],
  });
  const restored = restoreCareerCapabilityLeases({
    currentCreatedAt: "2026-10-29T09:01:00Z",
    rows: [{ created_at: "2026-10-29T09:00:00Z", payload }],
  });
  assert.deepEqual([...restored], ["documents"]);
  const runtime = make({ remembered: restored });
  const step = runtime.resolveStep();
  assert.ok(!step.offeredNames.has("upsert_document"), "legacy history is readable but not automatically loaded");
  assert.ok(!step.catalogText.includes("resume_authoring"));
  assert.ok(!step.offeredNames.has("generate_resume"));
  assert.equal(runtime.load({ capabilityIds: ["resume_authoring"] }, step).ok, false);
});
test("active coaching survives lease expiry and same-turn end restores normal guidance", () => {
  const args: CareerCapabilityPromptArgs = {
    ...prompt,
    careerCoachingActivity: {
      activityId: "activity-1",
      messageId: 1,
      revision: 2,
      topic: "Career decision",
      status: "active",
      agenda: ["Clarify options"],
      channel: "chat",
      plannedMinutes: 15,
      suggestedMinutes: 15,
      createdAt: "2026-10-09T11:00:00Z",
      updatedAt: "2026-10-09T11:00:00Z",
      startedAt: "2026-10-09T11:00:00Z",
      endedAt: null,
    },
    conversationMode: "career_coaching",
  };
  const runtime = make({ promptArgs: () => args, preloads: ["career_coaching"] });
  const active = runtime.resolveStep();
  assert.ok(active.offeredNames.has("manage_career_coaching_activity"));
  assert.ok(
    !active.systemBlocks.some(
      (b) => b.key === "post_onboarding_conversation_guide"
    )
  );
  args.careerCoachingActivity = {
    ...args.careerCoachingActivity!,
    status: "ended",
    revision: 3,
    endedAt: "2026-10-09T12:00:00Z",
  };
  args.conversationMode = "default";
  const ended = runtime.resolveStep();
  assert.ok(
    !ended.systemBlocks.some(
      (b) => b.key === "post_onboarding_conversation_guide"
    )
  );
  assert.ok(
    !ended.systemBlocks.some((b) =>
      b.text.includes("## Active focused career-coaching conversation")
    )
  );
});

test("Gmail connection failures keep tools available and annotate their descriptions", async () => {
  const runtime = make({ preloads: ["connected_inbox", "email_writing"] });
  const offered = runtime.resolveStep();
  await runtime.recordResult(
    "search_connected_gmail",
    { status: "connection_expired", emails: [] },
    offered
  );
  assert.equal(runtime.used.size, 0);
  assert.equal(
    runtime.claimCall("search_connected_gmail", offered),
    null
  );
  const next = runtime.resolveStep();
  assert.ok(next.eligibleIds.includes("connected_inbox"));
  for (const name of ["search_connected_gmail", "write_email"]) {
    assert.ok(next.offeredNames.has(name));
    assert.ok(next.tools.find(tool => tool.function.name === name)!.function.description.endsWith("Gmail 미연결으로 사용할 수 없음"));
  }
  assert.ok(
    next.systemBlocks.some(
      (block) =>
        block.key === "gmail_capability" && block.text.includes("not connected")
    )
  );
  await runtime.recordResult("search_connected_gmail", { status: "ok", emails: [] }, next);
  const restored = runtime.resolveStep();
  for (const name of ["search_connected_gmail", "write_email"])
    assert.ok(!restored.tools.find(tool => tool.function.name === name)!.function.description.includes("Gmail 미연결으로 사용할 수 없음"));
});

test("public research is immediately callable without a research capability", async () => {
  const { getOpenAIChatTools, getRealtimeTools, executeTalentTool } = await import("@/lib/talentOnboarding/tools");
  for (const channel of ["chat", "voice"] as const) {
    assert.ok(!getOpenAIChatTools(channel).some(tool => tool.function.name === "research_company"));
    assert.ok(!getRealtimeTools(channel).some(tool => tool.name === "research_company"));
  }
  await assert.rejects(executeTalentTool({ name: "research_company", input: {}, logging: false }), /Unknown talent tool/);
  const runtime = make();
  const step = runtime.resolveStep();
  assert.ok(!new Set<string>(step.eligibleIds).has("company_research"));
  assert.ok(!step.offeredNames.has("research_company"));
  assert.ok(!new Set<string>(CAREER_CHAT_POST_ONBOARDING_TOOL_NAMES).has("research_company"));
  assert.ok(!new Set<string>(step.loadableIds).has("web_research"));
  assert.ok(!step.catalogText.includes("web_research"));
  for (const name of ["web_search", "open_url"]) {
    assert.ok(step.offeredNames.has(name));
    assert.equal(runtime.claimCall(name, step), null);
    assert.equal(step.tools.filter(tool => tool.function.name === name).length, 1);
  }
  assert.equal(runtime.claimCall("research_company", step), "tool_not_offered");
});

test("successful Gmail access clears an initially disconnected description in the next model input", async () => {
  const runtime = make({
    preloads: ["connected_inbox", "email_writing"],
    eligibleTools: tools.map(tool => withCareerGmailConnectionDescription(tool, false)),
    promptArgs: () => ({ ...prompt, gmailCapability: "not_connected" }),
  });
  const before = runtime.resolveStep();
  await runtime.recordResult("write_email", { status: "succeeded" }, before);
  const after = runtime.resolveStep();
  for (const name of ["search_connected_gmail", "write_email"])
    assert.ok(!after.tools.find(tool => tool.function.name === name)!.function.description.includes("Gmail 미연결으로 사용할 수 없음"));
  assert.ok(after.systemBlocks.some(block => block.key === "gmail_capability" && block.text.includes("Gmail is connected")));
});
