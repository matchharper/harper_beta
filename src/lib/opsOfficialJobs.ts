import { supabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/types/database.types";

type OfficialJobRow = Database["public"]["Tables"]["official_jobs"]["Row"];

export type OpsOfficialJobRecord = {
  companyDescriptionMarkdown: string;
  companyLogoUrl: string | null;
  companyName: string;
  companyWebsiteUrl: string | null;
  compensation: string | null;
  createdAt: string;
  displayOrder: number;
  employmentType: string | null;
  id: string;
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

export type OpsOfficialJobsResponse = {
  jobs: OpsOfficialJobRecord[];
};

export type OpsOfficialJobSaveInput = {
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

function mapOpsOfficialJob(row: OfficialJobRow): OpsOfficialJobRecord {
  return {
    companyDescriptionMarkdown: row.company_description_markdown,
    companyLogoUrl: row.company_logo_url,
    companyName: row.company_name,
    companyWebsiteUrl: row.company_website_url,
    compensation: row.compensation,
    createdAt: row.created_at,
    displayOrder: row.display_order,
    employmentType: row.employment_type,
    id: row.id,
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

function normalizeSlug(value: unknown) {
  const slug = normalizeRequiredString(value, "slug").toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("slug must use lowercase letters, numbers, and hyphens");
  }
  return slug;
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
  const isPublished = Boolean(input.isPublished);
  const publishedAt =
    isPublished && !existing?.published_at
      ? new Date().toISOString()
      : (existing?.published_at ?? null);

  const payload = {
    company_description_markdown: normalizeMarkdown(
      input.companyDescriptionMarkdown
    ),
    company_logo_url: normalizeOptionalString(input.companyLogoUrl),
    company_name: normalizeRequiredString(input.companyName, "companyName"),
    company_website_url: normalizeOptionalString(input.companyWebsiteUrl),
    compensation: normalizeOptionalString(input.compensation),
    display_order: normalizeDisplayOrder(input.displayOrder),
    employment_type: normalizeOptionalString(input.employmentType),
    is_published: isPublished,
    location: normalizeRequiredString(input.location, "location"),
    published_at: publishedAt,
    role_description_markdown: normalizeMarkdown(input.roleDescriptionMarkdown),
    role_title: normalizeRequiredString(input.roleTitle, "roleTitle"),
    seniority: normalizeOptionalString(input.seniority),
    short_description: normalizeMarkdown(input.shortDescription),
    slug: normalizeSlug(input.slug),
    vertical: normalizeRequiredString(input.vertical, "vertical"),
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
