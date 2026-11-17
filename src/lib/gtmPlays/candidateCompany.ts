import { GTM_ROLE_PURPOSE } from "./constants";
import { gtmPostingTitle } from "./shared";

/**
 * #4 후보자 아웃바운드: a 'Harper GTM' Role is a posting of another company, kept in Harper's GTM workspace. A
 * candidate who got it from a #4 mail reads it with that company's own name, not the workspace's. One reader for
 * every candidate screen that names an internal Role's company (내 기회 cards, Career's Role context); the database
 * readers use candidate_company_name_v1 / candidate_role_title_v1 with the same rule.
 */
export type GtmRoleFacts = { purpose?: string | null; gtmCompany?: string | null };

export function gtmRoleFactsFromInformation(information: unknown): GtmRoleFacts {
  const info = information && typeof information === "object" && !Array.isArray(information)
    ? information as Record<string, unknown> : {};
  const gtm = info.gtm && typeof info.gtm === "object" && !Array.isArray(info.gtm) ? info.gtm as Record<string, unknown> : {};
  return {
    purpose: typeof info.purpose === "string" ? info.purpose : null,
    gtmCompany: typeof gtm.companyName === "string" ? gtm.companyName : null,
  };
}

function gtmCompany(facts: GtmRoleFacts | null | undefined) {
  const company = facts?.purpose === GTM_ROLE_PURPOSE ? facts.gtmCompany?.trim() : "";
  return company || null;
}

/** The company candidates read for an internal Role: the workspace's name, or a GTM Role's own company. */
export function candidateCompanyName(workspaceName: string, facts?: GtmRoleFacts | null) {
  return gtmCompany(facts) ?? workspaceName;
}

/** The Role title candidates read: a GTM Role's name without its company in front ("회사 · 직함" → "직함"). */
export function candidateRoleTitle(roleName: string, facts?: GtmRoleFacts | null) {
  const company = gtmCompany(facts);
  return company ? gtmPostingTitle(roleName, company) || roleName : roleName;
}
