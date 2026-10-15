import { createChatCompletionWithFallback } from "@/lib/llm/llm";
import { GPT_6_LUNA_MODEL } from "@/lib/llm/modelConfig";
import type { RoleCreationConsentTarget } from "@/lib/org/agent/roleCreationConsent";

const MAX_PREVIOUS_MESSAGE_CHARACTERS = 4_000;
const MAX_USER_REPLY_CHARACTERS = 2_000;

const ROLE_NOTIFICATION_CONSENT_SYSTEM_PROMPT = `Decide whether a company user's latest reply approves the role notification settings Harper proposed in its previous message.

The settings are the Slack channel that receives the role's candidate notifications and the teammate assigned to the role. Judge the meaning, not the wording: short or informal replies such as 네, ㅇㅇ, 좋아요, 등록 진행 or 그대로 진행해 주세요 can approve. The reply may contain several messages the user sent in a row; a later message overrides an earlier one.
yes: the reply clearly approves every listed setting.
no: the reply declines, hesitates, asks a question, asks to change any listed setting, answers only something else, or is unclear.

Return exactly one lowercase word: yes or no.`;

function lastCharacters(value: string, limit: number) {
  const trimmed = value.trim();
  return trimmed.length > limit ? `…${trimmed.slice(-limit)}` : trimmed;
}

export function buildRoleNotificationConsentInput(args: {
  previousAssistantMessage: string;
  targets: RoleCreationConsentTarget[];
  userMessage: string;
}) {
  return [
    "<harper_previous_message>",
    lastCharacters(
      args.previousAssistantMessage,
      MAX_PREVIOUS_MESSAGE_CHARACTERS
    ),
    "</harper_previous_message>",
    "",
    "<settings>",
    ...args.targets.map((target) =>
      target.kind === "channel"
        ? `- Slack channel: #${target.label}`
        : `- Assignee: ${target.label}`
    ),
    "</settings>",
    "",
    "<user_reply>",
    lastCharacters(args.userMessage, MAX_USER_REPLY_CHARACTERS),
    "</user_reply>",
  ].join("\n");
}

export function parseRoleNotificationConsentDecision(value: unknown) {
  return (
    String(value ?? "")
      .trim()
      .toLowerCase() === "yes"
  );
}

/**
 * Judges by meaning whether the user's reply approves the settings Harper
 * proposed. Any failure counts as no approval, so Harper asks again instead
 * of saving.
 */
export async function approvesRoleNotificationProposal(args: {
  previousAssistantMessage: string;
  targets: RoleCreationConsentTarget[];
  userMessage: string;
}) {
  try {
    const { response } = await createChatCompletionWithFallback({
      anthropicOverloadFallbackModel: null,
      buildRequest: () => ({
        max_completion_tokens: 16,
        messages: [
          { role: "system", content: ROLE_NOTIFICATION_CONSENT_SYSTEM_PROMPT },
          { role: "user", content: buildRoleNotificationConsentInput(args) },
        ],
      }),
      debugLabel: "org/agent:role-notification-consent",
      fallbackModel: null,
      model: GPT_6_LUNA_MODEL,
      openAIResponses: { reasoningEffort: "none" },
      signal: AbortSignal.timeout(20_000),
    });
    return parseRoleNotificationConsentDecision(
      response?.choices?.[0]?.message?.content
    );
  } catch (error) {
    console.warn("[org/role-notification-consent]", error);
    return false;
  }
}
