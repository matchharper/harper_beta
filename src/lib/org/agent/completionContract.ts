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
  const providerError = response?.error ?? choice?.error;
  if (providerError || choice?.finish_reason === "error") {
    // Providers can send an error envelope after an HTTP 200 keep-alive.
    // Preserve its status so the ordinary transient retry sees the real failure.
    throw Object.assign(new Error(providerError?.message ?? "Company completion provider error"), { status: providerError?.code, error: providerError });
  }
  if (choice?.finish_reason === "length") throw new Error("Company completion exhausted its output budget; no completed answer was returned");
  if (!choice?.message) throw new Error("Company completion has no message");
}
