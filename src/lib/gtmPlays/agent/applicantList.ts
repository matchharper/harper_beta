/**
 * #5 회사 지원자 명단: people from a company's own applicant list carry the source "applicants-<company>" (Shaun 11/19:
 * a rare case, set on the rows by hand; the usual file is the LinkedIn Recruiter export, source "linkedin", left as
 * it is). For them the agent never proposes that company's own postings and never pays to look an email up (only the
 * address the company gave). /ops and reply alerts show "<Company> 지원자". Pure.
 */
const PREFIX = "applicants-";

/** The company of an applicant-list source ("applicants-acme-labs" → "Acme Labs"), else null. */
export function applicantListCompany(source: string | null | undefined): string | null {
  if (!source?.startsWith(PREFIX)) return null;
  const words = source.slice(PREFIX.length).split("-").filter(Boolean);
  return words.length ? words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") : null;
}
