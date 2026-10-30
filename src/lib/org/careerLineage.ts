import type {
  OrgProfileEducation,
  OrgProfileExperience,
} from "@/lib/org/server";
import { getSchoolLogo } from "@/utils/school_logo";

export type CareerLineageStep = {
  detail: string | null;
  /** Months spent there, up to now for a place not left yet. */
  months: number | null;
  key: string;
  kind: "company" | "school";
  logoUrl: string | null;
  name: string;
  sortDate: string | null;
};

/** Year and month of a profile date ("2019", "2019-03", "2019-03-01"). */
function yearMonth(value: string | null | undefined) {
  const match = value?.match(/^(\d{4})(?:-(\d{1,2}))?/);
  if (!match) return null;
  return {
    month: match[2] ? Number(match[2]) : null,
    year: Number(match[1]),
  };
}

/**
 * Whole months between two profile dates. A date with only a year counts
 * whole years, so 2019–2023 is 4 years rather than a guessed month.
 */
export function monthsBetween(
  start: string | null | undefined,
  end: string | null | undefined,
  now = new Date()
) {
  const from = yearMonth(start);
  if (!from) return null;
  const to = end
    ? yearMonth(end)
    : { month: now.getMonth() + 1, year: now.getFullYear() };
  if (!to) return null;
  const months =
    from.month && to.month
      ? (to.year - from.year) * 12 + (to.month - from.month)
      : (to.year - from.year) * 12;
  return months > 0 ? months : null;
}

/** Latest school and up to three longest jobs, displayed oldest first. */
export function buildCareerLineage(args: {
  educations: OrgProfileEducation[];
  experiences: OrgProfileExperience[];
  now?: Date;
}): CareerLineageStep[] {
  const schools: CareerLineageStep[] = args.educations.flatMap(
    (education, index) => {
      const name = education.school?.trim();
      if (!name) return [];
      return [
        {
          detail:
            [education.degree, education.field]
              .map((value) => value?.trim())
              .filter(Boolean)
              .join(" · ") || null,
          key: `school:${index}`,
          kind: "school" as const,
          logoUrl: getSchoolLogo(education.url, name) ?? null,
          months: monthsBetween(
            education.startDate,
            education.endDate,
            args.now
          ),
          name,
          sortDate: education.startDate ?? education.endDate,
        },
      ];
    }
  );
  const jobs: CareerLineageStep[] = args.experiences.flatMap(
    (experience, index) => {
      const name = experience.companyName?.trim();
      if (!name) return [];
      return [
        {
          detail: experience.role?.trim() || null,
          key: `company:${index}`,
          kind: "company" as const,
          logoUrl: experience.companyLogo,
          months: monthsBetween(
            experience.startDate,
            experience.endDate,
            args.now
          ),
          name,
          sortDate: experience.startDate ?? experience.endDate,
        },
      ];
    }
  );
  const selectedSchools = schools
    .sort((left, right) =>
      (right.sortDate ?? "").localeCompare(left.sortDate ?? "")
    )
    .slice(0, 1);
  const selectedJobs = jobs
    .sort((left, right) => (right.months ?? 0) - (left.months ?? 0))
    .slice(0, 3);

  // Undated schools stay first and undated jobs last.
  const order = (step: CareerLineageStep) =>
    step.sortDate ?? (step.kind === "school" ? "0000" : "9999");
  return [...selectedSchools, ...selectedJobs].sort((left, right) =>
    order(left).localeCompare(order(right))
  );
}
