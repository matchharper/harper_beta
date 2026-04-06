import { client, xaiClient } from "@/lib/llm/llm";

export type TalentChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function cleanModelText(raw: string) {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export async function runTalentAssistantCompletion(args: {
  messages: TalentChatMessage[];
  temperature?: number;
  jsonMode?: boolean;
}) {
  const { messages, temperature = 0.35, jsonMode = false } = args;
  const responseFormat = jsonMode
    ? ({ type: "json_object" } as const)
    : undefined;

  try {
    const response = await xaiClient.chat.completions.create({
      model: "grok-4-1-fast-non-reasoning",
      messages,
      temperature,
      ...(responseFormat && { response_format: responseFormat }),
    });
    const content = response.choices[0]?.message?.content ?? "";
    return cleanModelText(content);
  } catch {
    const fallback = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      temperature,
      ...(responseFormat && { response_format: responseFormat }),
    });
    const content = fallback.choices[0]?.message?.content ?? "";
    return cleanModelText(content);
  }
}
