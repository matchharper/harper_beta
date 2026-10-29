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
 assert.ok(contract.includes("application_support"));
 assert.ok(contract.includes("opportunities"));
 assert.ok(!contract.includes("[[APPLICATION_START_OFFER]]"));

});

test("application prompt includes the actual shared Profile, Brief and Memory plus their tool policies", () => {
  const session=createSimulationSession({roleRef:"role:a",roleName:"Engineer",documentId:"resume",documentName:"CV"});
  const plan=buildCareerConversationPromptPlan({...base,simulationSession:session,conversationMode:"simulation",structuredProfileText:"Confirmed Profile fact",talentContextSection:"Search Brief\n[1] Remote preferred\nRelevant memories\n[2] Confirmed incident response",toolNames:["read_talent_context","write_talent_context","update_talent_profile","manage_simulation_session"]});
  assert.ok(plan.promptBlocks.some(b=>b.key==="profile_context"&&b.text.includes("Confirmed Profile fact")));
  assert.ok(plan.promptBlocks.some(b=>b.key==="future_matching_insights"&&b.text.includes("[2] Confirmed incident response")));
  assert.ok(plan.promptBlocks.some(b=>b.key==="tool_policy"&&b.text.includes("write_talent_context")));
});

test("application entry is withheld during onboarding",()=>{
  const plan=buildCareerConversationPromptPlan({...base,isOnboardingDone:false,simulationAvailability:"inactive"});
  assert.ok(!plan.promptBlocks.some(b=>b.key==="application_start_payload"));
});
