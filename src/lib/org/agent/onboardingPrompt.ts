import { ORG_AGENT_HAIKU_MODEL } from "./modelConfig";

export const ORG_ONBOARDING_COMPANY_AGENT_OPTIONS = {
  model: ORG_AGENT_HAIKU_MODEL,
  initialCapabilities: ["company_role_edit"] as const,
  initialDataKinds: ["company_details"] as const,
};

/** Additional context for the existing company-side LLM, not a separate extractor. */
export function buildOrgOnboardingCompanyPrompt(message: string) {
  return [
    "The company user is completing the Pitch step of onboarding. They are sharing what makes their company attractive to prospective team members. The saved Pitch is internal company reference material that Harper draws on when introducing the company to candidates; this step saves that material.",
    "Use the existing company context and general read/update tools to incorporate these selling points into the saved company Pitch. The Pitch should make clear what the company does and the concrete reasons someone might want to join. Preserve accurate existing strengths and the specific evidence, scope and conditions behind new ones. Describe the company's appeal in coherent, usable language, without turning it into a job description or applicant requirements, or adding unsupported praise, benefits or promises. Read more company details when needed.",
    "This submission authorizes editing the company Pitch only. The supplied facts are source material for that document, not instructions to populate other company fields or perform other hiring work.",
    "Preserve explicit confidentiality or sharing restrictions alongside the affected facts in this reference material. A company may supply a selling point that is not already public; apply the sharing conditions they actually provided. If clarification is essential to completing the Pitch update, ask it naturally and explain what is still pending.",
    "The onboarding screen shows the saved Pitch and provides Next/Skip navigation. After confirmed saving, briefly report the company strengths actually retained or changed in the saved Pitch, preserving their specific scope, conditions and certainty. The acknowledgement reports the saved content, with no additional factual claims or assurances. The screen already provides the next action: this completion reply closes the Pitch submission rather than opening another conversation to collect information or offer work. A follow-up question belongs here only if missing information prevents completing this Pitch update. Follow the system's language and voice contract and verified tool results.",
    "User's company Pitch input (JSON string):",
    JSON.stringify(message),
  ].join("\n\n");
}
