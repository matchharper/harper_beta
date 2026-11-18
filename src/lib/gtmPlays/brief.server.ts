import "server-only";

import { gtmStructuredCall } from "./llm.server";
import { gtmCompanyDescription } from "./publicName.server";
import { cleanPublicDescription, gtmRoleName, withoutCompanyName, type GtmBrief, type GtmJd } from "./shared";

type BriefDraft = {
  publicDescription: string;
  request: string;
  criteria: Array<{ name: string; criteria: string; requirement: "must" | "preferred" }>;
};

/** One call (gpt-6-luna): the posting's own requirements as a short request and 3~6 criteria. */
export async function draftGtmBrief(jd: GtmJd): Promise<GtmBrief> {
  const draft = await gtmStructuredCall<BriefDraft>({
    label: "ops/gtm-plays:brief",
    schemaName: "gtm_role_brief",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["publicDescription", "request", "criteria"],
      properties: {
        publicDescription: { type: "string" },
        request: { type: "string" },
        criteria: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "criteria", "requirement"],
            properties: {
              name: { type: "string" },
              criteria: { type: "string" },
              requirement: { type: "string", enum: ["must", "preferred"] },
            },
          },
        },
      },
    },
    system: [
      "You turn one job posting into the hiring request a recruiter searches with.",
      "request: 3~6 sentences in the posting's language: the company, what the person will do, and who fits. Use only what the posting says.",
      "criteria: 3~6 items a public profile can show (experience, skills, domain, seniority, location). Mark must only for what the posting states as required.",
      "name is a short label; criteria is one sentence. Do not invent requirements, salary or benefits.",
      "publicDescription: how candidates will read the company without its name: 2~4 words in Korean from what the posting says (industry, stage, product kind), e.g. 결제 스타트업, AI 반도체 회사, B2B SaaS 스타트업. Never the company's name, its product or brand names, or its investors.",
    ].join("\n"),
    user: [
      `Company: ${jd.companyName}`,
      `Title: ${jd.title}`,
      jd.location ? `Location: ${jd.location}` : null,
      "Posting:",
      jd.description.slice(0, 12_000) || "(no text)",
    ].filter(Boolean).join("\n"),
  });
  const criteria = (draft.criteria ?? [])
    .map((item, index) => ({
      id: `gtm-${index + 1}`,
      name: String(item.name ?? "").trim().slice(0, 80),
      criteria: String(item.criteria ?? "").trim().slice(0, 400),
      requirement: item.requirement === "must" ? "must" as const : "preferred" as const,
      importance: item.requirement === "must" ? 3 : 2,
    }))
    .filter((item) => item.name && item.criteria)
    .slice(0, 6);
  // A company that already has GTM Roles keeps the description it has (one company reads the same everywhere).
  const publicDescription = await gtmCompanyDescription(jd.companyName)
    ?? cleanPublicDescription(withoutCompanyName(String(draft.publicDescription ?? ""), jd.companyName, "")) ?? "";
  return {
    roleName: gtmRoleName(jd), publicDescription, request: String(draft.request ?? "").trim().slice(0, 4_000), criteria,
  };
}
