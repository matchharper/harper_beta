import type { TalentStructuredProfile } from "@/lib/talentOnboarding/models";

/** Explicit projection: no settings, links, row IDs, or unrelated stored context. */
export function buildMockInterviewCandidateContext(
  profile: TalentStructuredProfile
) {
  const user = profile.talentUser;
  return JSON.stringify({
    name: user?.name,
    headline: user?.headline,
    bio: user?.bio,
    experiences: profile.talentExperiences.slice(0, 12).map((item) => ({
      company: item.company_name,
      role: item.role,
      startDate: item.start_date,
      endDate: item.end_date,
      description: item.description,
      memo: item.memo,
    })),
    educations: profile.talentEducations.slice(0, 8).map((item) => ({
      school: item.school,
      degree: item.degree,
      field: item.field,
      startDate: item.start_date,
      endDate: item.end_date,
      description: item.description,
      memo: item.memo,
    })),
    activities: profile.talentExtras.slice(0, 10).map((item) => ({
      title: item.title,
      date: item.date,
      description: item.description,
      memo: item.memo,
    })),
  });
}
