/**
 * Logical fields exposed to the company-side LLM.
 *
 * The model only sees these flat names. Database table/column routing is kept
 * in the mutation RPC and must stay in sync with this catalog.
 */
export const COMPANY_DATA_KEYS = [
  "company_name",
  "company_description",
  "pitch",
  "workspace_request",
  "logo_url",
  "homepage_url",
  "career_url",
  "linkedin_url",
  "short_description",
  "funding_url",
  "location",
  "founded_year",
  "employee_count_start",
  "employee_count_end",
  "specialities",
  "investors",
  "related_links",
  "total_funding_raised",
  "main_investors",
  "last_funding_stage",
  "last_funding_round_description",
  "workspace_memory",
  "role_name",
  "role_description",
  "role_external_jd_url",
  "role_location",
  "role_status",
  "role_work_mode",
  "role_employment_types",
  "role_request",
  "role_memory",
] as const;

export type CompanyDataKey = (typeof COMPANY_DATA_KEYS)[number];
export type CompanyDataChangeKind = "append" | "replace" | "rewrite";
export type CompanyDataRequestSection =
  | "hard_constraints"
  | "preferred_criteria";

type CompanyDataLogicalType =
  | "enum"
  | "integer"
  | "string_list"
  | "text"
  | "url";

export type CompanyDataCatalogEntry = {
  allowedValues?: readonly string[];
  confirmationRequired: boolean;
  longText: boolean;
  maxItems?: number;
  maxLength?: number;
  nullable: boolean;
  roleScoped: boolean;
  type: CompanyDataLogicalType;
};

const text = (args: {
  confirmationRequired?: boolean;
  longText?: boolean;
  maxLength: number;
  nullable?: boolean;
  roleScoped?: boolean;
}): CompanyDataCatalogEntry => ({
  confirmationRequired: args.confirmationRequired ?? false,
  longText: args.longText ?? false,
  maxLength: args.maxLength,
  nullable: args.nullable ?? true,
  roleScoped: args.roleScoped ?? false,
  type: "text",
});

const url = (roleScoped = false): CompanyDataCatalogEntry => ({
  confirmationRequired: false,
  longText: false,
  maxLength: 2_000,
  nullable: true,
  roleScoped,
  type: "url",
});

export const COMPANY_DATA_CATALOG: Record<
  CompanyDataKey,
  CompanyDataCatalogEntry
> = {
  company_name: text({ maxLength: 200, nullable: false }),
  company_description: text({ longText: true, maxLength: 8_000 }),
  pitch: text({ longText: true, maxLength: 8_000 }),
  workspace_request: text({
    confirmationRequired: true,
    longText: true,
    maxLength: 6_000,
  }),
  logo_url: url(),
  homepage_url: url(),
  career_url: url(),
  linkedin_url: url(),
  short_description: text({ longText: true, maxLength: 4_000 }),
  funding_url: url(),
  location: text({ maxLength: 500 }),
  founded_year: {
    confirmationRequired: false,
    longText: false,
    nullable: true,
    roleScoped: false,
    type: "integer",
  },
  employee_count_start: {
    confirmationRequired: false,
    longText: false,
    nullable: true,
    roleScoped: false,
    type: "integer",
  },
  employee_count_end: {
    confirmationRequired: false,
    longText: false,
    nullable: true,
    roleScoped: false,
    type: "integer",
  },
  specialities: {
    confirmationRequired: false,
    longText: false,
    maxItems: 24,
    nullable: false,
    roleScoped: false,
    type: "string_list",
  },
  investors: {
    confirmationRequired: false,
    longText: false,
    maxItems: 24,
    nullable: false,
    roleScoped: false,
    type: "string_list",
  },
  related_links: {
    confirmationRequired: false,
    longText: false,
    maxItems: 12,
    nullable: false,
    roleScoped: false,
    type: "string_list",
  },
  total_funding_raised: text({ maxLength: 1_000 }),
  main_investors: text({ maxLength: 2_000 }),
  last_funding_stage: text({ maxLength: 300 }),
  last_funding_round_description: text({
    longText: true,
    maxLength: 8_000,
  }),
  workspace_memory: text({
    confirmationRequired: true,
    longText: true,
    maxLength: 12_000,
  }),
  role_name: text({ maxLength: 200, nullable: false, roleScoped: true }),
  role_description: text({
    longText: true,
    maxLength: 20_000,
    roleScoped: true,
  }),
  role_external_jd_url: url(true),
  role_location: text({ maxLength: 300, roleScoped: true }),
  role_status: {
    allowedValues: ["top_priority", "active", "paused", "ended"],
    confirmationRequired: false,
    longText: false,
    nullable: false,
    roleScoped: true,
    type: "enum",
  },
  role_work_mode: {
    allowedValues: ["onsite", "hybrid", "remote"],
    confirmationRequired: false,
    longText: false,
    nullable: true,
    roleScoped: true,
    type: "enum",
  },
  role_employment_types: {
    allowedValues: ["full_time", "part_time", "internship", "contract"],
    confirmationRequired: false,
    longText: false,
    maxItems: 4,
    nullable: false,
    roleScoped: true,
    type: "string_list",
  },
  role_request: text({
    confirmationRequired: true,
    longText: true,
    maxLength: 20_000,
    roleScoped: true,
  }),
  role_memory: text({
    confirmationRequired: true,
    longText: true,
    maxLength: 12_000,
    roleScoped: true,
  }),
};

