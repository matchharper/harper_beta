import { buildOrgAgentSystemPrompt, buildOrgAgentUserPrompt } from "./prompts";
import { buildLlmImageMessageContent, type LlmImageInput, type LlmMessageContent } from "@/lib/llm/imageInput";
import type { resolveCompanyCapabilities } from "./capabilities/resolver";
import type { CompanyResponseLocale } from "./uxWritingPrompt";

export type CompanyInputMessage = { role: "system" | "user" | "assistant"; content: LlmMessageContent };
export function buildCompanySystemInput(args: {
  resolved: ReturnType<typeof resolveCompanyCapabilities>;
  surface: "chat" | "slack";
  responseLocale?: CompanyResponseLocale;
  allowSilentCompletion?: boolean;
}) {
  return buildOrgAgentSystemPrompt({
    surface: args.surface,
    responseLocale: args.responseLocale,
    enableSlackChoiceButtons: args.surface === "slack",
    allowSilentCompletion: args.allowSilentCompletion,
    capabilityCatalogText: args.resolved.catalogText,
    capabilityPolicyText: args.resolved.policyText,
  });
}

export function buildCompanyConversationInput(args: Parameters<typeof buildOrgAgentUserPrompt>[0] & {
  currentUserMessageId?: number;
  imageInputs?: LlmImageInput[];
}): CompanyInputMessage[] {
  const history = args.context.conversationMessages ?? [];
  const selected = history.filter((m) => m.id !== args.currentUserMessageId);
  const reference = buildOrgAgentUserPrompt({ ...args, includeConversation: false });
  const historyInfo = JSON.stringify(args.context.conversationHistoryInfo ?? { hasMore: "unknown", returnedItems: selected.length });
  return [
    { role: "user", content: `<reference_context source="workspace_snapshot" not_a_company_message="true">\n${reference}\nhistory_scope_and_completeness: ${historyInfo}\nmessage_index (metadata only; not spoken text): ${JSON.stringify(selected.map(({ content: _content, ...metadata }, index) => ({ ...metadata, followingMessageIndex: index + 1 })))}\ncurrent_message_id: ${args.currentUserMessageId ?? "unknown"}\n</reference_context>` },
    // Identity-based boundary; repeated text in different messages is preserved.
    ...selected.map((m): CompanyInputMessage => ({
      role: m.source === "candidate_contact" ? "user" : m.role,
      content: m.source === "candidate_contact"
        ? `<candidate_correspondence not_a_company_message="true">${JSON.stringify({ messageId: m.id, references: m.references, content: m.content })}</candidate_correspondence>`
        : m.content,
    })),
    ...(!args.context.conversationMessages && args.context.conversationText !== "-" ? [{
      role: "user" as const,
      content: `<historical_reference not_a_company_message="true">${args.context.conversationText}</historical_reference>`,
    }] : []),
    { role: "user", content: buildLlmImageMessageContent(args.userMessage, args.imageInputs) },
  ];
}
