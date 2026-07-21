import {
  OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE,
  OFFICIAL_JOBS_INTERNAL_COPY_SLUG,
  isOfficialJobsInternalCopyIdentity,
} from "@/lib/officialJobs";
import { supabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/types/database.types";
import type { AshbyOfficialJobsSyncSummary } from "@/lib/ashbyOfficialJobsSync";

type OfficialJobRow = Database["public"]["Tables"]["official_jobs"]["Row"];

export type OpsOfficialJobRecord = {
  ashbyJobPostingId: string | null;
  companyDescriptionMarkdown: string;
  companyLogoUrl: string | null;
  companyName: string;
  companyWebsiteUrl: string | null;
  compensation: string | null;
  createdAt: string;
  displayOrder: number;
  employmentType: string | null;
  id: string;
  isInternalCopy: boolean;
  isPublished: boolean;
  location: string;
  publishedAt: string | null;
  roleDescriptionMarkdown: string;
  roleTitle: string;
  seniority: string | null;
  shortDescription: string;
  slug: string;
  updatedAt: string;
  vertical: string;
};

const INTERNAL_COPY_COMPANY_NAME = "Harper";
const INTERNAL_COPY_LOCATION = "Internal";
const INTERNAL_COPY_SHORT_DESCRIPTION =
  "Internal copy source for official jobs landing pages.";
const INTERNAL_COPY_VERTICAL = "Internal";

export type OpsOfficialJobsResponse = {
  jobs: OpsOfficialJobRecord[];
};

export type OpsOfficialJobSaveInput = {
  ashbyJobPostingId?: string | null;
  companyDescriptionMarkdown?: string | null;
  companyLogoUrl?: string | null;
  companyName?: string | null;
  companyWebsiteUrl?: string | null;
  compensation?: string | null;
  displayOrder?: number | string | null;
  employmentType?: string | null;
  id?: string | null;
  isPublished?: boolean | null;
  location?: string | null;
  roleDescriptionMarkdown?: string | null;
  roleTitle?: string | null;
  seniority?: string | null;
  shortDescription?: string | null;
  slug?: string | null;
  vertical?: string | null;
};

export type OpsOfficialJobSaveResponse = {
  job: OpsOfficialJobRecord;
};

export type { AshbyOfficialJobsSyncSummary };

function mapOpsOfficialJob(row: OfficialJobRow): OpsOfficialJobRecord {
  const isInternalCopy = isOfficialJobsInternalCopyIdentity(row);

  return {
    ashbyJobPostingId: row.ashby_job_posting_id ?? null,
    companyDescriptionMarkdown: row.company_description_markdown,
    companyLogoUrl: row.company_logo_url,
    companyName: row.company_name,
    companyWebsiteUrl: row.company_website_url,
    compensation: row.compensation,
    createdAt: row.created_at,
    displayOrder: row.display_order,
    employmentType: row.employment_type,
    id: row.id,
    isInternalCopy,
    isPublished: row.is_published,
    location: row.location,
    publishedAt: row.published_at,
    roleDescriptionMarkdown: row.role_description_markdown,
    roleTitle: row.role_title,
    seniority: row.seniority,
    shortDescription: row.short_description,
    slug: row.slug,
    updatedAt: row.updated_at,
    vertical: row.vertical,
  };
}

export function isOpsOfficialJobInternalCopy(
  job: Pick<OpsOfficialJobRecord, "roleTitle" | "slug">
) {
  return isOfficialJobsInternalCopyIdentity(job);
}

function normalizeRequiredString(value: unknown, label: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function normalizeOptionalString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeMarkdown(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeDisplayOrder(value: unknown) {
  const numberValue = Number(value ?? 0);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.trunc(numberValue);
}

function createOfficialJobSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "official-job";
}

async function fetchOfficialJobSlugRows() {
  const { data, error } = await supabaseServer
    .from("official_jobs")
    .select("id,slug");

  if (error) {
    throw new Error(error.message ?? "Failed to load official job slugs");
  }

  return data ?? [];
}

function resolveUniqueOfficialJobSlug(args: {
  baseSlug: string;
  currentId: string | null;
  existingRows: Array<Pick<OfficialJobRow, "id" | "slug">>;
}) {
  const usedSlugs = new Set<string>([OFFICIAL_JOBS_INTERNAL_COPY_SLUG]);

  for (const row of args.existingRows) {
    if (args.currentId && row.id === args.currentId) continue;
    usedSlugs.add(row.slug);
  }

  if (!usedSlugs.has(args.baseSlug)) return args.baseSlug;

  for (let suffix = 1; ; suffix += 1) {
    const candidate = `${args.baseSlug}-${suffix}`;
    if (!usedSlugs.has(candidate)) return candidate;
  }
}

async function buildUniqueOfficialJobSlug(args: {
  companyName: string;
  requestedSlug: string | null;
  roleTitle: string;
  currentId: string | null;
}) {
  const baseSlug = createOfficialJobSlug(
    args.requestedSlug ?? `${args.companyName} ${args.roleTitle}`
  );
  const existingRows = await fetchOfficialJobSlugRows();
  return resolveUniqueOfficialJobSlug({
    baseSlug,
    currentId: args.currentId,
    existingRows,
  });
}

async function fetchExistingJob(id: string | null) {
  if (!id) return null;

  const { data, error } = await supabaseServer
    .from("official_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load official job");
  }

  return data;
}

export async function fetchOpsOfficialJobs(): Promise<OpsOfficialJobsResponse> {
  const { data, error } = await supabaseServer
    .from("official_jobs")
    .select("*")
    .order("display_order", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "Failed to load official jobs");
  }

  return {
    jobs: (data ?? []).map(mapOpsOfficialJob),
  };
}

