import "server-only";

import { gtmStructuredCall } from "./llm.server";
import { gtmRoleName, type GtmBrief, type GtmJd } from "./shared";

export { gtmRoleName, type GtmBrief };

type BriefDraft = {
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
      required: ["request", "criteria"],
      properties: {
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
  return { roleName: gtmRoleName(jd), request: String(draft.request ?? "").trim().slice(0, 4_000), criteria };
}
