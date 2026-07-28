import type { Tables } from "@/types/database.types";
import {
  getOfficialJobsApplyHelpAbtestType,
  OFFICIAL_JOBS_LANDING_SOURCE,
  parseOfficialJobsApplyHelpVariant,
} from "@/lib/officialJobs/landingLogs";
import {
  formatOfficialJobsCopy,
  getOfficialJobsCopy,
  type OfficialJobsLocale,
} from "@/lib/officialJobs/copy";

export const OFFICIAL_JOBS_LOGIN_HREF = buildOfficialJobsLoginHref();

export const OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE = "internal_internal";
export const OFFICIAL_JOBS_INTERNAL_COPY_SLUG = "internal-internal";
export const OFFICIAL_JOBS_ONBOARDING_JOB_PARAM = "job";
export const OFFICIAL_JOBS_ONBOARDING_COMPANY_PARAM = "job_company";
export const OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM = "job_slug";
export const OFFICIAL_JOBS_COMPANY_NAME_MAX_LENGTH = 160;
export const OFFICIAL_JOBS_ROLE_TITLE_MAX_LENGTH = 140;
export const OFFICIAL_JOBS_ONBOARDING_INTENT_EVENT_TYPE =
  "official_jobs_signup_intent";

export type OfficialJobsCareerJob = {
  companyName?: string | null;
  roleTitle?: string | null;
  slug?: string | null;
};

export function normalizeOfficialJobsRoleTitle(value?: string | null) {
  return String(value ?? "")
    .trim()
    .slice(0, OFFICIAL_JOBS_ROLE_TITLE_MAX_LENGTH);
}

export function normalizeOfficialJobsCompanyName(value?: string | null) {
  const companyName = String(value ?? "")
    .trim()
    .slice(0, OFFICIAL_JOBS_COMPANY_NAME_MAX_LENGTH);
  if (
    companyName.toLocaleLowerCase("en-US") === "harper" ||
    companyName.toLocaleLowerCase("en-US") === "[harper]"
  ) {
    return "[Harper]";
  }
  return companyName;
}

export function buildOfficialJobsOnboardingIntentPrompt(
  roleTitle?: string | null
) {
  const normalizedRoleTitle = normalizeOfficialJobsRoleTitle(roleTitle);
  if (!normalizedRoleTitle) return "";
  const roleTitleLiteral = JSON.stringify(normalizedRoleTitle);

  return `현재 유저는 ${roleTitleLiteral} 역할에 대한 관심을 가지고 Harper에 가입했다. 온보딩(5분 커리어 인터뷰) 완료 후 해당 역할로의 연결을 도와준다. 연결을 위해서는 우선 5분 커리어 인터뷰를 완료해야한다.`;
}

export function buildOfficialJobsCareerHref(job?: OfficialJobsCareerJob) {
  const params = new URLSearchParams({
    source: OFFICIAL_JOBS_LANDING_SOURCE,
  });
  const roleTitle = normalizeOfficialJobsRoleTitle(job?.roleTitle);
  const companyName = normalizeOfficialJobsCompanyName(job?.companyName);
  const slug = String(job?.slug ?? "").trim();

  if (roleTitle) params.set(OFFICIAL_JOBS_ONBOARDING_JOB_PARAM, roleTitle);
  if (companyName) {
    params.set(OFFICIAL_JOBS_ONBOARDING_COMPANY_PARAM, companyName);
  }
  if (slug) params.set(OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM, slug);

  return `/career?${params.toString()}`;
}

