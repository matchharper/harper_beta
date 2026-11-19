/**
 * #5 지원자 명단: a company's own applicant list (Shaun 11/19, the first one from a customer) uploaded on /ops as its own
 * source "applicants-<company>", next to the LinkedIn Recruiter export (source "linkedin"). The company name is written
 * in English (source ids are ASCII). /ops shows "<Company> 지원자", the matcher reads "<Company> 공고 지원 · <job>", and
 * that company's own postings are never proposed to its applicants. Pure.
 */
const PREFIX = "applicants-";

/** The source id of a list from this company, or null when the name has no English letters or digits. */
export function applicantListSource(company: string | null | undefined): string | null {
  const slug = String(company ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60).replace(/-+$/, "");
  return slug ? `${PREFIX}${slug}` : null;
}

/** The company of an applicant-list source ("applicants-acme-labs" → "Acme Labs"), else null. */
export function applicantListCompany(source: string | null | undefined): string | null {
  if (!source?.startsWith(PREFIX)) return null;
  const words = source.slice(PREFIX.length).split("-").filter(Boolean);
  return words.length ? words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") : null;
}
