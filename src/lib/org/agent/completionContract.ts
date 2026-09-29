import { ORG_AGENT_GEMINI_FLASH_MODEL, type OrgAgentModelId, type OrgAgentReasoningEffort } from "./modelConfig";

export function companyCompletionTokenBudget(model: OrgAgentModelId, requested: number, reasoning?: OrgAgentReasoningEffort) {
  return Math.max(requested, reasoning === "max" ? 12_000 : model === ORG_AGENT_GEMINI_FLASH_MODEL ? 8_192 : 0);
}

export function companyCompletionProviderHint(response: any): string | undefined {
  return response?.provider === "Google" ? "google-vertex"
    : response?.provider === "Google AI Studio" ? "google-ai-studio" : undefined;
}

export function validateCompanyCompletion(response: any) {
  const choice = response?.choices?.[0];
  if (choice?.error || choice?.finish_reason === "error") {
    throw Object.assign(new Error(choice.error?.message ?? "Company completion provider error"), { status: choice.error?.code, error: choice.error });
  }
  if (choice?.finish_reason === "length") throw new Error("Company completion exhausted its output budget; no completed answer was returned");
  if (!choice?.message) throw new Error("Company completion has no message");
}
