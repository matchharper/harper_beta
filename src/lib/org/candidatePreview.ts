import type { OrgTalentDetailResponse } from "./server";

/** A profile read has no recommendation, pipeline stage, or candidate-contact effect. */
export type OrgCandidateProfilePreview = Pick<
  OrgTalentDetailResponse,
  "profile" | "profileMarkdown" | "talent" | "resume" | "workspace"
> & {
  profilePreview: true;
  role: Pick<OrgTalentDetailResponse["role"], "roleId" | "name">;
};

export type OrgCandidateDetailResult =
  | OrgTalentDetailResponse
  | OrgCandidateProfilePreview;

export function isOrgCandidateProfilePreview(
  value: OrgCandidateDetailResult | undefined
): value is OrgCandidateProfilePreview {
  return Boolean(value && "profilePreview" in value && value.profilePreview);
}

export function canPreviewCompanyCandidate(args: {
  deletedAt: string | null;
  setting: {
    is_onboarding_done: boolean;
    profile_visibility: string;
    get_internal_recommendation: boolean | null;
    blocked_companies: string[] | null;
  } | null;
  companyNames: Array<string | null>;
  /**
   * 후보자 링크 (#1): this company has a card the candidate's own link made, with their consent standing
   * (company_intro_share_link_consent_v1). Their matching settings do not hide them from this company; a deleted
   * account, unfinished onboarding and a blocked company still do.
   */
  candidateLinkConsent?: boolean;
}) {
  const names = new Set(args.companyNames.map(value => value?.trim().toLowerCase()).filter(Boolean));
  return args.deletedAt === null &&
    args.setting?.is_onboarding_done === true &&
    (args.candidateLinkConsent === true || (
      args.setting.profile_visibility === "open_to_matches" &&
      args.setting.get_internal_recommendation !== false
    )) &&
    !args.setting.blocked_companies?.some(name => names.has(name.trim().toLowerCase()));
}