export const COMPANY_DETAILS_LONG_TEXT_KEYS = [
  "company_description",
  "pitch",
  "workspace_request",
  "short_description",
  "last_funding_round_description",
] as const;

export type CompanyDetailsLongTextKey =
  (typeof COMPANY_DETAILS_LONG_TEXT_KEYS)[number];

export function isCompanyDataKey(value: string): value is CompanyDataKey {
  return (COMPANY_DATA_KEYS as readonly string[]).includes(value);
}

export function isCompanyDetailsLongTextKey(
  value: string
): value is CompanyDetailsLongTextKey {
  return (COMPANY_DETAILS_LONG_TEXT_KEYS as readonly string[]).includes(value);
}

export function companyDataTargetKey(
  key: CompanyDataKey,
  roleId: string | null
) {
  return `${key}:${roleId ?? "workspace"}`;
}

const COMPANY_DATA_LABELS: Record<CompanyDataKey, string> = {
  company_name: "회사명",
  company_description: "회사 소개",
  pitch: "후보자 안내 문구",
  workspace_request: "기존 회사 요청",
  logo_url: "로고 주소",
  homepage_url: "홈페이지",
  career_url: "채용 페이지",
  linkedin_url: "LinkedIn",
  short_description: "한 줄 회사 소개",
  funding_url: "투자 정보 링크",
  location: "회사 위치",
  founded_year: "설립 연도",
  employee_count_start: "직원 수 최소",
  employee_count_end: "직원 수 최대",
  specialities: "주요 분야",
  investors: "투자사",
  related_links: "관련 링크",
  total_funding_raised: "누적 투자금",
  main_investors: "주요 투자사 설명",
  last_funding_stage: "최근 투자 단계",
  last_funding_round_description: "최근 투자 설명",
  workspace_memory: "회사 메모",
  role_name: "포지션명",
  role_description: "포지션 설명",
  role_external_jd_url: "외부 채용 공고",
  role_location: "포지션 근무지",
  role_status: "포지션 상태",
  role_work_mode: "근무 방식",
  role_employment_types: "고용 형태",
  role_request: "채용 기준",
  role_memory: "포지션 메모",
};

export function companyDataDisplayLabel(
  key: CompanyDataKey,
  roleName?: string | null
) {
  const label = COMPANY_DATA_LABELS[key];
  return COMPANY_DATA_CATALOG[key].roleScoped && roleName
    ? `${roleName} · ${label}`
    : label;
}
