import assert from "node:assert/strict";
import test from "node:test";
import { orderCareerPromptBlocksForCaching } from "./promptCaching";
import { buildCareerConversationPromptPlan } from "./conversationPlan";
import { resolveCareerCapabilities } from "../capabilities/resolver";
import { createSimulationSession } from "../simulation/session";
import { createPreparation } from "../simulation/preparation";
import type { CareerPromptBlock } from "./types";

const base = {
  channel: "chat" as const,
  isOnboardingDone: true,
  profile: null,
  structuredProfileText: "Confirmed experience: backend engineer.",
  talentContextSection: "Search Brief\n[1] Remote preferred\nRelevant memories\n[2] Led incident response.",
  currentPreferences: { preferredLocale: "ko" },
};
const cachedPrefix = (blocks: CareerPromptBlock[]) => {
  const memoryIndex = blocks.findIndex((b) => b.key === "future_matching_insights");
  const end = memoryIndex >= 0
    ? memoryIndex
    : blocks.findIndex((b) => b.key === "profile_context");
  assert.ok(end >= 0);
  return blocks.slice(0, end + 1);
};

test("cache layout preserves every whole block and leaves request data after both boundaries", () => {
  const blocks: CareerPromptBlock[] = [
    { key: "chat_core", text: "Fixed instructions", cacheable: true },
    { key: "default_conversation_guidance", text: "Loaded-capability guidance", cacheable: true },
    { key: "capability_catalog", text: "Available capabilities", cacheable: true },
    { key: "career_coaching_state", text: '{"revision":2}' },
    { key: "profile_context", text: "Complete profile", cacheable: true },
    { key: "tool_policy", text: "Current tool policy", cacheable: true },
    { key: "application_start_payload", text: "Start offer instructions" },
    { key: "future_matching_insights", text: "Complete Brief and Memory", cacheable: true },
    { key: "dynamic_state", text: "Time and current request" },
  ];
  const original = structuredClone(blocks);
  const ordered = orderCareerPromptBlocksForCaching(blocks);

  assert.deepEqual(blocks, original, "the input array and blocks stay unchanged");
  assert.equal(ordered.length, blocks.length);
  for (const block of blocks) {
    assert.equal(ordered.filter((b) => b === block).length, 1);
  }
  assert.deepEqual(cachedPrefix(ordered).map((b) => b.key), [
    "chat_core", "profile_context", "future_matching_insights",
  ]);
  assert.deepEqual(orderCareerPromptBlocksForCaching(ordered), ordered);
});

test("capability loading, Gmail availability and coaching revisions leave saved-context prefixes unchanged", () => {
  const tools = [
    "read_talent_context", "write_talent_context", "update_talent_profile",
    "get_role_context", "read_recommended_opportunities",
    "list_documents", "read_document", "generate_resume", "search_connected_gmail",
  ].map((name) => ({
    type: "function" as const,
    function: { name, description: name, parameters: { type: "object" } },
  }));
  const activity = {
    activityId: "coaching-fixture", agenda: ["Career direction"],
    channel: "chat" as const, createdAt: "2026-10-12T00:00:00Z", endedAt: null,
    messageId: 12, plannedMinutes: 15, revision: 1, startedAt: null,
    status: "suggested" as const, suggestedMinutes: 15,
    topic: "Career direction", updatedAt: "2026-10-12T00:00:00Z",
  };
  const cold = buildCareerConversationPromptPlan({
    ...base, simulationAvailability: "inactive", gmailCapability: "available",
    careerCoachingActivity: activity,
    capabilities: resolveCareerCapabilities({ eligibleTools: tools, loaded: new Set(), mode: "progressive" }),
  });
  const loaded = buildCareerConversationPromptPlan({
    ...base, simulationAvailability: "inactive", gmailCapability: "not_connected",
    careerCoachingActivity: { ...activity, revision: 2 },
    capabilities: resolveCareerCapabilities({
      eligibleTools: tools, loaded: new Set(["opportunities", "documents", "connected_inbox"]), mode: "progressive",
    }),
  });
  assert.deepEqual(cachedPrefix(cold.promptBlocks), cachedPrefix(loaded.promptBlocks));
  const text = (plan: typeof cold, key: string) => plan.promptBlocks.find((b) => b.key === key)!.text;
  assert.notEqual(text(cold, "default_conversation_guidance"), text(loaded, "default_conversation_guidance"));
  assert.notEqual(text(cold, "gmail_capability"), text(loaded, "gmail_capability"));
  assert.notEqual(text(cold, "career_coaching_state"), text(loaded, "career_coaching_state"));
  assert.match(text(loaded, "application_start_payload"), /simulate_application/);
});

test("application answers and working facts stay intact outside the saved-context cache", () => {
  const session = createSimulationSession({
    roleRef: "role:fixture", roleName: "Backend Engineer",
    documentId: "resume-fixture", documentName: "CV.pdf",
  });
  session.preparation = createPreparation();
  session.analysisStatus = "completed";
  const updated = structuredClone(session);
  updated.facts.push({ id: "F1", text: "Confirmed impact: reduced latency.", messageId: 15 });
  const before = buildCareerConversationPromptPlan({ ...base, conversationMode: "simulation", simulationSession: session });
  const after = buildCareerConversationPromptPlan({ ...base, conversationMode: "simulation", simulationSession: updated });
  assert.deepEqual(cachedPrefix(before.promptBlocks), cachedPrefix(after.promptBlocks));
  const context = after.promptBlocks.find((b) => b.key === "application_preparation_context")!;
  assert.deepEqual(JSON.parse(context.text).facts, updated.facts);
  assert.ok(after.promptBlocks.indexOf(context) > after.promptBlocks.findIndex((b) => b.key === "future_matching_insights"));
});

test("an empty Brief/Memory retains a profile boundary and unrelated prompt plans keep their order", () => {
  const plan = buildCareerConversationPromptPlan({
    ...base, talentContextSection: "", toolNames: ["read_document"],
    simulationAvailability: "inactive", gmailCapability: "available",
  });
  assert.equal(plan.promptBlocks.some((b) => b.key === "future_matching_insights"), false);
  const profileIndex = plan.promptBlocks.findIndex((b) => b.key === "profile_context");
  for (const key of ["tool_policy", "gmail_capability", "application_start_payload", "simulation_availability", "dynamic_state"]) {
    assert.ok(plan.promptBlocks.findIndex((b) => b.key === key) > profileIndex, key);
  }
  const other = [
    { key: "mock_interview_core", text: "Interview instructions", cacheable: true },
    { key: "interview_position", text: "Selected position", cacheable: true },
  ];
  assert.deepEqual(orderCareerPromptBlocksForCaching(other), other);
});
