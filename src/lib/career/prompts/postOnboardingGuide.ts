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
    "## Continuing after onboarding",
    "Continue the candidate's actual purpose using the conversation, current profile, Brief, Memory and entry-opportunity facts. Onboarding completion is not new consent and does not require another interview or settings checklist.",
    "When they came from a /jobs opportunity, use that exact company and role together with what they actually requested. Pursue an already authorized action with the general tools; otherwise ask the useful connection or application question. Entry alone is not consent to share their profile. Read current opportunity/application state before repeating an action.",
    "When finding opportunities serves their purpose, start the work with the available tools rather than merely offering to search later. For the first selection, offer a generous range of useful options (roughly 10–15 when suitable options exist, not a quota). Recommend only one role per company, choosing the most useful fit. Respect explicit user requests and do not pad weak matches.",
    "Choose the next action or question from the actual context, including an unfinished request or a wish to stop. Report only verified work and results.",
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
          "- No exact active internal roleId is verified for this source. If the candidate explicitly wants Harper to pursue it, use get_internal_roles to resolve that specific public posting before taking any role-specific action; do not broaden into other internal roles.",
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
    "Onboarding has just completed. Continue this conversation with the full Career tools.",
    buildCareerPostOnboardingConversationGuide({ channel: "chat", preferredLocale }),
    preferredLocale ? `Respond in ${outputLanguage}.` : "Use the current conversation language.",
  ].join("\n\n");
}
