import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import {
  CAREER_CALL_END_INSTRUCTION_PROMPT,
  CAREER_FIRST_VISIT_TEXT_EN,
  CAREER_FIRST_VISIT_TEXT_KO,
  CAREER_INTERRUPT_HANDLING_PROMPT,
  CAREER_INTERRUPT_HANDLING_PROMPT_EN,
} from "@/lib/career/prompts/rawPrompts";

export function getCareerFirstVisitText(
  preferredLocale?: string | null
): string {
  return getCareerPromptLanguageName(preferredLocale) === "English"
    ? CAREER_FIRST_VISIT_TEXT_EN
    : CAREER_FIRST_VISIT_TEXT_KO;
}

export function getCareerInterruptHandlingPrompt(
  preferredLocale?: string | null
): string {
  return getCareerPromptLanguageName(preferredLocale) === "English"
    ? CAREER_INTERRUPT_HANDLING_PROMPT_EN
    : CAREER_INTERRUPT_HANDLING_PROMPT;
}

export function getCareerCallEndInstructionPrompt(): string {
  return CAREER_CALL_END_INSTRUCTION_PROMPT;
}
