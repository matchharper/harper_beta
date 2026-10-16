import { buildCompanyUpdatePrompt } from "./companyUpdate";
import { buildOrgAgentSystemPrompt } from "./prompts";
import { resolveOrgAgentModel, getOrgAgentReasoningEffort } from "./modelConfig";

/** General company-update composition adapter. No delivery or persistence occurs here. */
export function buildCompanyUpdateEmailMessages(args: {
  purpose: string; facts: Record<string, unknown>; locale: "ko" | "en";
  recentConversation?: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  return [
    { role: "system" as const, content: buildOrgAgentSystemPrompt({ surface: "email", emailMode: "outbound",
      responseLocale: args.locale, capabilityCatalogText: "", capabilityPolicyText: "" }) },
    ...(args.recentConversation ?? []),
    { role: "user" as const, content: buildCompanyUpdatePrompt({ purpose: args.purpose, facts: args.facts }) },
  ];
}

export async function composeCompanyUpdateEmail(args: Parameters<typeof buildCompanyUpdateEmailMessages>[0]) {
  const { runOrgAgentCompletion } = await import("./chat");
  const { model } = resolveOrgAgentModel(undefined);
  const messages = buildCompanyUpdateEmailMessages(args);
  const completion = await runOrgAgentCompletion({ model, messages, allowTools: false,
    maxTokens: 2000, strictModel: true, reasoningEffort: getOrgAgentReasoningEffort(model),
    signal: AbortSignal.timeout(90_000),
    responseFormat: { type: "json_schema", json_schema: { name: "company_update_email", strict: true,
      schema: { type: "object", additionalProperties: false, required: ["subject", "body"],
        properties: { subject: { type: "string" }, body: { type: "string" } } } } },
  });
  const raw = completion.response.choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw Error("Email composition has no text");
  const email = JSON.parse(raw);
  if (typeof email.subject !== "string" || !email.subject.trim() || typeof email.body !== "string" || !email.body.trim())
    throw Error("Email composition requires subject and body");
  return { subject: email.subject as string, body: email.body as string,
    model: completion.model, usage: completion.response.usage, messages };
}
