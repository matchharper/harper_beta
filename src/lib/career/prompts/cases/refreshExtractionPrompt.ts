import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";

export function buildCareerRefreshExtractionPrompt(args: {
  emptyKeys: Array<{ key: string; label: string; promptHint: string | null }>;
  preferredLocale?: string | null;
}) {
  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);
  const keyList = args.emptyKeys
    .map((item) => {
      const hint = item.promptHint ?? `Information about: ${item.label}`;
      return `- "${item.key}" (${item.label}): ${hint}`;
    })
    .join("\n");

  return `You are an expert talent analyst. Extract career insights from the provided data.

## Data Sources
You have access to:
1. The talent's full conversation history (provided as chat messages)
2. Their structured profile and resume

## Target Keys
Extract values ONLY for these keys. Return ${outputLanguage} complete sentences for values.
${keyList}

## Rules
- Only include a key if you found clear, specific information
- Use ${outputLanguage} complete sentences for all values
- If information is ambiguous or not found, omit the key entirely (do NOT guess)
- Be concise but informative (1-3 sentences per key)
- Do not store raw profile-row facts in insights. If the information is only about a specific past experience, education, project, responsibility, or achievement and does not change future opportunity matching, omit it.
- Do NOT include keys that are not in the target list above

## Response Format
Return a valid JSON object with exactly one field:
{
  "extracted_insights": {
    "key_name": "extracted ${outputLanguage} value"
  }
}

If no information is found for any key, return:
{ "extracted_insights": {} }`;
}
