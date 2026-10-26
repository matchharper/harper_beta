import { projectCompanyPublicProfileFromDetail } from "../publicProfile";
import type { OrgCandidateProfilePreview } from "../candidatePreview";
import { orgTalentReferenceHref } from "./talentReference";

/** Reuse the authorized card projection; never query private candidate data here. */
export function projectOrgCandidateDetailForAgent(detail: OrgCandidateProfilePreview, includeProfile: boolean) {
  return {
    candidate: { talentId: detail.talent.userId, name: detail.talent.name,
      email: null, headline: detail.talent.headline },
    profilePreview: true,
    profileUrl: orgTalentReferenceHref({ workspaceId: detail.workspace.workspaceId, roleId: detail.role.roleId, talentId: detail.talent.userId }),
    positions: [],
    profileIncluded: includeProfile,
    profile: includeProfile ? projectCompanyPublicProfileFromDetail(detail.profile) : null,
    recentProgress: [], requestHistory: [], harperSharedInformation: null,
    meetingHistory: null, scheduledFollowups: null,
    resumeAvailability: { available: false },
    responseGuide: `이 후보자는 ${detail.role.name}에서 프로필만 확인했다. 이 조회로 추천·Intro·연락·파이프라인 기록은 생성하지 않았다. 평가·추천 여부와 연락 이력은 이 결과로 확정할 수 없다.`,
  };
}
