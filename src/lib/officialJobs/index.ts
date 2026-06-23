import type { Tables } from "@/types/database.types";
import { OFFICIAL_JOBS_LANDING_SOURCE } from "@/lib/officialJobs/landingLogs";

export const OFFICIAL_JOBS_LOGIN_HREF = buildOfficialJobsLoginHref();

export const OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE = "internal_internal";
export const OFFICIAL_JOBS_INTERNAL_COPY_SLUG = "internal-internal";

export function buildOfficialJobsLoginHref(localId?: string | null) {
  const params = new URLSearchParams({
    next: "/career",
    source: OFFICIAL_JOBS_LANDING_SOURCE,
  });
  const normalizedLocalId = String(localId ?? "").trim();
  if (normalizedLocalId) params.set("lid", normalizedLocalId);
  return `/career_login?${params.toString()}`;
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
