import type { TalentStructuredProfile } from "@/lib/talentOnboarding/models";

// Include career evidence without contact details, row IDs or account settings.
export function simulationProfileSnapshot(profile: TalentStructuredProfile) {
  const user = profile.talentUser;
  return JSON.stringify({
    source: "Saved profile records. Omitted values are not recorded; they do not state current employment, completion or lack of experience. Explicit resume facts and user corrections remain separate evidence.",
    headline: user?.headline,
    bio: user?.bio,
    location: user?.current_location ?? user?.location,
    experiences: profile.talentExperiences.map((e) => ({
      role: e.role,
      company: e.company_name,
      startDate: e.start_date ?? undefined,
      endDate: e.end_date ?? undefined,
      recordedDurationMonths: e.months ?? undefined,
      employmentType: e.employment_type,
      location: e.company_location,
      description: e.description,
      context: e.memo,
    })),
    education: profile.talentEducations.map((e) => ({
      school: e.school,
      degree: e.degree,
      field: e.field,
      startDate: e.start_date ?? undefined,
      endDate: e.end_date ?? undefined,
      description: e.description,
      context: e.memo,
    })),
    additionalExperience: profile.talentExtras.map((e) => ({
      title: e.title,
      date: e.date,
      description: e.description,
      context: e.memo,
    })),
  });
}
