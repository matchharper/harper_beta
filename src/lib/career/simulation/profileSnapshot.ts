import type { TalentStructuredProfile } from "@/lib/talentOnboarding/models";

// Include career evidence without contact details, row IDs or account settings.
export function simulationProfileSnapshot(profile: TalentStructuredProfile) {
  const user = profile.talentUser;
  return JSON.stringify({
    headline: user?.headline,
    bio: user?.bio,
    location: user?.current_location ?? user?.location,
    experiences: profile.talentExperiences.map((e) => ({
      role: e.role,
      company: e.company_name,
      startDate: e.start_date,
      endDate: e.end_date,
      months: e.months,
      employmentType: e.employment_type,
      location: e.company_location,
      description: e.description,
      context: e.memo,
    })),
    education: profile.talentEducations.map((e) => ({
      school: e.school,
      degree: e.degree,
      field: e.field,
      startDate: e.start_date,
      endDate: e.end_date,
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
