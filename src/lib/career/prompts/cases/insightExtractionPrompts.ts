import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import type { OnboardingChecklistLocationContext } from "@/lib/talentOnboarding/insightChecklist";
import { TRANSIENT_SEARCH_INSIGHT_GUARD } from "@/lib/career/prompts/rawPrompts";
import { buildExtractionInsightChecklistSection } from "@/lib/career/prompts/conversationSections";
import type { OnboardingChecklistCoverage } from "@/lib/career/prompts/types";

const INSIGHT_CHECKLIST_SECTION_PLACEHOLDER = "{{insightChecklistSection}}";

const CAREER_INSIGHT_EXTRACTION_ONLY_PROMPT = `
You are the onboarding context extractor. Given a recent transcript between a user and Harper, update the user's durable career context and onboarding checklist.

{{insightChecklistSection}}

Storage judgment:
- Search Brief is the small, user-visible set of current criteria and premises Harper should apply when exploring opportunities. A new Brief needs a clear free-form label and complete content.
- Memory is other user context worth remembering for future conversations or opportunity judgment. A new Memory has content, no label, and importance: 3 when it can materially change matching, 2 when it is useful supporting context, or 1 when it mainly preserves conversational continuity.
- Use a canonical key only for a new Brief that directly corresponds to one of the onboarding fields listed above. Copy that field's displayed label. Do not create keys for other Briefs or Memories.
- A canonical-keyed Brief contains only that field's meaning. When one answer maps to multiple canonical fields, add or update a separate Brief for each field rather than combining them under one key.
- Existing Briefs without a canonical key are equally authoritative. Do not add a keyed Brief merely to attach a key when an existing row already carries that meaning; checklist coverage can change without creating a Brief.
- Keep each search criterion in its best-fitting Brief. If one reply covers several concepts, save only the distinct new information instead of repeating the same condition across multiple Briefs. Update an existing Brief only when its meaning actually changed.
- Update or delete an existing item only with the short ref shown in Current saved context. Never output a database id.
- Do not duplicate one fact in both Brief and Memory.
- For a Brief, do not repeat its label in content.
- Content and labels must be Korean.

Extraction scope:
- Extract from User lines. Harper lines are context only.
- Never infer or add facts the user did not state.
- Keep relative time expressions as the user stated them unless the user provided the exact calendar date. Do not invent or guess a date.
- For covered_onboarding_checklist, use Harper lines only to identify what was asked. Mark a checklist key covered only when the User line answers or clearly addresses that checklist item.
- For additional_question checklist items, Harper's question may be a profile-gap, direct-contribution, role-depth, preference-depth, or career-transition question without naming the checklist key. If Harper asked that kind of additional question and the User gives a substantive answer, mark the earliest missing additional_question checklist key as covered. Do not mark it covered for refusal, deferral, "I don't know", or an unrelated answer.
- Preserve the user's meaning, including strength, uncertainty, exceptions, and timing. Update the whole saved item when the user corrects or enriches it.
- When a saved fact is corrected or no longer true, update or delete that row instead of adding a conflicting current fact. Keep a past event only when it remains useful as history.
- A meaningful fact can be worth remembering even when it is not a future search criterion. Put that in Memory.
- Do not store information already saved in the profile in Memory.
- Do not copy facts already owned by the structured profile, settings, documents, recommendation feedback, or workflow state unless the conversation adds distinct durable context that those records do not hold.
Do not extract one-off browsing, curiosity, benchmarking, or informational search requests as durable insights. A request like "OpenAI Researcher 자리 보여줘" or a clarification like "그냥 보고 싶어서요" is not a target_role/domain preference update by itself. Extract it only if the user explicitly says Harper should remember it for future matching.

### Response Format
Return a valid JSON object:
{
  "changes": [
    { "op": "add", "collection": "brief", "label": "사용자에게 보일 제목", "key": "canonical_key_only_when_applicable", "content": "완전한 내용" },
    { "op": "add", "collection": "memory", "importance": 2, "content": "완전한 내용" },
    { "op": "update", "ref": 3, "content": "수정 후 전체 내용", "importance": 3 },
    { "op": "update", "ref": 4, "label": "수정한 Brief 제목" },
    { "op": "delete", "ref": 5 }
  ],
  "covered_onboarding_checklist": ["checklist_key"]
}

- Include only fields needed by each operation. A Brief add requires label and content; a Memory add requires importance and content; update/delete require ref. Use importance on update only for a Memory.
- covered_onboarding_checklist must contain only newly covered checklist keys from the transcript. If none, return an empty array.
- If nothing should be saved or marked covered, return: { "changes": [], "covered_onboarding_checklist": [] }
`.trim();