export async function saveOpsOfficialJob(
  input: OpsOfficialJobSaveInput
): Promise<OpsOfficialJobSaveResponse> {
  const id = normalizeOptionalString(input.id);
  const existing = await fetchExistingJob(id);
  const isInternalCopy =
    isOfficialJobsInternalCopyIdentity(existing ?? {}) ||
    isOfficialJobsInternalCopyIdentity({
      roleTitle: input.roleTitle,
      slug: input.slug,
    });
  const isPublished = isInternalCopy ? false : Boolean(input.isPublished);
  const publishedAt = isInternalCopy
    ? null
    : isPublished && !existing?.published_at
      ? new Date().toISOString()
      : (existing?.published_at ?? null);
  const shortDescription = normalizeMarkdown(input.shortDescription);
  const companyName = isInternalCopy
    ? (normalizeOptionalString(input.companyName) ?? INTERNAL_COPY_COMPANY_NAME)
    : normalizeRequiredString(input.companyName, "companyName");
  const roleTitle = isInternalCopy
    ? OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE
    : normalizeRequiredString(input.roleTitle, "roleTitle");
  const existingSlug = normalizeOptionalString(existing?.slug);
  const slug = isInternalCopy
    ? OFFICIAL_JOBS_INTERNAL_COPY_SLUG
    : (existingSlug ??
      (await buildUniqueOfficialJobSlug({
        companyName,
        requestedSlug: normalizeOptionalString(input.slug),
        roleTitle,
        currentId: id,
      })));

  const payload = {
    company_description_markdown: normalizeMarkdown(
      input.companyDescriptionMarkdown
    ),
    ashby_job_posting_id: isInternalCopy
      ? null
      : normalizeOptionalString(input.ashbyJobPostingId),
    company_logo_url: normalizeOptionalString(input.companyLogoUrl),
    company_name: companyName,
    company_website_url: normalizeOptionalString(input.companyWebsiteUrl),
    compensation: normalizeOptionalString(input.compensation),
    display_order: isInternalCopy
      ? -1000
      : normalizeDisplayOrder(input.displayOrder),
    employment_type: normalizeOptionalString(input.employmentType),
    is_published: isPublished,
    location: isInternalCopy
      ? (normalizeOptionalString(input.location) ?? INTERNAL_COPY_LOCATION)
      : normalizeRequiredString(input.location, "location"),
    published_at: publishedAt,
    role_description_markdown: normalizeMarkdown(input.roleDescriptionMarkdown),
    role_title: roleTitle,
    seniority: normalizeOptionalString(input.seniority),
    short_description: isInternalCopy
      ? shortDescription || INTERNAL_COPY_SHORT_DESCRIPTION
      : shortDescription,
    slug,
    vertical: isInternalCopy
      ? (normalizeOptionalString(input.vertical) ?? INTERNAL_COPY_VERTICAL)
      : normalizeMarkdown(input.vertical),
  };

  const query = id
    ? supabaseServer.from("official_jobs").update(payload).eq("id", id)
    : supabaseServer.from("official_jobs").insert(payload);

  const { data, error } = await query.select("*").single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save official job");
  }

  return {
    job: mapOpsOfficialJob(data),
  };
}