export function buildOfficialJobsLoginHref(
  localId?: string | null,
  nextPath = "/career",
  experimentAbtestType?: string | null
) {
  const params = new URLSearchParams({
    next: nextPath,
    source: OFFICIAL_JOBS_LANDING_SOURCE,
  });
  const normalizedLocalId = String(localId ?? "").trim();
  if (normalizedLocalId) params.set("lid", normalizedLocalId);
  const experimentVariant =
    parseOfficialJobsApplyHelpVariant(experimentAbtestType);
  if (experimentVariant) {
    params.set("ab", getOfficialJobsApplyHelpAbtestType(experimentVariant));
  }

  try {
    const nextUrl = new URL(nextPath, "https://matchharper.com");
    const source = nextUrl.searchParams.get("source");
    const roleTitle = normalizeOfficialJobsRoleTitle(
      nextUrl.searchParams.get(OFFICIAL_JOBS_ONBOARDING_JOB_PARAM)
    );
    const companyName = String(
      nextUrl.searchParams.get(OFFICIAL_JOBS_ONBOARDING_COMPANY_PARAM) ?? ""
    )
      .trim()
      .slice(0, OFFICIAL_JOBS_COMPANY_NAME_MAX_LENGTH);
    const slug = String(
      nextUrl.searchParams.get(OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM) ?? ""
    ).trim();

    if (source === OFFICIAL_JOBS_LANDING_SOURCE && roleTitle) {
      params.set(OFFICIAL_JOBS_ONBOARDING_JOB_PARAM, roleTitle);
    }
    if (source === OFFICIAL_JOBS_LANDING_SOURCE && companyName) {
      params.set(OFFICIAL_JOBS_ONBOARDING_COMPANY_PARAM, companyName);
    }
    if (source === OFFICIAL_JOBS_LANDING_SOURCE && slug) {
      params.set(OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM, slug);
    }
  } catch {
    // Keep the generic login URL if nextPath is not parseable.
  }

  return `/career_login?${params.toString()}`;
}

export function buildOfficialJobsInitialChatDraft(
  roleTitle?: string | null,
  companyName?: string | null,
  locale: OfficialJobsLocale = "ko"
) {
  const normalizedRoleTitle = normalizeOfficialJobsRoleTitle(roleTitle);
  if (!normalizedRoleTitle) return "";
  const normalizedCompanyName = normalizeOfficialJobsCompanyName(companyName);
  const copy = getOfficialJobsCopy(locale);
  return formatOfficialJobsCopy(
    normalizedCompanyName
      ? copy.initialChatDraftWithCompany
      : copy.initialChatDraft,
    {
      company: normalizedCompanyName,
      role: normalizedRoleTitle,
    }
  );
}

export type OfficialJobRow = Tables<"official_jobs">;

export type OfficialJob = {
  ashbyJobPostingId: string | null;
  id: string;
  slug: string;
  companyName: string;
  roleTitle: string;
  location: string;
  vertical: string;
  shortDescription: string;
  roleDescriptionMarkdown: string;
  compensation: string | null;
  employmentType: string | null;
  seniority: string | null;
  companyLogoUrl: string | null;
  companyWebsiteUrl: string | null;
  displayOrder: number;
  publishedAt: string | null;
  updatedAt: string;
};

export type OfficialJobListItem = Pick<
  OfficialJob,
  | "ashbyJobPostingId"
  | "id"
  | "slug"
  | "companyName"
  | "roleTitle"
  | "location"
  | "vertical"
>;

export type OfficialJobListRow = Pick<
  OfficialJobRow,
  | "ashby_job_posting_id"
  | "id"
  | "slug"
  | "company_name"
  | "role_title"
  | "location"
  | "vertical"
>;

export function isOfficialJobsInternalCopyIdentity(input: {
  roleTitle?: string | null;
  role_title?: string | null;
  slug?: string | null;
}) {
  const roleTitle = String(input.roleTitle ?? input.role_title ?? "").trim();
  const slug = String(input.slug ?? "")
    .trim()
    .toLowerCase();

  return (
    roleTitle === OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE ||
    slug === OFFICIAL_JOBS_INTERNAL_COPY_SLUG
  );
}

export function mapOfficialJobRow(row: OfficialJobRow): OfficialJob {
  return {
    ashbyJobPostingId: row.ashby_job_posting_id ?? null,
    id: row.id,
    slug: row.slug,
    companyName: row.company_name,
    roleTitle: row.role_title,
    location: row.location,
    vertical: row.vertical,
    shortDescription: row.short_description,
    roleDescriptionMarkdown: row.role_description_markdown,
    compensation: row.compensation,
    employmentType: row.employment_type,
    seniority: row.seniority,
    companyLogoUrl: row.company_logo_url,
    companyWebsiteUrl: row.company_website_url,
    displayOrder: row.display_order,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

export function mapOfficialJobListRow(
  row: OfficialJobListRow
): OfficialJobListItem {
  return {
    ashbyJobPostingId: row.ashby_job_posting_id ?? null,
    id: row.id,
    slug: row.slug,
    companyName: row.company_name,
    roleTitle: row.role_title,
    location: row.location,
    vertical: row.vertical,
  };
}
