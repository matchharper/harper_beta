import { getExaClient, type ExaSearchClient } from "@/lib/tools/exaClient";
import { readOnboardingJobs } from "./onboardingJobs";
import type { OrgWorkspace } from "./server";

export async function findOnboardingJobs(workspace: OrgWorkspace, exa: ExaSearchClient = getExaClient()) {
  const profile = workspace.companyProfile;
  const identity = [workspace.companyName, profile?.homepageUrl, profile?.careerUrl, profile?.linkedinUrl]
    .filter(Boolean).join(" ");
  const result = await exa.search(`${identity} careers jobs 채용 공고 currently hiring open positions`, {
    type: "auto",
    numResults: 10,
    contents: { highlights: true },
    systemPrompt: `Find currently open, individual job postings for this company: ${identity}. Prefer its official careers site or ATS; a job board is fine. Return up to two distinct roles supported by these search results, with the original role title and direct job posting URL. Exclude expired or closed postings, generic careers pages, and other companies. If none are supported, return an empty jobs array. Do not invent roles or URLs.`,
    outputSchema: {
      type: "object",
      properties: {
        jobs: { type: "array", maxItems: 2, items: {
          type: "object",
          properties: {
            title: { type: "string", description: "The original title of one currently open role." },
            url: { type: "string", description: "The exact URL of that individual job posting, not a company jobs directory or search results page. Omit the role if its individual posting URL is unavailable." },
          },
          required: ["title", "url"],
        } },
      },
      required: ["jobs"],
    },
  });
  const content = result.output?.content;
  try {
    const data = typeof content === "string" ? JSON.parse(content) : content;
    return readOnboardingJobs(data?.jobs);
  } catch { return []; }
}
