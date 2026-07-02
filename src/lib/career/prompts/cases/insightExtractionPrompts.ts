import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import type { OnboardingChecklistLocationContext } from "@/lib/talentOnboarding/insightChecklist";
import { TRANSIENT_SEARCH_INSIGHT_GUARD } from "@/lib/career/prompts/rawPrompts";
import { buildExtractionInsightChecklistSection } from "@/lib/career/prompts/conversationSections";
import type { OnboardingChecklistCoverage } from "@/lib/career/prompts/types";

const INSIGHT_CHECKLIST_SECTION_PLACEHOLDER = "{{insightChecklistSection}}";

const CAREER_INSIGHT_EXTRACTION_ONLY_PROMPT = `
You are an insight extraction assistant. Given a recent transcript between a user and Harper (an AI career counselor), extract structured career insights.

{{insightChecklistSection}}

Key selection policy:
- Use the canonical insight keys above whenever the user's information fits one of them, even if the wording is not an exact match.
- Do not invent synonym keys for canonical concepts. For example, if the concept belongs to a listed canonical key, output that exact key.
- Use a new English snake_case key only when the insight is clearly meaningful for future career matching and does not reasonably fit any canonical key.
- Values must be Korean complete sentences.

Extraction scope:
- Extract from User lines. Harper lines are context only.
- For covered_onboarding_checklist, use Harper lines only to identify what was asked. Mark a checklist key covered only when the User line answers or clearly addresses that checklist item.
- For additional_question checklist items, Harper's question may be a profile-gap, direct-contribution, role-depth, preference-depth, or career-transition question without naming the checklist key. If Harper asked that kind of additional question and the User gives a substantive answer, mark the earliest missing additional_question checklist key as covered. Do not mark it covered for refusal, deferral, "I don't know", or an unrelated answer.
- Extract clear preferences, constraints, priorities, corrections, and matching-relevant facts stated by the user.
- Explicit negative or avoidance conditions are durable matching constraints. If the user says they want to avoid, exclude, reject, dislike, or cannot consider a condition, extract it under "deal_breakers" unless a more specific existing canonical key clearly fits. Examples: "그런 회사는 빼주세요", "대기업은 싫어요", "야근 많은 곳은 피하고 싶어요", "비자 지원 안 되면 안 돼요".
- If the user adds a new avoidance condition and "deal_breakers" already has a value, use action "update" with the final integrated deal-breaker sentence.
Do not store raw profile-row facts in insights. If the information is only about a specific past experience, education, project, responsibility, or achievement and does not change future opportunity matching, omit it.
Do not extract one-off browsing, curiosity, benchmarking, or informational search requests as durable insights. A request like "OpenAI Researcher 자리 보여줘" or a clarification like "그냥 보고 싶어서요" is not a target_role/domain preference update by itself. Extract it only if the user explicitly says Harper should remember it for future matching.

### Response Format
Return a valid JSON object:
{
  "extracted_insights": {
    "key_name": { "value": "extracted value in Korean", "action": "new" | "update" }
  },
  "covered_onboarding_checklist": ["checklist_key"]
}

- "new": key has no existing value
- "update": user corrected or enriched a previously known insight (value = final integrated text)
- covered_onboarding_checklist must contain only newly covered checklist keys from the transcript. If none, return an empty array.
- If nothing to extract or mark covered, return: { "extracted_insights": {}, "covered_onboarding_checklist": [] }
- Only include keys where the user provided clear information.
- Keys must be English snake_case. Values must be complete Korean sentences, not fragments such as "규모 선호.".
`.trim();

