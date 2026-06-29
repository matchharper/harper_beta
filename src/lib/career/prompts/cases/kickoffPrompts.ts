import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import {
  getCareerLocalizedPromptValue,
  interpolateCareerPromptText,
} from "@/lib/career/prompts/promptUtils";
import {
  CAREER_KICKOFF_ACKNOWLEDGEMENT_EXAMPLE,
  CAREER_KICKOFF_FALLBACK,
  CAREER_KICKOFF_FALLBACK_NAME,
  CAREER_KICKOFF_OPENING_MESSAGE,
} from "@/lib/career/prompts/rawPrompts";

export function getCareerKickoffFallback(args?: {
  preferredLocale?: string | null;
}) {
  return getCareerLocalizedPromptValue(
    CAREER_KICKOFF_FALLBACK,
    args?.preferredLocale
  );
}

export function buildCareerKickoffOpeningMessage(
  displayName: string,
  preferredLocale?: string | null
) {
  const normalizedName =
    String(displayName ?? "")
      .trim()
      .replace(/\s*님$/, "") ||
    getCareerLocalizedPromptValue(
      CAREER_KICKOFF_FALLBACK_NAME,
      preferredLocale
    );

  return interpolateCareerPromptText(
    getCareerLocalizedPromptValue(
      CAREER_KICKOFF_OPENING_MESSAGE,
      preferredLocale
    ),
    { name: normalizedName }
  );
}

export function buildCareerKickoffSystemPrompt(args?: {
  preferredLocale?: string | null;
}) {
  const outputLanguage = getCareerPromptLanguageName(args?.preferredLocale);
  const acknowledgementExample = getCareerLocalizedPromptValue(
    CAREER_KICKOFF_ACKNOWLEDGEMENT_EXAMPLE,
    args?.preferredLocale
  );

  return [
    "You are Harper, an AI talent agent onboarding assistant.",
    `Always write in ${outputLanguage}.`,
    "Return JSON only.",
    "JSON format:",
    "{",
    '  "acknowledgement": "...",',
    '  "insight": "..."',
    "}",
    "Rules:",
    `- acknowledgement should greet user naturally (e.g. "${acknowledgementExample}") and thank for sharing.`,
    `- insight should mention one promising point from the submitted information in 1-2 natural ${outputLanguage} sentences.`,
  ].join("\n");
}

export function buildCareerKickoffUserPrompt(args: {
  displayName: string;
  links: string[];
  preferencesDescription: string;
  resumeFileName?: string | null;
  resumeTextPreview: string;
}) {
  return [
    `이름: ${args.displayName}`,
    `이력서 파일명: ${args.resumeFileName || "(없음)"}`,
    `링크: ${args.links.join(", ") || "(없음)"}`,
    `현재 선호 정보: ${args.preferencesDescription || "(없음)"}`,
    `이력서 텍스트(일부): ${args.resumeTextPreview || "(없음)"}`,
  ].join("\n");
}
