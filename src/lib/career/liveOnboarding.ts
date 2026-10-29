import { CAREER_ONBOARDING_GUIDANCE_PROMPT } from "./prompts/rawPrompts";
import { renderCareerPromptBlocks } from "./prompts/promptUtils";
import type {
  CareerPromptPlan,
  OnboardingChecklistCoverage,
} from "./prompts/types";
import {
  getOnboardingQuestionChecklist,
  getOnboardingRequiredQuestionKeys,
  type OnboardingChecklistLocationContext,
} from "@/lib/talentOnboarding/insightChecklist";

/** A small factual projection of the existing checklist, never a second tracker. */
export function buildLiveOnboardingContext(args: {
  checklistContext?: OnboardingChecklistLocationContext;
  checklistCoverage?: OnboardingChecklistCoverage | null;
}) {
  const required = new Set<string>(
    getOnboardingRequiredQuestionKeys(args.checklistContext)
  );
  const topics = getOnboardingQuestionChecklist(args.checklistContext).filter(
    (item) => required.has(item.key)
  );
  const covered = topics.filter(
    (item) => args.checklistCoverage?.[item.key] === "covered"
  );
  const missing = topics.filter(
    (item) => args.checklistCoverage?.[item.key] !== "covered"
  );
  return [
    "Latest saved onboarding progress (replaces earlier progress snapshots):",
    `Topics already answered: ${covered.map((item) => item.label).join(", ") || "none"}.`,
    `Topics not yet recorded as answered: ${missing.map((item) => item.label).join(", ") || "none"}.`,
    "This snapshot reflects saved turns; the caller's latest speech may still be processing.",
  ].join("\n");
}

/** Keep the shared task/context, but address the delegated model as a backend. */
export function buildLiveBackendInstructions(plan: CareerPromptPlan) {
  const blocks = plan.promptBlocks.map((block) =>
    plan.isOnboardingActive && block.key === "onboarding_rules"
      ? { ...block, text: CAREER_ONBOARDING_GUIDANCE_PROMPT }
      : block
  );
  return [
    renderCareerPromptBlocks(blocks),
    "## Live delegation output contract",
    "You are the reasoning and tool backend for Harper's live voice model. Apply the shared task rules and verified context above; the voice model speaks to the caller. Return a compact handoff with the relevant facts, actual action outcome, and one useful next conversational move. Do not write a long user-facing monologue or tell the voice model to repeat your wording verbatim.",
    "Read the latest conversation and corrections before choosing the next move. Saved progress can lag behind the latest speech. Distinguish a caller asking to stop from completion of the task. Use end_call with complete_onboarding=false when the caller requests stopping while onboarding remains unfinished.",
    ...(plan.isOnboardingActive
      ? [
          "For onboarding, reconcile the checklist with the latest answers before recommending another question or closing. If required topics remain unanswered, choose one useful missing topic and hand off only the facts needed for that next question; keep the remaining checklist in backend context. When they are answered, choose a brief natural closing and call end_call with complete_onboarding=true. There is no required final confirmation or permission-to-hang-up question. Accept contextually complete short answers and do not repeat answered topics because saving is pending.",
          "Completion transport: the application saves the spoken transcript and determines onboarding completion through the existing checklist extraction. Do not emit a completion marker in the handoff or ask the voice model to say one. The complete_onboarding command requests saved completion before disconnecting. If the application reports missing topics, continue from those facts; a farewell alone does not complete onboarding. Do not claim search, saving, or any other action succeeded without verified evidence.",
        ]
      : []),
  ].join("\n\n");
}