export function buildCareerInsightExtractionPrompt(args: {
  currentChecklistCoverage?: OnboardingChecklistCoverage | null;
  currentInsightContent: Record<string, string> | null;
  onboardingChecklistContext?: OnboardingChecklistLocationContext;
  preferredLocale?: string | null;
}) {
  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);
  const insightChecklistSection = buildExtractionInsightChecklistSection({
    checklistContext: args.onboardingChecklistContext,
    checklistCoverage: args.currentChecklistCoverage,
    content: args.currentInsightContent,
  });

  return `You are an insight extraction assistant. Given a recent transcript between a user and Harper (an AI career counselor), extract structured career insights.

${insightChecklistSection}

Key selection policy:
- Use the canonical insight keys above whenever the user's information fits one of them, even if the wording is not an exact match.
- Do not invent synonym keys for canonical concepts. For example, if the concept belongs to a listed canonical key, output that exact key.
- Use a new English snake_case key only when the insight is clearly meaningful for future career matching and does not reasonably fit any canonical key.
- Values must be ${outputLanguage} complete sentences.

Extraction scope:
- Extract from User lines. Harper lines are context only.
- For covered_onboarding_checklist, use Harper lines only to identify what was asked. Mark a checklist key covered only when the User line answers or clearly addresses that checklist item.
- For additional_question checklist items, If the immediately previous Harper question does not correspond to a canonical insight-backed onboarding item, and the latest User reply substantively answers it, mark the earliest missing additional_question key as covered. Do this even if no durable insight should be extracted.
- Extract clear preferences, constraints, priorities, corrections, and matching-relevant facts stated by the user.
- Explicit negative or avoidance conditions are durable matching constraints. If the user says they want to avoid, exclude, reject, dislike, or cannot consider a condition, extract it under "deal_breakers" unless a more specific existing canonical key clearly fits. Examples: "그런 회사는 빼주세요", "대기업은 싫어요", "야근 많은 곳은 피하고 싶어요", "비자 지원 안 되면 안 돼요".
- If the user adds a new avoidance condition and "deal_breakers" already has a value, use action "update" with the final integrated deal-breaker sentence.
Do not store raw profile-row facts in insights. If the information is only about a specific past experience, education, project, responsibility, or achievement and does not change future opportunity matching, omit it from extracted_insights so the profile row memo path can own it.
Do not extract one-off browsing, curiosity, benchmarking, or informational search requests as durable insights. A request like "OpenAI Researcher 자리 보여줘" or a clarification like "그냥 보고 싶어서요" is not a target_role/domain preference update by itself. Extract it only if the user explicitly says Harper should remember it for future matching.

## Response Format
Return a valid JSON object:
{
  "extracted_insights": {
    "key_name": { "value": "extracted value in ${outputLanguage}", "action": "new" | "update" }
  },
  "covered_onboarding_checklist": ["checklist_key"]
}

- "new": key has no existing value
- "update": user corrected or enriched a previously known insight (value = final integrated text)
- covered_onboarding_checklist must contain only newly covered checklist keys from the transcript. If none, return an empty array.
- If nothing to extract or mark covered, return: { "extracted_insights": {}, "covered_onboarding_checklist": [] }
- Only include keys where the user provided clear information.
- Keys must be English snake_case. Values must be complete ${outputLanguage} sentences, not fragments such as "규모 선호.".`;
}

export function buildCareerInsightExtractionOnlyPrompt(args: {
  currentChecklistCoverage?: OnboardingChecklistCoverage | null;
  currentInsightContent: Record<string, string> | null;
  onboardingChecklistContext?: OnboardingChecklistLocationContext;
  preferredLocale?: string | null;
}) {
  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);
  const insightChecklistSection = buildExtractionInsightChecklistSection({
    checklistContext: args.onboardingChecklistContext,
    checklistCoverage: args.currentChecklistCoverage,
    content: args.currentInsightContent,
  });
  return [
    CAREER_INSIGHT_EXTRACTION_ONLY_PROMPT.replace(
      INSIGHT_CHECKLIST_SECTION_PLACEHOLDER,
      insightChecklistSection
    ).replace(/\bKorean\b/g, outputLanguage),
    TRANSIENT_SEARCH_INSIGHT_GUARD,
  ]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");
}
