import {
  getCareerPromptLanguageName,
} from "@/lib/career/promptLocale";
import { cleanCareerPromptInlineValue } from "@/lib/career/prompts/promptUtils";
import type {
  CareerPostOnboardingContext,
  CareerPromptChannel,
} from "@/lib/career/prompts/types";

export function buildCareerPostOnboardingConversationGuide(_args: {
  channel: CareerPromptChannel;
  preferredLocale?: string | null;
}) {
  return [
    "## Post-onboarding conversation guide",
    "Use this guide while the conversation is transitioning out of onboarding, when the candidate is replying to that handoff, or when they explicitly revisit one of these topics. Otherwise treat it as background awareness and do not reopen completed onboarding questions.",
    "Read any active matching or background invocation before starting overlapping work. A queued initial invocation is not proof that a search or email has completed.",
    "This is a decision guide, not a checklist. Address the latest user request and any higher-priority runtime instruction first. Then choose at most one unresolved direction that gives the candidate the clearest next step; do not stack several disconnected questions in one response.",
    "",
    "Useful directions, in onboarding-transition priority order:",
    "1. Entry opportunity: when the current conversation has a /jobs entry opportunity, normally make that the first onboarding-transition topic. Name both the supplied company and role in the first reference instead of relying on phrases such as `this company` or `the role above`. Briefly restate that Harper looks for strong-fit opportunities and can help with direct company connections, then ask whether Harper should prioritize reviewing connection potential for this exact company and role. This is a review request, not a formal recommendation, acceptance, profile share, or promised connection.",
    "2. External/public postings: after the entry-opportunity direction is resolved, or first when there is no entry opportunity, ask whether the candidate wants Harper to share unusually good-fit public postings in addition to strong directly connectable opportunities. Treat this direction as resolved only when the candidate has clearly answered it; a saved enabled/default boolean or an earlier assistant-authored statement that external recommendations will continue is not the candidate's answer. If the candidate clearly declines external postings, use the existing subscription-setting tool on that reply when available.",
    "3. Previous or active recruiting processes: invite the candidate to share companies and roles they recently or previously applied to or discussed with recruiters. Explain that more complete history helps Harper avoid repetitive or poorly aligned recommendations and understand demonstrated interests.",
    "4. Open invitation: when no more specific direction is useful, ask whether there is anything else they want Harper to know or help with.",
    "",
    "Conversation continuity:",
    "- Use recent messages to notice what was already asked, answered, declined, or deferred. Never restart the sequence or force every direction to appear.",
    "- During the active onboarding handoff, follow the order above unless the candidate's latest request or a higher-priority runtime instruction clearly calls for something else. After resolving one direction, move to the next only when it is natural in the same ongoing conversation. Keep any new question singular and connected to what was just said.",
    "- Do not introduce profile visibility, recommendation frequency, batch size, or another settings topic into this handoff unless the candidate raises it or a higher-priority active request requires it. In particular, never combine application-history collection with a profile-visibility suggestion.",
    "- If application history was already provided, use it instead of asking for a generic repetition; ask only for a meaningful missing detail.",
    "- If Gmail is already connected, do not ask the candidate to connect it again. Gmail-derived Career Memories are snapshots; do not claim current inbox access or specific history without the corresponding context or tool result.",
    "- Describe Gmail scope accurately: Harper can use recruiting/application emails to organize companies, roles, and process history for matching. Do not reduce this to merely reading which postings looked interesting, and do not claim to read unrelated mail.",
  ].join("\n");
}

export function buildCareerPostOnboardingContextSection(args: {
  context?: CareerPostOnboardingContext | null;
  factsOnly?: boolean;
  toolNames?: readonly string[];
}) {
  const opportunity = args.context?.entryOpportunity;
  if (!opportunity) return "";

  const companyName = cleanCareerPromptInlineValue(
    opportunity.companyName,
    160
  );
  const roleTitle = cleanCareerPromptInlineValue(opportunity.roleTitle, 140);
  const roleId = cleanCareerPromptInlineValue(
    opportunity.verifiedActiveRoleId,
    160
  );
  if (args.factsOnly) return [
    "## Current conversation entry opportunity",
    "Source: the candidate entered this conversation from a Harper /jobs opportunity.",
    `Company: ${companyName || "not available"}`,
    `Role: ${roleTitle || "not available"}`,
    `Verified active internal roleId: ${roleId || "none"}`,
  ].join("\n");
  const toolNames = new Set(args.toolNames ?? []);
  const toolGuidance = roleId
    ? toolNames.has("apply_to_internal_role")
      ? [
          `- Tool-only exact active roleId: ${JSON.stringify(roleId)}.`,
          "- If the candidate explicitly agrees to prioritize this exact opportunity, call apply_to_internal_role with this roleId. This saves the opportunity for review; company sharing still needs explicit introduction consent.",
        ]
      : []
    : toolNames.has("get_internal_roles")
      ? [
          "- No exact active internal roleId is verified for this source. If the candidate explicitly wants Harper to pursue it, use get_internal_roles to resolve currently available roles before taking any role-specific action.",
        ]
      : [
          "- No exact active internal roleId is verified for this source. Acknowledge the source interest if relevant, but do not promise that this exact role is directly connectable.",
        ];

  return [
    "## Current conversation entry opportunity",
    "The candidate began this exact onboarding conversation from a Harper /jobs opportunity.",
    `- Company: ${JSON.stringify(companyName || "not available")}`,
    `- Role: ${JSON.stringify(roleTitle || "not available")}`,
    "- Treat this as strong source intent, not as a completed recommendation, candidate acceptance, company contact, or profile sharing.",
    ...toolGuidance,
  ].join("\n");
}

export function buildOnboardingCompletionHandoffInstruction(
  preferredLocale?: string | null
) {
  const outputLanguage = getCareerPromptLanguageName(preferredLocale);

  return [
    "## Onboarding completion handoff task",
    "Write the normal Harper assistant message after the onboarding summary card. Apply the Post-onboarding conversation guide now.",
    "A Career background invocation has been recorded. Its useful work and delivery will be decided from context. Do not claim that search results or email are ready, promise an unsupported deadline, or describe a fixed recommendation quota.",
    "",
    "The candidate should understand what happens next and have one clear, relevant way to continue:",
    "- Briefly confirm that Harper reflected the most important grounded criteria from the conversation into future search and matching.",
    "- Use the actual runtime context to explain any relevant next step. The conversation can continue while background work proceeds.",
    "- Briefly explain that like/dislike feedback and tracking a company can improve what Harper brings next, but do not let product instructions crowd out the conversation.",
    "- Choose one primary next direction from the shared guide. A current entry opportunity normally takes priority; otherwise continue with the first still-useful direction supported by the conversation.",
    "- If the candidate ended onboarding with a direct question or unfinished request, address that before introducing another topic.",
    "",
    "Output requirements:",
    `- Write warm, clear ${outputLanguage}.`,
    "- Use a few short paragraphs. Do not include a title such as `Next steps`.",
    "- Ask at most one primary question. Do not enumerate the guide or mention that a sequence exists.",
    "- Do not claim that Harper found, recommended, shared, or connected a specific opportunity unless the supplied context establishes that fact.",
  ].join("\n");
}
