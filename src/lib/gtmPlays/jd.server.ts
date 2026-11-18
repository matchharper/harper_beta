import "server-only";

import { fetchCareerJobPosting } from "@/lib/career/jobLinkImport";
import { getExaClient } from "@/lib/tools/exaClient";
import { extractEmails, type GtmJd } from "./shared";

function clean(value: unknown, max: number) {
  return String(value ?? "").replace(/\r/g, "").trim().slice(0, max);
}

/** Reads a posting the same way a candidate's saved link is read (Exa contents, a fraction of a cent). */
export async function readJdFromUrl(url: string): Promise<GtmJd> {
  const exa = String(process.env.EXA_API_KEY ?? "").trim() ? getExaClient() : undefined;
  const draft = await fetchCareerJobPosting({ exa, url });
  const description = clean(draft.description ?? draft.descriptionSummary, 16_000);
  return {
    source: "url",
    companyName: clean(draft.companyName, 200),
    title: clean(draft.title, 200),
    description,
    url: draft.canonicalUrl ?? url,
    location: draft.location,
    sourceRoleId: null,
    sourceWorkspaceId: null,
    contactEmails: extractEmails(description),
  };
}
