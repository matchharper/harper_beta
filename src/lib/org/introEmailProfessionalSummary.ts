import { formatLlmPartialDate } from "@/lib/llm/promptDateTime";

export type OrgIntroCandidateExperience = {
  companyName?: string | null;
  endDate?: string | null;
  role?: string | null;
  startDate?: string | null;
  description?: string | null;
};

function cleanProfessionalFact(value: unknown) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
      description: String(experience.description ?? "").trim(),
    }))
    .filter((experience) => experience.companyName || experience.role)
    .sort((left, right) => right.startDate.localeCompare(left.startDate));
  if (!usable.length) return null;

  // Supply the shared source facts; a missing end date does not establish
  // current employment, and the original writer chooses relevant experience.
  return usable.map(experience => [
    `${experience.role || "직함 미기록"} · ${experience.companyName || "회사 미기록"}`,
    `시작: ${experience.startDate ? formatLlmPartialDate(experience.startDate) : "미기록"}; 종료: ${experience.endDate ? formatLlmPartialDate(experience.endDate) : "미기록 (현재 재직 여부 미확인)"}`,
    experience.description,
  ].filter(Boolean).join("\n")).join("\n\n");
}
