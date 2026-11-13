import "server-only";

import { getExaClient, type ExaSearchClient } from "@/lib/tools/exaClient";
import { companyDomain, extractEmails } from "./shared";

export { companyDomain };

/** Where a company contact address came from. Shown next to the address; never upgraded. */
export type CompanyContactSource = "manual" | "posting" | "harper_found" | "account_member";

/** `note`: who it is, when known (an account member's name and authority). */
export type CompanyContact = {
  email: string; source: CompanyContactSource; url: string | null; sameDomain: boolean; note?: string | null;
};

/**
 * "하퍼가 찾음": one web search (Exa, about a cent). Only addresses written in the returned pages are
 * kept, with the page they came from; nothing is guessed from a name pattern.
 */
export async function findCompanyContacts(args: {
  companyName: string; homepageUrl: string | null; exa?: ExaSearchClient;
}): Promise<CompanyContact[]> {
  const domain = companyDomain(args.homepageUrl);
  const exa = args.exa ?? getExaClient();
  const query = [args.companyName, domain, "채용 담당자 이메일 recruiting hiring contact email careers"].filter(Boolean).join(" ");
  const result = await (exa as any).search(query, {
    type: "auto",
    numResults: 8,
    contents: { text: { maxCharacters: 6_000 } },
  });
  const seen = new Map<string, CompanyContact>();
  for (const page of (result?.results ?? []) as Array<{ url?: string; text?: string }>) {
    for (const email of extractEmails(page.text)) {
      if (seen.has(email)) continue;
      const sameDomain = Boolean(domain && (email.endsWith(`@${domain}`) || email.endsWith(`.${domain}`)));
      seen.set(email, { email, source: "harper_found", url: page.url ?? null, sameDomain });
    }
  }
  return [...seen.values()].sort((a, b) => Number(b.sameDomain) - Number(a.sameDomain)).slice(0, 8);
}
