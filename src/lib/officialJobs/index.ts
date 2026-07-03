import type { Tables } from "@/types/database.types";
import { OFFICIAL_JOBS_LANDING_SOURCE } from "@/lib/officialJobs/landingLogs";
import {
  formatOfficialJobsCopy,
  getOfficialJobsCopy,
  type OfficialJobsLocale,
} from "@/lib/officialJobs/copy";

export const OFFICIAL_JOBS_LOGIN_HREF = buildOfficialJobsLoginHref();

export const OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE = "internal_internal";
export const OFFICIAL_JOBS_INTERNAL_COPY_SLUG = "internal-internal";
export const OFFICIAL_JOBS_ONBOARDING_JOB_PARAM = "job";
export const OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM = "job_slug";
export const OFFICIAL_JOBS_ROLE_TITLE_MAX_LENGTH = 140;

export type OfficialJobsCareerJob = {
  roleTitle?: string | null;
  slug?: string | null;
};

function normalizeOfficialJobsRoleTitle(value?: string | null) {
  return String(value ?? "")
    .trim()
    .slice(0, OFFICIAL_JOBS_ROLE_TITLE_MAX_LENGTH);
}

export function buildOfficialJobsCareerHref(job?: OfficialJobsCareerJob) {
  const params = new URLSearchParams({
    source: OFFICIAL_JOBS_LANDING_SOURCE,
  });
  const roleTitle = normalizeOfficialJobsRoleTitle(job?.roleTitle);
  const slug = String(job?.slug ?? "").trim();

  if (roleTitle) params.set(OFFICIAL_JOBS_ONBOARDING_JOB_PARAM, roleTitle);
  if (slug) params.set(OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM, slug);

  return `/career?${params.toString()}`;
}

export function buildOfficialJobsLoginHref(
  localId?: string | null,
  nextPath = "/career"
) {
  const params = new URLSearchParams({
    next: nextPath,
    source: OFFICIAL_JOBS_LANDING_SOURCE,
  });
  const normalizedLocalId = String(localId ?? "").trim();
  if (normalizedLocalId) params.set("lid", normalizedLocalId);
  return `/career_login?${params.toString()}`;
}

export function buildOfficialJobsInitialChatDraft(
  roleTitle?: string | null,
  locale: OfficialJobsLocale = "ko"
) {
  const normalizedRoleTitle = normalizeOfficialJobsRoleTitle(roleTitle);
  if (!normalizedRoleTitle) return "";
  return formatOfficialJobsCopy(getOfficialJobsCopy(locale).initialChatDraft, {
    role: normalizedRoleTitle,
  });
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
