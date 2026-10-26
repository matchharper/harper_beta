import { OrgCandidateReviewContent } from "@/components/org/OrgCandidateReviewContent";
import type { OrgTalentProfileContentProps } from "@/components/org/OrgTalentProfile";
import type { OrgBoardProfileLabel } from "@/lib/org/server";
import type { RoleStartCandidateView } from "@/lib/org/roleStart/view";

/** Company-safe profile fields already returned by GET /api/org/role-start. */
export type FirstThreeProfile = {
  recentCompanies: OrgBoardProfileLabel[];
  recentSchools: OrgBoardProfileLabel[];
  experiences: Array<{
    company: string | null;
    role: string | null;
    start: string | null;
    end: string | null;
    description: string | null;
  }>;
};

/** Adapt Align data without inventing an inbox recommendation or fetching contact details. */
export function RoleStartCandidateProfile({
  candidate,
  profile,
}: {
  candidate: RoleStartCandidateView;
  profile: FirstThreeProfile | undefined;
}) {
  const criteriaEvaluations = (candidate.verdict?.criteria ?? []).map(
    (item) => ({
      name: item.name,
      fitness: item.fitness,
      content: item.evidence,
    })
  );
  const detail: OrgTalentProfileContentProps["detail"] = {
    talent: {
      userId: candidate.talentId,
      name: candidate.name,
      headline: candidate.headline ?? candidate.current,
      bio: null,
      email: null,
      profilePicture: null,
    },
    profile: {
      bio: null,
      location: candidate.location,
      experiences: (profile?.experiences ?? []).map((item) => ({
        companyName: item.company,
        role: item.role,
        startDate: item.start,
        endDate: item.end,
        description: item.description,
        companyLogo: null,
        companyLocation: null,
        employmentType: null,
        memo: null,
      })),
      educations: (profile?.recentSchools ?? []).map((item) => ({
        school: item.label,
        // Labels carry display text, not separate degree/date fields.
        description:
          [item.detail === item.label ? null : item.detail, item.period]
            .filter(Boolean)
            .join(" · ") || null,
        degree: null,
        field: null,
        startDate: null,
        endDate: null,
        memo: null,
        url: null,
      })),
      extras: [],
      documents: [],
      registeredLinks: [],
    },
    profileMarkdown: "",
    resume: { fileName: null, hasStorageFile: false, links: [] },
    criteriaEvaluations,
    companyPresentation: candidate.verdict
      ? {
          tldr: candidate.verdict.tldr,
          harperNote: "",
          finalFit: null,
          criteriaEvaluations,
        }
      : null,
  };

  return <OrgCandidateReviewContent detail={detail} onResumeClick={() => {}} />;
}
