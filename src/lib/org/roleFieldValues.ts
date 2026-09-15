export const ORG_ROLE_WORK_MODE_VALUES = [
  "onsite",
  "hybrid",
  "remote",
] as const;

export type OrgRoleWorkMode = (typeof ORG_ROLE_WORK_MODE_VALUES)[number];

export const ORG_ROLE_EMPLOYMENT_TYPE_VALUES = [
  "full_time",
  "part_time",
  "internship",
  "contract",
] as const;

export type OrgRoleEmploymentType =
  (typeof ORG_ROLE_EMPLOYMENT_TYPE_VALUES)[number];

function normalizedAlias(value: unknown) {
  return String(value ?? "")
    .replace(/[\s_-]+/g, " ")
    .trim()
    .toLowerCase();
}

// Exact structural synonyms only. Longer phrases stay invalid so this layer
// never guesses a user's work conditions or employment arrangement.
const ORG_ROLE_WORK_MODE_ALIASES: Record<string, OrgRoleWorkMode> = {
  "on site": "onsite",
  "on site work": "onsite",
  onsite: "onsite",
  "onsite work": "onsite",
  office: "onsite",
  "office based": "onsite",
  "office work": "onsite",
  대면: "onsite",
  "대면 근무": "onsite",
  사무실: "onsite",
  "사무실 근무": "onsite",
  오피스: "onsite",
  "오피스 근무": "onsite",
  출근: "onsite",
  "출근 근무": "onsite",
  hybrid: "hybrid",
  "hybrid work": "hybrid",
  하이브리드: "hybrid",
  "하이브리드 근무": "hybrid",
  혼합: "hybrid",
  "혼합 근무": "hybrid",
  remote: "remote",
  "remote work": "remote",
  원격: "remote",
  "원격 근무": "remote",
  재택: "remote",
  "재택 근무": "remote",
};

const ORG_ROLE_EMPLOYMENT_TYPE_ALIASES: Record<
  string,
  OrgRoleEmploymentType
> = {
  "full time": "full_time",
  fulltime: "full_time",
  정규직: "full_time",
  풀타임: "full_time",
  "part time": "part_time",
  parttime: "part_time",
  시간제: "part_time",
  파트타임: "part_time",
  intern: "internship",
  internship: "internship",
  인턴: "internship",
  인턴십: "internship",
  contract: "contract",
  contractor: "contract",
  계약직: "contract",
};

export function parseOrgRoleWorkMode(
  value: unknown
): OrgRoleWorkMode | null {
  return ORG_ROLE_WORK_MODE_ALIASES[normalizedAlias(value)] ?? null;
}

export function parseOrgRoleEmploymentType(
  value: unknown
): OrgRoleEmploymentType | null {
  return ORG_ROLE_EMPLOYMENT_TYPE_ALIASES[normalizedAlias(value)] ?? null;
}
