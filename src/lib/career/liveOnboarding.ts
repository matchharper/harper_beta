import { CAREER_ONBOARDING_GUIDANCE_PROMPT } from "./prompts/rawPrompts";
import { renderCareerPromptBlocks } from "./prompts/promptUtils";
import type { CareerPromptPlan, OnboardingChecklistCoverage } from "./prompts/types";
import type { OnboardingChecklistLocationContext } from "@/lib/talentOnboarding/insightChecklist";

/** Identify onboarding to the audio interface; evidence stays with the reply writer. */
export function buildLiveOnboardingContext(_args: {
  checklistContext?: OnboardingChecklistLocationContext;
  checklistCoverage?: OnboardingChecklistCoverage | null;
  structuredProfileText?: string | null;
  talentContextSection?: string | null;
  recentConversationSection?: string | null;
}) {
  return "Career onboarding: the backend writes the conversation from the current profile, saved facts and actual dialogue.";
}

/** Keep the shared task/context, but address the delegated model as a backend. */
export function buildLiveBackendInstructions(plan: CareerPromptPlan) {
  const blocks = plan.promptBlocks.map((block) =>
    plan.isOnboardingActive && block.key === "onboarding_rules"
      ? { ...block, text: CAREER_ONBOARDING_GUIDANCE_PROMPT }
      : block);
  return [
    renderCareerPromptBlocks(blocks),
    "## Live delegation output contract",
    "You are the reasoning and tool backend for Harper's live voice model. Apply the shared task rules and verified context above; the voice model speaks to the caller. Return a compact handoff with the relevant facts, actual action outcome, and one useful next conversational move. An end_call result confirming that ending is scheduled means the application is waiting for your final closing handoff before ending the call; provide that handoff without another tool call or claiming persistence has already succeeded. Do not write a long user-facing monologue or tell the voice model to repeat your wording verbatim.",
    "Read the latest conversation and corrections before choosing the next move. Saved facts can lag behind the latest speech. Distinguish a caller asking to stop from completion of the task. Use end_call with complete_onboarding=false when the caller requests stopping while onboarding remains unfinished.",
    ...(plan.isOnboardingActive
      ? [
          "For onboarding, use the profile, saved facts and actual answers to decide whether another question would materially help the first search. When enough is understood, call end_call with complete_onboarding=true. Explicit uncertainty or a wish not to share is part of that understanding. No separate summary approval or permission-to-hang-up question is required.",
          "Completion transport: complete_onboarding=true is your completion decision. The application persists the spoken facts and completion before disconnecting. A storage failure must be resolved before claiming completion; it is not a request to ask the user the same questions again. Do not emit a text completion marker in the handoff or ask the voice model to say one. Do not claim an action succeeded without its result.",
        ]
      : []),
  ].join("\n\n");
}
