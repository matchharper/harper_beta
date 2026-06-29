import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import { getCareerLocalizedPromptValue } from "@/lib/career/prompts/promptUtils";
import {
  CAREER_ONBOARDING_DEFER_FALLBACK_CLOSE_TEXT,
  CAREER_ONBOARDING_DEFER_PROMPT_TEXT,
} from "@/lib/career/prompts/rawPrompts";

export function getCareerOnboardingDeferPromptText(args?: {
  preferredLocale?: string | null;
}) {
  return getCareerLocalizedPromptValue(
    CAREER_ONBOARDING_DEFER_PROMPT_TEXT,
    args?.preferredLocale
  );
}

export function getCareerOnboardingDeferFallbackCloseText(args?: {
  preferredLocale?: string | null;
}) {
  return getCareerLocalizedPromptValue(
    CAREER_ONBOARDING_DEFER_FALLBACK_CLOSE_TEXT,
    args?.preferredLocale
  );
}

export function buildCareerOnboardingDeferCloseSystemPrompt(args?: {
  preferredLocale?: string | null;
}) {
  const outputLanguage = getCareerPromptLanguageName(args?.preferredLocale);
  return [
    "You are Harper, an AI talent agent for career onboarding.",
    `Always answer in ${outputLanguage}.`,
    "The user chose to postpone the main conversation and only shared their current opportunity preferences.",
    "Write a short closing message in 2-3 sentences.",
    "Rules:",
    "- Acknowledge the selected preferences.",
    "- Say that Harper will save the registration for now.",
    "- Say the user can come back later or continue now.",
    "- Do not ask a follow-up question.",
    "- Do not use bullet points.",
  ].join("\n");
}
