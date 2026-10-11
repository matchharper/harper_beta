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
  restoreCareerCapabilityLeases,
} from "./lease";
import { buildCareerConversationPromptPlan } from "../prompts/conversationPlan";
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
  assert.deepEqual([...step.offeredNames], [...CAREER_CORE_TOOLS, LOADER]);
  for (const c of CAREER_CAPABILITIES)
    assert.ok(step.catalogText.includes(c.id));
  const text = step.systemBlocks.map((b) => b.text).join("\n");
  assert.ok(!text.includes("### Resume creation and revision"));
  assert.ok(!text.includes("## Opportunity request triage"));
  assert.ok(!text.includes("## Active focused career-coaching conversation"));
  assert.ok(text.includes("inbox search is available through connected_inbox"));
});
test("loading is atomic, idempotent, and grants schemas only in the next response", () => {
  const runtime = make(),
    before = runtime.resolveStep();
  assert.equal(
    runtime.load({ capabilityIds: ["resume_authoring", "invented"] }, before)
      .ok,
    false
  );
  assert.equal(runtime.loaded.size, 0);
  assert.equal(
    runtime.load({ capabilityIds: ["resume_authoring"], extra: true }, before)
      .ok,
    false
  );
  assert.equal(
    runtime.load(
      { capabilityIds: ["resume_authoring", "resume_authoring"] },
      before
    ).ok,
    true
  );
  assert.equal(
    runtime.claimCall("generate_resume", before),
    "tool_not_offered"
  );
  const after = runtime.resolveStep();
  assert.ok(after.offeredNames.has("generate_resume"));
  assert.ok(!after.offeredNames.has("update_document"));
  assert.ok(
    after.systemBlocks.some((b) =>
      b.text.includes("### Resume creation and revision")
    )
  );
  assert.deepEqual(before.catalogText, after.catalogText);
  assert.deepEqual(
    runtime.load({ capabilityIds: ["resume_authoring"] }, after).alreadyLoaded,
    ["resume_authoring"]
  );
});
test("partial allowlists describe only supported effects; empty request has no loader", () => {
  const partial = resolveCareerCapabilities({
    mode: "progressive",
    loaded: new Set(),
    eligibleTools: tools.filter((t) => t.function.name === "read_document"),
  });
  assert.ok(!partial.eligibleIds.includes("resume_authoring"));
  assert.ok(partial.catalogText.includes("Only: read saved document content"));
  const empty = resolveCareerCapabilities({
    mode: "progressive",
    loaded: new Set(),
    eligibleTools: [],
  });
  assert.equal(empty.tools.length, 0);
  assert.equal(empty.catalogText, "");
});
test("stable schema order and shared readers do not enable a sibling capability", async () => {
  const runtime = make({ remembered: new Set(["resume_authoring"]) });
  const step = runtime.resolveStep();
  await runtime.recordResult("read_document", { ok: true }, step);
  assert.deepEqual([...runtime.used], ["resume_authoring"]);
  assert.ok(!runtime.loaded.has("documents"));
  await runtime.recordResult(
    "generate_resume",
    { ok: false, status: "conflict" },
    step
  );
  const resolve = (ids: ("resume_authoring" | "documents")[]) =>
    resolveCareerCapabilities({
      mode: "progressive",
      loaded: new Set(ids),
      eligibleTools: tools,
    });
  const a = resolve(["resume_authoring", "documents"]),
    b = resolve(["documents", "resume_authoring"]);
  assert.deepEqual(a.tools, b.tools);
  assert.equal(
    a.tools.filter((t) => t.function.name === "read_document").length,
    1
  );
});
test("loader attempts do not consume domain budget; failed attempts are bounded", () => {
  const runtime = make(),
    step = runtime.resolveStep();
  for (let i = 0; i < 2; i++)
    assert.equal(runtime.claimCall(LOADER, step), null);
  assert.equal(runtime.claimCall(LOADER, step), "tool_budget_exhausted");
  for (let i = 0; i < 8; i++)
    assert.equal(runtime.claimCall("write_talent_context", step), null);
  assert.equal(
    runtime.claimCall("write_talent_context", step),
    "tool_budget_exhausted"
  );
});
test("full preserves existing prompt blocks and excludes loader", () => {
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
  assert.ok(!resolved.offeredNames.has(LOADER));
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
        row(3, ["resume_authoring", "web_research"]),
      ]),
    ],
    ["resume_authoring"]
  );
  assert.equal(
    restore([row(1), row(2), row(3), row(4, ["resume_authoring"])]).size,
    0
  );
  for (const patch of [
    { status: "in_progress" },
    { mode: "full" },
    { version: 2 },
    { activated: ["invented"] },
  ])
    assert.equal(
      restore([row(1, [], patch), row(2, ["resume_authoring"])]).size,
      0
    );
  assert.equal(restore([row(31, ["resume_authoring"])]).size, 0);
  assert.equal(restore([row(1), row(32, ["resume_authoring"])]).size, 0);
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
  const runtime = make({ promptArgs: () => args });
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
    ended.systemBlocks.some(
      (b) => b.key === "post_onboarding_conversation_guide"
    )
  );
  assert.ok(
    !ended.systemBlocks.some((b) =>
      b.text.includes("## Active focused career-coaching conversation")
    )
  );
});

test("Gmail connection failures never refresh leases and revoke current access even within an older offered snapshot", async () => {
  const runtime = make({ remembered: new Set(["connected_inbox"]) });
  const offered = runtime.resolveStep();
  await runtime.recordResult(
    "search_connected_gmail",
    { status: "connection_expired", emails: [] },
    offered
  );
  assert.equal(runtime.used.size, 0);
  assert.equal(
    runtime.claimCall("search_connected_gmail", offered),
    "tool_not_offered"
  );
  const next = runtime.resolveStep();
  assert.ok(!next.eligibleIds.includes("connected_inbox"));
  assert.ok(!next.offeredNames.has("search_connected_gmail"));
  assert.ok(
    next.systemBlocks.some(
      (block) =>
        block.key === "gmail_capability" && block.text.includes("not connected")
    )
  );
});

test("a capability wholly covered by core remains in the catalog without occupying loader IDs or leases", async () => {
  const runtime = make();
  const step = runtime.resolveStep();
  assert.ok(step.eligibleIds.includes("company_research"));
  assert.ok(step.activeIds.includes("company_research"));
  assert.ok(step.offeredNames.has("research_company"));
  assert.ok(!step.loadableIds.includes("company_research"));
  await runtime.recordResult("research_company", { ok: true }, step);
  assert.ok(!runtime.used.has("company_research"));
});
