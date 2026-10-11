import assert from "node:assert/strict";
import test from "node:test";
import { buildCareerConversationPromptPlan } from "./conversationPlan";
import { createSimulationSession } from "../simulation/session";

const base = {
  channel: "chat" as const,
  isOnboardingDone: true,
  profile: null,
  structuredProfileText: "",
  talentContextSection: "",
};

test("inactive mode is authoritative even when chat history says it remains open", () => {
  const plan = buildCareerConversationPromptPlan({
    ...base,
    simulationAvailability: "inactive",
    recentConversationSection: "Harper: The previous role mode is still open.",
  });
  const state = plan.promptBlocks.find(b => b.key === "simulation_availability")!;
  assert.match(state.text, /no active 함께 지원 모드/);
  assert.match(state.text, /takes precedence over historical chat/);
  assert.match(state.text, /no closing action or UI button is needed/);
});

test("unavailable state is not misrepresented as verified inactivity", () => {
  const plan = buildCareerConversationPromptPlan({ ...base, simulationAvailability: "unavailable" });
  const state = plan.promptBlocks.find(b => b.key === "simulation_availability")!;
  assert.match(state.text, /could not be verified/);
  assert.doesNotMatch(state.text, /no active 함께 지원 모드/);
});

test("active mode retains the chat-based stop contract", () => {
  const plan = buildCareerConversationPromptPlan({
    ...base,
    conversationMode: "simulation",
    toolNames: ["manage_simulation_session"],
    simulationSession: createSimulationSession({ roleRef: "role:test", roleName: "Engineer", documentId: null, documentName: null }),
  });
  assert.ok(plan.enabledToolNames.includes("manage_simulation_session"));
  assert.match(plan.promptBlocks.map(b => b.text).join("\n"), /Explicit stop ends it using the tool/);
  assert.ok(!plan.promptBlocks.some(b => b.key === "simulation_availability"));
});

test("ordinary application intent offers the feature without requiring its name or starting work", () => {
 const plan=buildCareerConversationPromptPlan({...base,simulationAvailability:"inactive"});
 const contract=plan.promptBlocks.find(b=>b.key==="application_start_payload")!.text;
 assert.match(contract,/apply on their behalf/);
 assert.match(contract,/No exact feature name/);
 assert.match(contract,/Do not narrate card rendering/);
 assert.match(contract,/does not start analysis or activate a mode/);
 assert.match(contract,/official_job_slug/);
});
