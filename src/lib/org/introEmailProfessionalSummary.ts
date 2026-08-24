export type OrgIntroCandidateExperience = {
  companyName?: string | null;
  endDate?: string | null;
  role?: string | null;
  startDate?: string | null;
};

function cleanProfessionalFact(value: unknown) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function buildOrgIntroCandidateProfessionalSummary(
  experiences: OrgIntroCandidateExperience[]
) {
  const usable = experiences
    .map((experience) => ({
      companyName: cleanProfessionalFact(experience.companyName),
      endDate: cleanProfessionalFact(experience.endDate),
      role: cleanProfessionalFact(experience.role),
      startDate: cleanProfessionalFact(experience.startDate),
    }))
    .filter((experience) => experience.companyName || experience.role)
    .sort((left, right) => {
      const currentOrder =
        Number(Boolean(left.endDate)) - Number(Boolean(right.endDate));
      if (currentOrder !== 0) return currentOrder;
      return right.startDate.localeCompare(left.startDate);
    });
  const experience = usable[0];
  if (!experience) return null;

  const isCurrent = !experience.endDate;
  if (experience.companyName && experience.role) {
    return isCurrent
      ? `현재 ${experience.companyName}에서 ${experience.role}로 재직 중입니다.`
      : `${experience.companyName}에서 ${experience.role}로 근무한 경험이 있습니다.`;
  }
  if (experience.companyName) {
    return isCurrent
      ? `현재 ${experience.companyName}에 재직 중입니다.`
      : `${experience.companyName}에서 근무한 경험이 있습니다.`;
  }
  return `${experience.role} 경험이 있습니다.`;
}