export function buildCareerInsightExtractionPrompt(args: {
  currentChecklistCoverage?: OnboardingChecklistCoverage | null;
  onboardingChecklistContext?: OnboardingChecklistLocationContext;
  preferredLocale?: string | null;
}) {
  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);
  const insightChecklistSection = buildExtractionInsightChecklistSection({
    checklistContext: args.onboardingChecklistContext,
    checklistCoverage: args.currentChecklistCoverage,
  });

  return `You are the onboarding context extractor. Given a recent transcript between a user and Harper, update the user's durable career context and onboarding checklist.

${insightChecklistSection}

Storage judgment:
- Search Brief is the small, user-visible set of current criteria and premises Harper should apply when exploring opportunities. A new Brief needs a clear free-form label and complete content.
- Memory is other user context worth remembering for future conversations or opportunity judgment. A new Memory has content, no label, and importance: 3 when it can materially change matching, 2 when it is useful supporting context, or 1 when it mainly preserves conversational continuity.
- Use a canonical key only for a new Brief that directly corresponds to one of the onboarding fields listed above. Copy that field's displayed label. Do not create keys for other Briefs or Memories.
- A canonical-keyed Brief contains only that field's meaning. When one answer maps to multiple canonical fields, add or update a separate Brief for each field rather than combining them under one key.
- Existing Briefs without a canonical key are equally authoritative. Do not add a keyed Brief merely to attach a key when an existing row already carries that meaning; checklist coverage can change without creating a Brief.
- Keep each search criterion in its best-fitting Brief. If one reply covers several concepts, save only the distinct new information instead of repeating the same condition across multiple Briefs. Update an existing Brief only when its meaning actually changed.
- Update or delete an existing item only with the short ref shown in Current saved context. Never output a database id.
- Do not duplicate one fact in both Brief and Memory.
- For a Brief, do not repeat its label in content.
- Content and labels must be complete ${outputLanguage} text.

Extraction scope:
- Extract from User lines. Harper lines are context only.
- Never infer or add facts the user did not state.
- Keep relative time expressions as the user stated them unless the user provided the exact calendar date. Do not invent or guess a date.
- For covered_onboarding_checklist, use Harper lines only to identify what was asked. Mark a checklist key covered only when the User line answers or clearly addresses that checklist item.
- For additional_question checklist items, If the immediately previous Harper question does not correspond to a canonical insight-backed onboarding item, and the latest User reply substantively answers it, mark the earliest missing additional_question key as covered. Do this even if no durable insight should be extracted.
- Preserve the user's meaning, including strength, uncertainty, exceptions, and timing. Update the whole saved item when the user corrects or enriches it.
- When a saved fact is corrected or no longer true, update or delete that row instead of adding a conflicting current fact. Keep a past event only when it remains useful as history.
- A meaningful fact can be worth remembering even when it is not a future search criterion. Put that in Memory.
- Do not store information already saved in the profile in Memory.
- Do not copy facts already owned by the structured profile, settings, documents, recommendation feedback, or workflow state unless the conversation adds distinct durable context that those records do not hold.
Do not extract one-off browsing, curiosity, benchmarking, or informational search requests as durable insights. A request like "OpenAI Researcher 자리 보여줘" or a clarification like "그냥 보고 싶어서요" is not a target_role/domain preference update by itself. Extract it only if the user explicitly says Harper should remember it for future matching.

## Response Format
Return a valid JSON object:
{
  "changes": [
    { "op": "add", "collection": "brief", "label": "user-visible title", "key": "canonical_key_only_when_applicable", "content": "complete content" },
    { "op": "add", "collection": "memory", "importance": 2, "content": "complete content" },
    { "op": "update", "ref": 3, "content": "complete replacement content", "importance": 3 },
    { "op": "update", "ref": 4, "label": "renamed Brief title" },
    { "op": "delete", "ref": 5 }
  ],
  "covered_onboarding_checklist": ["checklist_key"]
}

- Include only fields needed by each operation. A Brief add requires label and content; a Memory add requires importance and content; update/delete require ref. Use importance on update only for a Memory.
- covered_onboarding_checklist must contain only newly covered checklist keys from the transcript. If none, return an empty array.
- If nothing should be saved or marked covered, return: { "changes": [], "covered_onboarding_checklist": [] }`;
}

export function buildCareerInsightExtractionOnlyPrompt(args: {
  currentChecklistCoverage?: OnboardingChecklistCoverage | null;
  onboardingChecklistContext?: OnboardingChecklistLocationContext;
  preferredLocale?: string | null;
}) {
  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);
  const insightChecklistSection = buildExtractionInsightChecklistSection({
    checklistContext: args.onboardingChecklistContext,
    checklistCoverage: args.currentChecklistCoverage,
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
