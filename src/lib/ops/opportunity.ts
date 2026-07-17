import type { Json } from "@/types/database.types";
import {
  callApifyActor,
  getApifyApiToken,
  listApifyDatasetItems,
} from "@/lib/apifyRest";
import {
  getOpsCompanyManagementEmployeeCountRangeExactJsonValues,
  normalizeOpsCompanyManagementQualityLabelFilter,
  OPS_COMPANY_MANAGEMENT_EMPLOYEE_COUNT_RANGE_OPTIONS,
  OPS_COMPANY_MANAGEMENT_PAGE_SIZE,
  OPS_OPPORTUNITY_COMPANY_PAGE_SIZE,
  type OpsCompanyManagementEmployeeCountRangeFilter,
  type OpsCompanyManagementQualityLabelFilter,
} from "@/lib/ops/opportunityCompanyManagement";
import {
  buildOpsRoleDescriptionSummarySystemPrompt,
  buildOpsRoleDescriptionSummaryUserPrompt,
} from "@/lib/ops/opportunityRecommendationPrompt";
import { runOpsRoleDescriptionSummary } from "@/lib/career/llm";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

type WorkspaceRow = {
  career_url: string | null;
  company_db_id?: number | null;
  company_description: string | null;
  company_name: string;
  company_workspace_id: string;
  created_at: string;
  homepage_url: string | null;
  is_internal?: boolean | null;
  linkedin_url: string | null;
  logo_url: string | null;
  pitch?: string | null;
  request?: string | null;
  updated_at: string;
};

type RoleRow = {
  company_workspace_id: string;
  created_at: string;
  description: string | null;
  description_summary?: string | null;
  expires_at?: string | null;
  external_jd_url: string | null;
  location_text?: string | null;
  name: string;
  posted_at?: string | null;
  role_id: string;
  request?: string | null;
  source_job_id?: string | null;
  source_provider?: string | null;
  source_type?: string | null;
  status: string;
  type: string[] | null;
  updated_at: string;
  work_mode?: string | null;
};

type CompanyDbRow = {
  description: string | null;
  employee_count_range?: Json | null;
  founded_year?: number | null;
  id: number;
  last_updated_at: string;
  linkedin_url: string | null;
  location?: string | null;
  logo: string | null;
  name: string | null;
  short_description: string | null;
  website_url: string | null;
};

type CompanyManagementCompanyDbRow = {
  crunchbase_information: Json | null;
  description: string | null;
  employee_count_range: Json | null;
  founded_year: number | null;
  funding_url: string | null;
  id: number;
  investors: string | null;
  last_crunchbase_updated_at: string | null;
  linkedin_url: string | null;
  location: string | null;
  logo: string | null;
  name: string | null;
  short_description: string | null;
  specialities: string | null;
  website_url: string | null;
};

type CompanyManagementWorkspaceRow = WorkspaceRow & {
  company_db?:
    | CompanyManagementCompanyDbRow
    | CompanyManagementCompanyDbRow[]
    | null;
  is_scrape_original?: boolean | null;
};

type CompanyWorkspaceQualityLabelRow = {
  company_workspace_id: string;
  human_quality_label: number | null;
  human_quality_labeled_at: string | null;
  llm_quality_label: number | null;
  llm_quality_label_reason: string | null;
  llm_quality_labeled_at: string | null;
};

type SupportedExternalRoleProvider = "lever" | "linkedin_jobs";

type SyncedExternalRoleSeed = {
  description: string | null;
  descriptionSummary: string | null;
  employmentTypes: OpportunityEmploymentType[];
  expiresAt: string | null;
  externalJdUrl: string | null;
  locationText: string | null;
  name: string;
  postedAt: string | null;
  sourceJobId: string;
  sourceProvider: SupportedExternalRoleProvider;
  status: OpportunityStatus;
  workMode: OpportunityWorkMode | null;
};

export type OpportunitySourceType = "internal" | "external";
export type OpportunityStatus = "top_priority" | "active" | "ended" | "paused";
export type OpportunityEmploymentType =
  | "full_time"
  | "part_time"
  | "internship"
  | "contract";
export type OpportunityWorkMode = "onsite" | "hybrid" | "remote";
export type OpsCompanyQualityLabel = 0 | 1 | 2;

export type OpsOpportunityWorkspaceRecord = {
  activeRoleCount: number;
  careerUrl: string | null;
  companyDbId: number | null;
  companyDescription: string | null;
  companyName: string;
  companyWorkspaceId: string;
  createdAt: string;
  externalRoleCount: number;
  homepageUrl: string | null;
  internalRoleCount: number;
  isInternal: boolean;
  linkedinUrl: string | null;
  logoUrl: string | null;
  memberCount: number;
  pitch: string | null;
  request: string | null;
  totalRoleCount: number;
  updatedAt: string;
};

export type OpsOpportunityWorkspaceExtraction = {
  companyDbId: number;
  companyDescription: string;
  companyName: string;
  homepageUrl: string;
  linkedinUrl: string;
  logoUrl: string | null;
};

export type OpsOpportunityRoleSyncResult = {
  deletedCount: number;
  insertedCount: number;
  provider: SupportedExternalRoleProvider;
  workspaceId: string;
};

export type OpsOpportunityRoleRecord = {
  companyName: string;
  companyWorkspaceId: string;
  createdAt: string;
  description: string | null;
  descriptionSummary: string | null;
  employmentTypes: OpportunityEmploymentType[];
  expiresAt: string | null;
  externalJdUrl: string | null;
  locationText: string | null;
  name: string;
  postedAt: string | null;
  request: string | null;
  roleId: string;
  sourceJobId: string | null;
  sourceProvider: string | null;
  sourceType: OpportunitySourceType;
  status: OpportunityStatus;
  updatedAt: string;
  workMode: OpportunityWorkMode | null;
};

export type OpsOpportunityCatalogResponse = {
  internalOnly: boolean;
  nextWorkspaceOffset: number | null;
  roles: OpsOpportunityRoleRecord[];
  workspaceLimit: number;
  workspaceOffset: number;
  workspaceQuery: string;
  workspaceTotalCount: number | null;
  workspaces: OpsOpportunityWorkspaceRecord[];
};

export type OpsOpportunityRoleListResponse = {
  internalOnly: boolean;
  items: OpsOpportunityRoleRecord[];
  limit: number;
  nextOffset: number | null;
  offset: number;
  query: string;
  sourceType: OpportunitySourceType | null;
  totalCount: number | null;
  workspaceId: string | null;
};

export type OpsCompanyManagementCompanyDbRecord = {
  crunchbaseInformation: Json | null;
  description: string | null;
  employeeCountRange: Json | null;
  foundedYear: number | null;
  fundingUrl: string | null;
  id: number | null;
  investors: string | null;
  linkedinUrl: string | null;
  location: string | null;
  logoUrl: string | null;
  name: string | null;
  shortDescription: string | null;
  specialities: string | null;
  websiteUrl: string | null;
};

export type OpsCompanyLatestFundingRound = {
  amountText: string | null;
  announcedOn: string | null;
  leadInvestors: string[];
  name: string | null;
};

export type OpsCompanyManagementRecord = {
  companyDb: OpsCompanyManagementCompanyDbRecord | null;
  companyDbId: number | null;
  companyDescription: string | null;
  companyName: string;
  companyWorkspaceId: string;
  effectiveQualityLabel: OpsCompanyQualityLabel | null;
  employeeCountRange: Json | null;
  foundedYear: number | null;
  homepageUrl: string | null;
  humanQualityLabel: OpsCompanyQualityLabel | null;
  humanQualityLabeledAt: string | null;
  industry: string | null;
  investors: string | null;
  isScrapeOriginal: boolean;
  latestFundingRound: OpsCompanyLatestFundingRound | null;
  linkedinUrl: string | null;
  location: string | null;
  logoUrl: string | null;
  llmQualityLabel: OpsCompanyQualityLabel | null;
  llmQualityLabeledAt: string | null;
  llmQualityLabelReason: string | null;
  recentJoinCount: number;
  updatedAt: string;
};

export type OpsCompanyManagementPageResponse = {
  filters: {
    companyName: string;
    employeeCountRange: OpsCompanyManagementEmployeeCountRangeFilter;
    foundedYearMin: number | null;
    hasCareerUrlOnly: boolean;
    humanLabelMissingFirst: boolean;
    investors: string;
    llmQualityLabelFirst: boolean;
    location: string;
    qualityLabel: OpsCompanyManagementQualityLabelFilter;
  };
  items: OpsCompanyManagementRecord[];
  limit: number;
  nextOffset: number | null;
  offset: number;
  query: string;
};

function coerceJsonArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function ensureNonEmptyString(value: unknown, fieldName: string) {
  const nextValue = String(value ?? "").trim();
  if (!nextValue) {
    throw new Error(`${fieldName} is required`);
  }
  return nextValue;
}

function isMissingOptionalTableError(error: unknown) {
  const maybeError = error as { code?: unknown; message?: unknown };
  const code = String(maybeError?.code ?? "");
  const message = String(maybeError?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table")
  );
}

async function deleteRowsByColumn(args: {
  admin: AdminClient;
  column: string;
  optional?: boolean;
  select?: string;
  table: string;
  value: string;
}) {
  const { data, error } = await ((args.admin.from(args.table as any) as any)
    .delete()
    .eq(args.column, args.value)
    .select(args.select ?? args.column) as Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>);

  if (error) {
    if (args.optional && isMissingOptionalTableError(error)) return 0;
    throw new Error(error.message ?? `Failed to delete ${args.table}`);
  }

  return coerceJsonArray<unknown>(data).length;
}

async function deleteRowsByColumnIn(args: {
  admin: AdminClient;
  column: string;
  optional?: boolean;
  select?: string;
  table: string;
  values: string[];
}) {
  if (args.values.length === 0) return 0;

  const { data, error } = await ((args.admin.from(args.table as any) as any)
    .delete()
    .in(args.column, args.values)
    .select(args.select ?? args.column) as Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>);

  if (error) {
    if (args.optional && isMissingOptionalTableError(error)) return 0;
    throw new Error(error.message ?? `Failed to delete ${args.table}`);
  }

  return coerceJsonArray<unknown>(data).length;
}

function normalizeLink(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function normalizeLinkedinCompanyUrl(raw: string): string | null {
  try {
    const parsed = new URL(normalizeLink(raw));
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!(host === "linkedin.com" || host.endsWith(".linkedin.com"))) {
      return null;
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments[0]?.toLowerCase() !== "company" || !segments[1]) {
      return null;
    }

    return `https://www.linkedin.com/company/${decodeURIComponent(segments[1])
      .trim()
      .toLowerCase()}`;
  } catch {
    return null;
  }
}

const DEFAULT_APIFY_LEVER_JOBS_ACTOR_ID = "RyuY39MwHKAvdAZdg";
const DEFAULT_APIFY_LINKEDIN_JOBS_ACTOR_ID = "hKByXkMQaC5Qt9UMN";
const COMPANY_DB_LOOKUP_SELECT =
  "id, name, linkedin_url, logo, website_url, description, short_description, last_updated_at";

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToPlainText(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li|h[1-6]|ul|ol|section|article)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u0000/g, "")
    .trim();

  return decodeHtmlEntities(normalized)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function normalizeScrapedDate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : null;

  const parsed =
    numericValue !== null
      ? new Date(numericValue)
      : new Date(String(value).trim());

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function inferEmploymentTypesFromLabel(
  value: string | null | undefined
): OpportunityEmploymentType[] {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return [];
  if (normalized.includes("intern")) return ["internship"];
  if (
    normalized.includes("part time") ||
    normalized.includes("part-time") ||
    normalized.includes("parttime")
  ) {
    return ["part_time"];
  }
  if (
    normalized.includes("contract") ||
    normalized.includes("contractor") ||
    normalized.includes("temporary")
  ) {
    return ["contract"];
  }
  if (
    normalized.includes("full time") ||
    normalized.includes("full-time") ||
    normalized.includes("fulltime") ||
    normalized.includes("permanent")
  ) {
    return ["full_time"];
  }
  return [];
}

function inferWorkModeFromLabels(
  values: unknown[]
): OpportunityWorkMode | null {
  const normalizedValues = values
    .map((item) =>
      String(item ?? "")
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);

  if (
    normalizedValues.some(
      (item) => item.includes("hybrid") || item.includes("하이브리드")
    )
  ) {
    return "hybrid";
  }
  if (
    normalizedValues.some(
      (item) =>
        item.includes("remote") ||
        item.includes("remotely") ||
        item.includes("리모트")
    )
  ) {
    return "remote";
  }
  if (
    normalizedValues.some(
      (item) =>
        item.includes("on-site") ||
        item.includes("onsite") ||
        item.includes("on site") ||
        item.includes("상주")
    )
  ) {
    return "onsite";
  }
  return null;
}

function normalizeExternalRoleStatus(args: { expiresAt?: string | null }) {
  const expiresAt = normalizeScrapedDate(args.expiresAt);
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    return "ended" satisfies OpportunityStatus;
  }
  return "active" satisfies OpportunityStatus;
}

function dedupeSyncedExternalRoles(items: SyncedExternalRoleSeed[]) {
  const seen = new Set<string>();
  const deduped: SyncedExternalRoleSeed[] = [];

  for (const item of items) {
    const key = `${item.sourceProvider}:${item.sourceJobId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function normalizeCareerUrl(raw: string) {
  const normalized = normalizeLink(raw).trim();
  if (!normalized) return null;
  try {
    return new URL(normalized).toString();
  } catch {
    return null;
  }
}

function detectExternalRoleProvider(
  careerUrl: string
): SupportedExternalRoleProvider | null {
  try {
    const parsed = new URL(careerUrl);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.toLowerCase();

    if (
      host === "jobs.lever.co" ||
      host.endsWith(".lever.co") ||
      host === "lever.co"
    ) {
      return "lever";
    }

    if (
      (host === "linkedin.com" || host.endsWith(".linkedin.com")) &&
      path.includes("/jobs")
    ) {
      return "linkedin_jobs";
    }

    return null;
  } catch {
    return null;
  }
}

function buildFallbackDescriptionSummary(args: {
  companyName: string;
  description: string | null;
  locationText: string | null;
  roleName: string;
}) {
  const body = clampPromptText(htmlToPlainText(args.description), 280);
  const prefix = [args.companyName, args.roleName].filter(Boolean).join(" ");
  const location = String(args.locationText ?? "").trim();
  if (body) {
    return [prefix, location ? `(${location})` : "", body]
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return [prefix, location ? `(${location})` : ""]
    .filter(Boolean)
    .join(" ")
    .trim();
}

async function summarizeExternalRoleDescription(args: {
  companyDescription: string | null;
  companyName: string;
  role: SyncedExternalRoleSeed;
}) {
  const roleDescriptionText = clampPromptText(
    htmlToPlainText(args.role.description),
    5000
  );
  const companyDescription = clampPromptText(args.companyDescription, 1500);
  const fallback = buildFallbackDescriptionSummary({
    companyName: args.companyName,
    description: args.role.description,
    locationText: args.role.locationText,
    roleName: args.role.name,
  });

  if (!roleDescriptionText && !companyDescription) {
    return fallback || null;
  }

  try {
    const summary = await runOpsRoleDescriptionSummary({
      messages: [
        {
          role: "system",
          content: buildOpsRoleDescriptionSummarySystemPrompt(),
        },
        {
          role: "user",
          content: buildOpsRoleDescriptionSummaryUserPrompt({
            companyDescription,
            companyName: args.companyName,
            employmentTypes: args.role.employmentTypes,
            jobDescription: roleDescriptionText,
            locationText: args.role.locationText,
            roleName: args.role.name,
            workMode: args.role.workMode,
          }),
        },
      ],
    });

    const cleaned = summary.replace(/\s+/g, " ").trim();
    return clampPromptText(cleaned, 420) ?? fallback ?? null;
  } catch {
    return fallback || null;
  }
}

async function summarizeExternalRoleSeeds(args: {
  companyDescription: string | null;
  companyName: string;
  roles: SyncedExternalRoleSeed[];
}) {
  const summarized: SyncedExternalRoleSeed[] = [];
  const chunkSize = 4;

  for (let index = 0; index < args.roles.length; index += chunkSize) {
    const chunk = args.roles.slice(index, index + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(async (role) => ({
        ...role,
        descriptionSummary: await summarizeExternalRoleDescription({
          companyDescription: args.companyDescription,
          companyName: args.companyName,
          role,
        }),
      }))
    );
    summarized.push(...chunkResults);
  }

  return summarized;
}

function mapLeverRoleItem(
  item: Record<string, unknown>
): SyncedExternalRoleSeed | null {
  const title = String(item.title ?? "").trim();
  const sourceJobId = String(item.id ?? "").trim();
  if (!title || !sourceJobId) return null;

  const description = String(item.description ?? "").trim() || null;
  const locations = Array.isArray(item.locations)
    ? item.locations
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join(", ")
    : "";
  const expiresAt = normalizeScrapedDate(item.expiredAt ?? item.expiresAt);

  return {
    description,
    descriptionSummary: null,
    employmentTypes: inferEmploymentTypesFromLabel(String(item.type ?? "")),
    expiresAt,
    externalJdUrl:
      String(item.postingUrl ?? item.applyUrl ?? "").trim() || null,
    locationText: locations || null,
    name: title,
    postedAt: normalizeScrapedDate(item.publishedAt ?? item.createdAt),
    sourceJobId,
    sourceProvider: "lever",
    status: normalizeExternalRoleStatus({ expiresAt }),
    workMode: null,
  };
}

function mapLinkedinJobsItem(
  item: Record<string, unknown>
): SyncedExternalRoleSeed | null {
  const title = String(item.title ?? "").trim();
  const sourceJobId = String(item.id ?? "").trim();
  if (!title || !sourceJobId) return null;

  const workplaceTypes = Array.isArray(item.workplaceTypes)
    ? item.workplaceTypes
    : [];
  const descriptionHtml = String(
    item.descriptionHtml ?? item.description ?? item.descriptionText ?? ""
  ).trim();
  const expiresAt = normalizeScrapedDate(item.expireAt ?? item.expiredAt);

  return {
    description: descriptionHtml || null,
    descriptionSummary: null,
    employmentTypes: inferEmploymentTypesFromLabel(
      String(item.employmentType ?? item.formattedEmploymentStatus ?? "")
    ),
    expiresAt,
    externalJdUrl:
      String(item.link ?? item.applyUrl ?? item.inputUrl ?? "").trim() || null,
    locationText: String(item.location ?? "").trim() || null,
    name: title,
    postedAt: normalizeScrapedDate(item.postedAt ?? item.postedAtTimestamp),
    sourceJobId,
    sourceProvider: "linkedin_jobs",
    status: normalizeExternalRoleStatus({ expiresAt }),
    workMode:
      inferWorkModeFromLabels(workplaceTypes) ??
      (item.workRemoteAllowed === true ? "remote" : null),
  };
}

async function fetchExternalRolesFromApify(args: {
  careerUrl: string;
  provider: SupportedExternalRoleProvider;
}) {
  const token = getApifyApiToken();

  if (args.provider === "lever") {
    const actorId =
      String(process.env.APIFY_LEVER_JOBS_ACTOR_ID ?? "").trim() ||
      DEFAULT_APIFY_LEVER_JOBS_ACTOR_ID;
    const run = await withTimeout(
      callApifyActor({
        actorId,
        input: {
          urls: [{ url: args.careerUrl }],
          proxy: { useApifyProxy: true },
        },
        maxRunWaitSeconds: 120,
        token,
        waitForFinishSeconds: 120,
      }),
      120_000,
      "Lever Apify crawl timed out"
    );

    const items = await withTimeout(
      listApifyDatasetItems({
        datasetId: run.defaultDatasetId,
        limit: 500,
        token,
      }),
      60_000,
      "Lever Apify dataset fetch timed out"
    );

    return dedupeSyncedExternalRoles(
      coerceJsonArray<Record<string, unknown>>(items)
        .map(mapLeverRoleItem)
        .filter((item): item is SyncedExternalRoleSeed => item !== null)
    );
  }

  const actorId =
    String(process.env.APIFY_LINKEDIN_JOBS_ACTOR_ID ?? "").trim() ||
    DEFAULT_APIFY_LINKEDIN_JOBS_ACTOR_ID;
  const run = await withTimeout(
    callApifyActor({
      actorId,
      input: {
        urls: [args.careerUrl],
        scrapeCompany: true,
        count: 100,
        splitByLocation: false,
      },
      maxRunWaitSeconds: 120,
      token,
      waitForFinishSeconds: 120,
    }),
    120_000,
    "LinkedIn Jobs Apify crawl timed out"
  );

  const items = await withTimeout(
    listApifyDatasetItems({
      datasetId: run.defaultDatasetId,
      limit: 500,
      token,
    }),
    60_000,
    "LinkedIn Jobs Apify dataset fetch timed out"
  );

  return dedupeSyncedExternalRoles(
    coerceJsonArray<Record<string, unknown>>(items)
      .map(mapLinkedinJobsItem)
      .filter((item): item is SyncedExternalRoleSeed => item !== null)
  );
}

function pickCompanyDbDescription(row: {
  description?: string | null;
  short_description?: string | null;
}) {
  const shortDescription = String(row.short_description ?? "").trim();
  if (shortDescription) {
    return shortDescription;
  }

  const description = String(row.description ?? "").trim();
  return description || null;
}

async function findCompanyDbByLinkedinUrl(args: {
  admin: AdminClient;
  linkedinUrl?: string | null;
}) {
  const rawLinkedinUrl = String(args.linkedinUrl ?? "").trim();
  const normalizedLinkedinUrl = rawLinkedinUrl
    ? normalizeLinkedinCompanyUrl(rawLinkedinUrl)
    : null;
  const linkedinSlug =
    normalizedLinkedinUrl?.split("/").filter(Boolean).at(-1) ?? null;

  if (!normalizedLinkedinUrl || !linkedinSlug) {
    return {
      match: null as CompanyDbRow | null,
      normalizedLinkedinUrl,
      rawLinkedinUrl,
    };
  }

  const linkedinCandidates = [
    normalizedLinkedinUrl,
    `${normalizedLinkedinUrl}/`,
    normalizedLinkedinUrl.replace("https://www.", "https://"),
    `${normalizedLinkedinUrl.replace("https://www.", "https://")}/`,
  ];

  const exactResponse = await (args.admin.from("company_db" as any) as any)
    .select(COMPANY_DB_LOOKUP_SELECT)
    .in("linkedin_url", linkedinCandidates)
    .order("last_updated_at", { ascending: false, nullsFirst: false })
    .limit(1);

  if (exactResponse.error) {
    throw new Error(exactResponse.error.message ?? "Failed to resolve company");
  }

  const exactMatch = coerceJsonArray<CompanyDbRow>(exactResponse.data)[0];
  if (exactMatch) {
    return {
      match: exactMatch,
      normalizedLinkedinUrl,
      rawLinkedinUrl,
    };
  }

  const fuzzyResponse = await (args.admin.from("company_db" as any) as any)
    .select(COMPANY_DB_LOOKUP_SELECT)
    .ilike("linkedin_url", `%/company/${linkedinSlug}%`)
    .order("last_updated_at", { ascending: false, nullsFirst: false })
    .limit(1);

  if (fuzzyResponse.error) {
    throw new Error(fuzzyResponse.error.message ?? "Failed to resolve company");
  }

  return {
    match: coerceJsonArray<CompanyDbRow>(fuzzyResponse.data)[0] ?? null,
    normalizedLinkedinUrl,
    rawLinkedinUrl,
  };
}

function normalizeOpportunitySourceType(value: unknown): OpportunitySourceType {
  return value === "external" ? "external" : "internal";
}

type RoleSourceTypeFilterQuery<TQuery> = {
  eq: (column: string, value: string) => TQuery;
  or: (filters: string) => TQuery;
};

function applyRoleSourceTypeFilter<
  TQuery extends RoleSourceTypeFilterQuery<TQuery>,
>(query: TQuery, sourceType: OpportunitySourceType): TQuery {
  if (sourceType === "external") {
    return query.eq("source_type", "external");
  }
  return query.or("source_type.eq.internal,source_type.is.null");
}

function normalizeOpportunityStatus(value: unknown): OpportunityStatus {
  if (value === "top_priority") return "top_priority";
  if (value === "ended") return "ended";
  if (value === "paused") return "paused";
  return "active";
}

function normalizeOpportunityWorkMode(
  value: unknown
): OpportunityWorkMode | null {
  if (value === "onsite" || value === "hybrid" || value === "remote") {
    return value;
  }
  return null;
}

function normalizeOpportunityEmploymentTypes(
  value: unknown
): OpportunityEmploymentType[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<OpportunityEmploymentType>();
  const items: OpportunityEmploymentType[] = [];

  for (const item of value) {
    if (
      item !== "full_time" &&
      item !== "part_time" &&
      item !== "internship" &&
      item !== "contract"
    ) {
      continue;
    }
    if (seen.has(item)) continue;
    seen.add(item);
    items.push(item);
  }

  return items;
}

function sanitizeOpportunityEmploymentTypes(
  value: unknown
): OpportunityEmploymentType[] {
  return normalizeOpportunityEmploymentTypes(value);
}

function parseDateString(value: unknown, fieldName: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }

  return parsed.toISOString();
}

function clampPromptText(value: string | null | undefined, maxLength: number) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\r/g, "").trim();
  if (!normalized) return "";
  return normalized.slice(0, maxLength);
}

async function resolveCompanyDbRecord(args: {
  admin: AdminClient;
  companyName?: string | null;
  linkedinUrl?: string | null;
}) {
  const {
    match: linkedinMatch,
    normalizedLinkedinUrl,
    rawLinkedinUrl,
  } = await findCompanyDbByLinkedinUrl({
    admin: args.admin,
    linkedinUrl: args.linkedinUrl,
  });
  const normalizedCompanyName = String(args.companyName ?? "").trim();

  if (linkedinMatch) {
    return {
      companyDbId: Number(linkedinMatch.id),
      linkedinUrl: normalizedLinkedinUrl,
      logoUrl: linkedinMatch.logo ?? null,
    };
  }

  if (normalizedCompanyName) {
    const { data, error } = await (args.admin.from("company_db" as any) as any)
      .select(COMPANY_DB_LOOKUP_SELECT)
      .ilike("name", normalizedCompanyName)
      .order("last_updated_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (error) {
      throw new Error(error.message ?? "Failed to resolve company");
    }

    const match = coerceJsonArray<CompanyDbRow>(data)[0];
    if (match) {
      return {
        companyDbId: Number(match.id),
        linkedinUrl: normalizedLinkedinUrl ?? match.linkedin_url ?? null,
        logoUrl: match.logo ?? null,
      };
    }
  }

  return {
    companyDbId: null,
    linkedinUrl: normalizedLinkedinUrl ?? (rawLinkedinUrl || null),
    logoUrl: null,
  };
}

export async function extractOpsOpportunityWorkspace(args: {
  linkedinUrl: string;
}): Promise<OpsOpportunityWorkspaceExtraction> {
  const admin = getSupabaseAdmin();
  const linkedinUrl = ensureNonEmptyString(args.linkedinUrl, "linkedinUrl");
  const { match, normalizedLinkedinUrl } = await findCompanyDbByLinkedinUrl({
    admin,
    linkedinUrl,
  });

  if (!normalizedLinkedinUrl) {
    throw new Error("유효한 LinkedIn company URL을 입력해 주세요.");
  }

  if (!match) {
    throw new Error(
      "company_db에서 해당 LinkedIn 회사 정보를 찾지 못했습니다."
    );
  }

  return {
    companyDbId: Number(match.id),
    companyDescription: pickCompanyDbDescription(match) ?? "",
    companyName: String(match.name ?? "").trim(),
    homepageUrl: String(match.website_url ?? "").trim(),
    linkedinUrl: normalizedLinkedinUrl,
    logoUrl: match.logo ?? null,
  };
}

function mapWorkspaceRecord(args: {
  activeRoleCount: number;
  externalRoleCount: number;
  internalRoleCount: number;
  memberCount?: number;
  row: WorkspaceRow;
  totalRoleCount: number;
}): OpsOpportunityWorkspaceRecord {
  return {
    activeRoleCount: args.activeRoleCount,
    careerUrl: args.row.career_url ?? null,
    companyDbId:
      typeof args.row.company_db_id === "number"
        ? args.row.company_db_id
        : null,
    companyDescription: args.row.company_description ?? null,
    companyName: String(args.row.company_name ?? ""),
    companyWorkspaceId: String(args.row.company_workspace_id ?? ""),
    createdAt: String(args.row.created_at ?? ""),
    externalRoleCount: args.externalRoleCount,
    homepageUrl: args.row.homepage_url ?? null,
    internalRoleCount: args.internalRoleCount,
    isInternal: Boolean(args.row.is_internal),
    linkedinUrl: args.row.linkedin_url ?? null,
    logoUrl: args.row.logo_url ?? null,
    memberCount: Math.max(0, Math.floor(Number(args.memberCount ?? 0) || 0)),
    pitch: args.row.pitch ?? null,
    request: args.row.request ?? null,
    totalRoleCount: args.totalRoleCount,
    updatedAt: String(args.row.updated_at ?? args.row.created_at ?? ""),
  };
}

function mapRoleRecord(args: {
  companyName: string;
  row: RoleRow;
}): OpsOpportunityRoleRecord {
  return {
    companyName: args.companyName,
    companyWorkspaceId: String(args.row.company_workspace_id ?? ""),
    createdAt: String(args.row.created_at ?? ""),
    description: args.row.description ?? null,
    descriptionSummary: args.row.description_summary ?? null,
    employmentTypes: normalizeOpportunityEmploymentTypes(args.row.type),
    expiresAt: args.row.expires_at ?? null,
    externalJdUrl: args.row.external_jd_url ?? null,
    locationText: args.row.location_text ?? null,
    name: String(args.row.name ?? ""),
    postedAt: args.row.posted_at ?? null,
    request: args.row.request ?? null,
    roleId: String(args.row.role_id ?? ""),
    sourceJobId: args.row.source_job_id ?? null,
    sourceProvider: args.row.source_provider ?? null,
    sourceType: normalizeOpportunitySourceType(args.row.source_type),
    status: normalizeOpportunityStatus(args.row.status),
    updatedAt: String(args.row.updated_at ?? args.row.created_at ?? ""),
    workMode: normalizeOpportunityWorkMode(args.row.work_mode),
  };
}

export async function fetchOpsOpportunityCatalog(
  args: {
    internalOnly?: boolean;
    workspaceLimit?: number;
    workspaceOffset?: number;
    workspaceQuery?: string | null;
  } = {}
): Promise<OpsOpportunityCatalogResponse> {
  const admin = getSupabaseAdmin();
  const internalOnly = Boolean(args.internalOnly);
  const workspaceLimit = Math.max(
    1,
    Math.min(
      Number(args.workspaceLimit ?? OPS_OPPORTUNITY_COMPANY_PAGE_SIZE) ||
        OPS_OPPORTUNITY_COMPANY_PAGE_SIZE,
      OPS_OPPORTUNITY_COMPANY_PAGE_SIZE
    )
  );
  const workspaceOffset = Math.max(0, Number(args.workspaceOffset ?? 0) || 0);
  const workspaceQueryText = sanitizeCompanyManagementFilterText(
    String(args.workspaceQuery ?? "")
  );

  let workspaceQuery = (admin.from("company_workspace" as any) as any)
    .select(
      "company_workspace_id, company_name, homepage_url, career_url, linkedin_url, logo_url, company_description, company_db_id, is_internal, pitch, request, created_at, updated_at",
      { count: "exact" }
    )
    .order("updated_at", { ascending: false }) as any;

  if (internalOnly) {
    workspaceQuery = workspaceQuery.eq("is_internal", true);
  }

  if (workspaceQueryText) {
    workspaceQuery = workspaceQuery.or(
      [
        `company_name.ilike.%${workspaceQueryText}%`,
        `company_description.ilike.%${workspaceQueryText}%`,
        `homepage_url.ilike.%${workspaceQueryText}%`,
        `career_url.ilike.%${workspaceQueryText}%`,
        `linkedin_url.ilike.%${workspaceQueryText}%`,
        `pitch.ilike.%${workspaceQueryText}%`,
        `request.ilike.%${workspaceQueryText}%`,
      ].join(",")
    );
  }

  const workspaceResponse = await workspaceQuery.range(
    workspaceOffset,
    workspaceOffset + workspaceLimit - 1
  );
  const workspaceError = (workspaceResponse as { error?: { message?: string } })
    .error;
  if (workspaceError) {
    throw new Error(workspaceError.message ?? "Failed to load companies");
  }

  const workspaceRows = coerceJsonArray<WorkspaceRow>(
    (workspaceResponse as { data?: unknown }).data
  );
  const workspaceIds = workspaceRows
    .map((row) => String(row.company_workspace_id ?? "").trim())
    .filter(Boolean);

  let roleRows: RoleRow[] = [];
  if (workspaceIds.length > 0) {
    let roleQuery = (admin.from("company_roles" as any) as any)
      .select(
        "role_id, company_workspace_id, name, external_jd_url, description, description_summary, type, status, request, created_at, updated_at, source_type, source_provider, source_job_id, posted_at, expires_at, location_text, work_mode"
      )
      .in("company_workspace_id", workspaceIds)
      .order("updated_at", { ascending: false }) as any;

    if (internalOnly) {
      roleQuery = applyRoleSourceTypeFilter(roleQuery, "internal");
    }

    const roleResponse = await roleQuery;
    const roleError = (roleResponse as { error?: { message?: string } }).error;
    if (roleError) {
      throw new Error(roleError.message ?? "Failed to load roles");
    }
    roleRows = coerceJsonArray<RoleRow>(
      (roleResponse as { data?: unknown }).data
    );
  }

  const workspaceById = new Map(
    workspaceRows.map(
      (row) => [String(row.company_workspace_id ?? ""), row] as const
    )
  );
  const roleStatsByWorkspaceId = new Map<
    string,
    { active: number; external: number; internal: number; total: number }
  >();
  const memberCountByWorkspaceId = new Map<string, number>();

  if (workspaceIds.length > 0) {
    const { data: memberRows, error: memberError } = await (
      admin.from("company_user_workspace" as any) as any
    )
      .select("company_workspace_id")
      .in("company_workspace_id", workspaceIds);

    if (memberError) {
      throw new Error(memberError.message ?? "Failed to load company members");
    }

    for (const row of coerceJsonArray<{ company_workspace_id?: string | null }>(
      memberRows
    )) {
      const workspaceId = String(row.company_workspace_id ?? "").trim();
      if (!workspaceId) continue;
      memberCountByWorkspaceId.set(
        workspaceId,
        (memberCountByWorkspaceId.get(workspaceId) ?? 0) + 1
      );
    }
  }

  for (const row of roleRows) {
    const workspaceId = String(row.company_workspace_id ?? "").trim();
    if (!workspaceId) continue;

    const current = roleStatsByWorkspaceId.get(workspaceId) ?? {
      active: 0,
      external: 0,
      internal: 0,
      total: 0,
    };

    current.total += 1;
    if (normalizeOpportunityStatus(row.status) === "active") {
      current.active += 1;
    }
    if (normalizeOpportunitySourceType(row.source_type) === "external") {
      current.external += 1;
    } else {
      current.internal += 1;
    }

    roleStatsByWorkspaceId.set(workspaceId, current);
  }

  const workspaceTotalCount =
    typeof (workspaceResponse as { count?: unknown }).count === "number"
      ? (workspaceResponse as { count: number }).count
      : null;
  const nextWorkspaceOffset =
    workspaceTotalCount === null
      ? workspaceRows.length === workspaceLimit
        ? workspaceOffset + workspaceLimit
        : null
      : workspaceOffset + workspaceRows.length < workspaceTotalCount
        ? workspaceOffset + workspaceLimit
        : null;

  return {
    internalOnly,
    nextWorkspaceOffset,
    roles: roleRows
      .map((row) =>
        mapRoleRecord({
          companyName:
            workspaceById.get(String(row.company_workspace_id ?? ""))
              ?.company_name ?? "",
          row,
        })
      )
      .filter((row) => row.companyWorkspaceId),
    workspaceLimit,
    workspaceOffset,
    workspaceQuery: workspaceQueryText,
    workspaceTotalCount,
    workspaces: workspaceRows.map((row) => {
      const stats = roleStatsByWorkspaceId.get(
        String(row.company_workspace_id ?? "")
      ) ?? {
        active: 0,
        external: 0,
        internal: 0,
        total: 0,
      };

      return mapWorkspaceRecord({
        activeRoleCount: stats.active,
        externalRoleCount: stats.external,
        internalRoleCount: stats.internal,
        memberCount:
          memberCountByWorkspaceId.get(
            String(row.company_workspace_id ?? "")
          ) ?? 0,
        row,
        totalRoleCount: stats.total,
      });
    }),
  };
}

export async function fetchOpsOpportunityRoles(
  args: {
    internalOnly?: boolean;
    limit?: number;
    offset?: number;
    query?: string | null;
    roleId?: string | null;
    sourceType?: OpportunitySourceType | null;
    workspaceId?: string | null;
  } = {}
): Promise<OpsOpportunityRoleListResponse> {
  const admin = getSupabaseAdmin();
  const internalOnly = Boolean(args.internalOnly);
  const limit = Math.max(1, Math.min(Number(args.limit ?? 25) || 25, 100));
  const offset = Math.max(0, Number(args.offset ?? 0) || 0);
  const queryText = sanitizeCompanyManagementFilterText(
    String(args.query ?? "")
  );
  const sourceType =
    args.sourceType === "internal" || args.sourceType === "external"
      ? args.sourceType
      : null;
  const roleId = String(args.roleId ?? "").trim() || null;
  const workspaceId = String(args.workspaceId ?? "").trim() || null;

  let workspaceNameById = new Map<string, string>();
  let queryMatchesWorkspace = false;

  if (workspaceId) {
    const { data: workspaceData, error: workspaceError } = await (
      admin.from("company_workspace" as any) as any
    )
      .select("company_workspace_id, company_name, is_internal")
      .eq("company_workspace_id", workspaceId)
      .maybeSingle();

    if (workspaceError) {
      throw new Error(workspaceError.message ?? "Failed to load workspace");
    }

    if (!workspaceData || (internalOnly && !workspaceData.is_internal)) {
      return {
        internalOnly,
        items: [],
        limit,
        nextOffset: null,
        offset,
        query: queryText,
        sourceType,
        totalCount: 0,
        workspaceId,
      };
    }

    const workspaceName = String(workspaceData.company_name ?? "");
    workspaceNameById = new Map([[workspaceId, workspaceName]]);
    queryMatchesWorkspace = Boolean(
      queryText && workspaceName.toLowerCase().includes(queryText.toLowerCase())
    );
  }

  let roleQuery = (admin.from("company_roles" as any) as any)
    .select(
      "role_id, company_workspace_id, name, external_jd_url, description, description_summary, type, status, request, created_at, updated_at, source_type, source_provider, source_job_id, posted_at, expires_at, location_text, work_mode",
      { count: "exact" }
    )
    .order("updated_at", { ascending: false }) as any;

  if (workspaceId) {
    roleQuery = roleQuery.eq("company_workspace_id", workspaceId);
  }

  if (roleId) {
    roleQuery = roleQuery.eq("role_id", roleId);
  }

  if (sourceType) {
    roleQuery = applyRoleSourceTypeFilter(roleQuery, sourceType);
  }

  if (queryText && !queryMatchesWorkspace) {
    roleQuery = roleQuery.or(
      [
        `name.ilike.%${queryText}%`,
        `description.ilike.%${queryText}%`,
        `description_summary.ilike.%${queryText}%`,
        `location_text.ilike.%${queryText}%`,
        `request.ilike.%${queryText}%`,
        `external_jd_url.ilike.%${queryText}%`,
      ].join(",")
    );
  }

  const roleResponse = await roleQuery.range(offset, offset + limit - 1);
  const roleError = (roleResponse as { error?: { message?: string } }).error;
  if (roleError) {
    throw new Error(roleError.message ?? "Failed to load roles");
  }

  let roleRows = coerceJsonArray<RoleRow>(
    (roleResponse as { data?: unknown }).data
  );

  if (!workspaceId && internalOnly && roleRows.length > 0) {
    const workspaceIds = Array.from(
      new Set(
        roleRows
          .map((row) => String(row.company_workspace_id ?? "").trim())
          .filter(Boolean)
      )
    );
    const { data: workspaceData, error: workspaceError } = await (
      admin.from("company_workspace" as any) as any
    )
      .select("company_workspace_id, company_name, is_internal")
      .in("company_workspace_id", workspaceIds)
      .eq("is_internal", true);

    if (workspaceError) {
      throw new Error(workspaceError.message ?? "Failed to load workspaces");
    }

    workspaceNameById = new Map(
      coerceJsonArray<{
        company_name?: string | null;
        company_workspace_id?: string | null;
      }>(workspaceData).map((row) => [
        String(row.company_workspace_id ?? ""),
        String(row.company_name ?? ""),
      ])
    );
    roleRows = roleRows.filter((row) =>
      workspaceNameById.has(String(row.company_workspace_id ?? ""))
    );
  } else if (!workspaceId && roleRows.length > 0) {
    const workspaceIds = Array.from(
      new Set(
        roleRows
          .map((row) => String(row.company_workspace_id ?? "").trim())
          .filter(Boolean)
      )
    );
    const { data: workspaceData, error: workspaceError } = await (
      admin.from("company_workspace" as any) as any
    )
      .select("company_workspace_id, company_name")
      .in("company_workspace_id", workspaceIds);

    if (workspaceError) {
      throw new Error(workspaceError.message ?? "Failed to load workspaces");
    }

    workspaceNameById = new Map(
      coerceJsonArray<{
        company_name?: string | null;
        company_workspace_id?: string | null;
      }>(workspaceData).map((row) => [
        String(row.company_workspace_id ?? ""),
        String(row.company_name ?? ""),
      ])
    );
  }

  const totalCount =
    typeof (roleResponse as { count?: unknown }).count === "number"
      ? (roleResponse as { count: number }).count
      : null;
  const nextOffset =
    totalCount === null
      ? roleRows.length === limit
        ? offset + limit
        : null
      : offset + roleRows.length < totalCount
        ? offset + limit
        : null;

  return {
    internalOnly,
    items: roleRows.map((row) =>
      mapRoleRecord({
        companyName:
          workspaceNameById.get(String(row.company_workspace_id ?? "")) ?? "",
        row,
      })
    ),
    limit,
    nextOffset,
    offset,
    query: queryText,
    sourceType,
    totalCount,
    workspaceId,
  };
}

const COMPANY_MANAGEMENT_SELECT = `
  company_workspace_id,
  company_name,
  homepage_url,
  career_url,
  linkedin_url,
  logo_url,
  company_description,
  company_db_id,
  is_scrape_original,
  created_at,
  updated_at,
  company_db:company_db (
    id,
    name,
    logo,
    short_description,
    description,
    employee_count_range,
    investors,
    specialities,
    funding_url,
    crunchbase_information,
    last_crunchbase_updated_at,
    location,
    founded_year,
    website_url,
    linkedin_url
  )
`;

const COMPANY_MANAGEMENT_SELECT_WITH_COMPANY_DB_FILTER =
  COMPANY_MANAGEMENT_SELECT.replace(
    "company_db:company_db (",
    "company_db:company_db!inner ("
  );
const COMPANY_MANAGEMENT_QUALITY_LABEL_V2_SELECT = `
  company_workspace_quality_label (
    llm_quality_label_v2
  )
`;
const MAX_COMPANY_DB_IDS_IN_WORKSPACE_FILTER = 500;

function sanitizeCompanyManagementFilterText(value: string) {
  return value
    .replace(/[%(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompanyManagementFoundedYearMin(value: unknown) {
  const year = Math.floor(Number(value ?? 0));
  return Number.isFinite(year) && year > 0 ? year : null;
}

function normalizeCompanyManagementEmployeeCountRangeFilter(
  value: unknown
): OpsCompanyManagementEmployeeCountRangeFilter {
  return OPS_COMPANY_MANAGEMENT_EMPLOYEE_COUNT_RANGE_OPTIONS.some(
    (option) => option.value === value
  )
    ? (value as OpsCompanyManagementEmployeeCountRangeFilter)
    : "";
}

function normalizeCompanyQualityLabel(
  value: unknown
): OpsCompanyQualityLabel | null {
  if (value === 0 || value === 1 || value === 2) return value;
  if (value === null || value === undefined) return null;
  const normalizedValue = typeof value === "string" ? value.trim() : value;
  if (normalizedValue === "") return null;
  const numeric = Number(normalizedValue);
  return numeric === 0 || numeric === 1 || numeric === 2
    ? (numeric as OpsCompanyQualityLabel)
    : null;
}

function getEffectiveCompanyQualityLabel(args: {
  humanQualityLabel: unknown;
  llmQualityLabel: unknown;
}) {
  return (
    normalizeCompanyQualityLabel(args.humanQualityLabel) ??
    normalizeCompanyQualityLabel(args.llmQualityLabel)
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArrayValue(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => stringValue(item))
    .filter((item): item is string => Boolean(item));
}

function getJsonPath(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    if (!isJsonObject(current)) return null;
    current = current[key];
  }
  return current;
}

function extractLatestFundingRound(
  crunchbaseInformation: Json | null | undefined
): OpsCompanyLatestFundingRound | null {
  const candidates = [
    getJsonPath(crunchbaseInformation, ["funding", "latest_round"]),
    getJsonPath(crunchbaseInformation, ["funding", "latestRound"]),
    getJsonPath(crunchbaseInformation, ["latest_funding_round"]),
    getJsonPath(crunchbaseInformation, ["latestFundingRound"]),
  ];
  const rawRound = candidates.find(isJsonObject);
  if (!rawRound || !isJsonObject(rawRound)) return null;

  const leadInvestors = [
    ...stringArrayValue(rawRound.leadInvestors),
    ...stringArrayValue(rawRound.lead_investors),
  ];
  const uniqueLeadInvestors = Array.from(new Set(leadInvestors));

  const latestRound = {
    amountText:
      stringValue(rawRound.amountText) ??
      stringValue(rawRound.amount_text) ??
      stringValue(rawRound.amount),
    announcedOn:
      stringValue(rawRound.announcedOn) ??
      stringValue(rawRound.announced_on) ??
      stringValue(rawRound.date),
    leadInvestors: uniqueLeadInvestors,
    name: stringValue(rawRound.name) ?? stringValue(rawRound.roundName),
  };

  return latestRound.amountText ||
    latestRound.announcedOn ||
    latestRound.leadInvestors.length > 0 ||
    latestRound.name
    ? latestRound
    : null;
}

function getEmbeddedCompanyDb(
  value: CompanyManagementWorkspaceRow["company_db"]
): CompanyManagementCompanyDbRow | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function isMissingQualityLabelTableError(error: { message?: string } | null) {
  return Boolean(
    error?.message &&
    /company_workspace_quality_label|relation .* does not exist/i.test(
      error.message
    )
  );
}

async function fetchCompanyQualityLabelsByWorkspaceId(
  admin: AdminClient,
  workspaceIds: string[]
) {
  const labelsByWorkspaceId = new Map<
    string,
    CompanyWorkspaceQualityLabelRow
  >();
  const uniqueWorkspaceIds = Array.from(
    new Set(workspaceIds.map((id) => String(id ?? "").trim()).filter(Boolean))
  );
  if (uniqueWorkspaceIds.length === 0) return labelsByWorkspaceId;

  const { data, error } = await (
    admin.from("company_workspace_quality_label" as any) as any
  )
    .select(
      [
        "company_workspace_id",
        "human_quality_label",
        "human_quality_labeled_at",
        "llm_quality_label",
        "llm_quality_label_reason",
        "llm_quality_labeled_at",
      ].join(", ")
    )
    .in("company_workspace_id", uniqueWorkspaceIds);

  if (error) {
    if (isMissingQualityLabelTableError(error)) return labelsByWorkspaceId;
    throw new Error(error.message ?? "Failed to load company quality labels");
  }

  for (const row of coerceJsonArray<CompanyWorkspaceQualityLabelRow>(data)) {
    const workspaceId = String(row.company_workspace_id ?? "").trim();
    if (!workspaceId) continue;
    labelsByWorkspaceId.set(workspaceId, row);
  }

  return labelsByWorkspaceId;
}

async function fetchWorkspaceIdsForQualityLabelFilter(
  admin: AdminClient,
  qualityLabel: OpsCompanyManagementQualityLabelFilter
) {
  if (!qualityLabel) return null;

  let query = (admin.from("company_workspace_quality_label" as any) as any)
    .select("company_workspace_id")
    .limit(10000);

  if (qualityLabel === "unlabeled") {
    query = query.or(
      "human_quality_label.not.is.null,llm_quality_label.not.is.null"
    );
  } else {
    query = query.or(
      [
        `human_quality_label.eq.${qualityLabel}`,
        `and(human_quality_label.is.null,llm_quality_label.eq.${qualityLabel})`,
      ].join(",")
    );
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingQualityLabelTableError(error)) {
      return qualityLabel === "unlabeled"
        ? { ids: [], mode: "exclude" as const }
        : { ids: [], mode: "include" as const };
    }
    throw new Error(error.message ?? "Failed to filter company quality labels");
  }

  const ids = coerceJsonArray<{ company_workspace_id?: string | null }>(data)
    .map((row) => String(row.company_workspace_id ?? "").trim())
    .filter(Boolean);
  return {
    ids,
    mode:
      qualityLabel === "unlabeled"
        ? ("exclude" as const)
        : ("include" as const),
  };
}

async function fetchHumanLabeledCompanyWorkspaceIds(admin: AdminClient) {
  const { data, error } = await (
    admin.from("company_workspace_quality_label" as any) as any
  )
    .select("company_workspace_id")
    .not("human_quality_label", "is", null)
    .limit(10000);

  if (error) {
    if (isMissingQualityLabelTableError(error)) return [];
    throw new Error(error.message ?? "Failed to load human quality labels");
  }

  return coerceJsonArray<{ company_workspace_id?: string | null }>(data)
    .map((row) => String(row.company_workspace_id ?? "").trim())
    .filter(Boolean);
}

async function fetchLlmQualityLabelCompanyWorkspaceIds(
  admin: AdminClient,
  llmQualityLabel: OpsCompanyQualityLabel
) {
  const { data, error } = await (
    admin.from("company_workspace_quality_label" as any) as any
  )
    .select("company_workspace_id")
    .eq("llm_quality_label", llmQualityLabel)
    .limit(10000);

  if (error) {
    if (isMissingQualityLabelTableError(error)) return [];
    throw new Error(error.message ?? "Failed to load llm quality labels");
  }

  return coerceJsonArray<{ company_workspace_id?: string | null }>(data)
    .map((row) => String(row.company_workspace_id ?? "").trim())
    .filter(Boolean);
}

async function fetchCompanyDbIdsForCompanyManagementFilters(
  admin: AdminClient,
  filters: {
    companyName?: string | null;
    foundedYearMin?: number | null;
    investors?: string | null;
    location?: string | null;
  }
) {
  const companyName = sanitizeCompanyManagementFilterText(
    String(filters.companyName ?? "")
  );
  const location = sanitizeCompanyManagementFilterText(
    String(filters.location ?? "")
  );
  const foundedYearMin = normalizeCompanyManagementFoundedYearMin(
    filters.foundedYearMin
  );
  const investors = sanitizeCompanyManagementFilterText(
    String(filters.investors ?? "")
  );
  if (!companyName && !location && !foundedYearMin && !investors) {
    return [];
  }

  let companyDbQuery = (admin.from("company_db" as any) as any).select("id");
  if (companyName) {
    companyDbQuery = companyDbQuery.ilike("name", `%${companyName}%`);
  }
  if (location) {
    companyDbQuery = companyDbQuery.ilike("location", `%${location}%`);
  }
  if (investors) {
    companyDbQuery = companyDbQuery.ilike("investors", `%${investors}%`);
  }
  if (foundedYearMin) {
    companyDbQuery = companyDbQuery.gte("founded_year", foundedYearMin);
  }

  const { data, error } = await companyDbQuery.limit(5000);

  if (error) {
    throw new Error(error.message ?? "Failed to search company_db");
  }

  return coerceJsonArray<{ id?: number | null }>(data)
    .map((row) => row.id)
    .filter((id): id is number => typeof id === "number");
}

async function fetchRecentJoinCountByCompanyDbId(
  admin: AdminClient,
  companyDbIds: number[]
) {
  const counts = new Map<number, number>();
  const uniqueCompanyDbIds = Array.from(new Set(companyDbIds)).filter(
    (id) => Number.isFinite(id) && id > 0
  );
  if (uniqueCompanyDbIds.length === 0) return counts;

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const startDate = oneYearAgo.toISOString().slice(0, 10);

  const { data, error } = await (admin.from("experience_user" as any) as any)
    .select("company_id, candid_id")
    .in("company_id", uniqueCompanyDbIds)
    .gte("start_date", startDate);

  if (error) {
    throw new Error(error.message ?? "Failed to load recent join counts");
  }

  const peopleByCompanyDbId = new Map<number, Set<string>>();
  for (const row of coerceJsonArray<{
    candid_id?: string | null;
    company_id?: number | null;
  }>(data)) {
    if (typeof row.company_id !== "number") continue;
    const candidId = String(row.candid_id ?? "").trim();
    if (!candidId) continue;

    const people = peopleByCompanyDbId.get(row.company_id) ?? new Set<string>();
    people.add(candidId);
    peopleByCompanyDbId.set(row.company_id, people);
  }

  for (const [companyDbId, people] of Array.from(peopleByCompanyDbId)) {
    counts.set(companyDbId, people.size);
  }

  return counts;
}

function mapCompanyManagementRecord(args: {
  qualityLabelRow?: CompanyWorkspaceQualityLabelRow | null;
  recentJoinCount: number;
  row: CompanyManagementWorkspaceRow;
}): OpsCompanyManagementRecord {
  const companyDb = getEmbeddedCompanyDb(args.row.company_db);
  const companyDbRecord: OpsCompanyManagementCompanyDbRecord | null = companyDb
    ? {
        crunchbaseInformation: companyDb.crunchbase_information ?? null,
        description: companyDb.description ?? null,
        employeeCountRange: companyDb.employee_count_range ?? null,
        foundedYear:
          typeof companyDb.founded_year === "number"
            ? companyDb.founded_year
            : null,
        fundingUrl: companyDb.funding_url ?? null,
        id: typeof companyDb.id === "number" ? companyDb.id : null,
        investors: companyDb.investors ?? null,
        linkedinUrl: companyDb.linkedin_url ?? null,
        location: companyDb.location ?? null,
        logoUrl: companyDb.logo ?? null,
        name: companyDb.name ?? null,
        shortDescription: companyDb.short_description ?? null,
        specialities: companyDb.specialities ?? null,
        websiteUrl: companyDb.website_url ?? null,
      }
    : null;
  const humanQualityLabel = normalizeCompanyQualityLabel(
    args.qualityLabelRow?.human_quality_label
  );
  const llmQualityLabel = normalizeCompanyQualityLabel(
    args.qualityLabelRow?.llm_quality_label
  );
  const effectiveQualityLabel = getEffectiveCompanyQualityLabel({
    humanQualityLabel,
    llmQualityLabel,
  });

  return {
    companyDb: companyDbRecord,
    companyDbId:
      typeof args.row.company_db_id === "number"
        ? args.row.company_db_id
        : null,
    companyDescription:
      args.row.company_description ??
      companyDbRecord?.shortDescription ??
      companyDbRecord?.description ??
      null,
    companyName:
      String(args.row.company_name ?? "").trim() ||
      String(companyDbRecord?.name ?? "").trim(),
    companyWorkspaceId: String(args.row.company_workspace_id ?? ""),
    effectiveQualityLabel,
    employeeCountRange: companyDbRecord?.employeeCountRange ?? null,
    foundedYear: companyDbRecord?.foundedYear ?? null,
    homepageUrl: args.row.homepage_url ?? companyDbRecord?.websiteUrl ?? null,
    humanQualityLabel,
    humanQualityLabeledAt:
      args.qualityLabelRow?.human_quality_labeled_at ?? null,
    industry: companyDbRecord?.specialities ?? null,
    investors: companyDb?.investors ?? null,
    isScrapeOriginal: Boolean(args.row.is_scrape_original),
    latestFundingRound: extractLatestFundingRound(
      companyDbRecord?.crunchbaseInformation
    ),
    linkedinUrl: args.row.linkedin_url ?? companyDbRecord?.linkedinUrl ?? null,
    location: companyDbRecord?.location ?? null,
    logoUrl: args.row.logo_url ?? companyDbRecord?.logoUrl ?? null,
    llmQualityLabel,
    llmQualityLabeledAt: args.qualityLabelRow?.llm_quality_labeled_at ?? null,
    llmQualityLabelReason:
      args.qualityLabelRow?.llm_quality_label_reason ?? null,
    recentJoinCount: args.recentJoinCount,
    updatedAt: String(args.row.updated_at ?? args.row.created_at ?? ""),
  };
}

export async function fetchOpsCompanyManagementPage(args: {
  companyName?: string | null;
  employeeCountRange?: OpsCompanyManagementEmployeeCountRangeFilter | null;
  foundedYearMin?: number | string | null;
  hasCareerUrlOnly?: boolean | null;
  humanLabelMissingFirst?: boolean | null;
  investors?: string | null;
  limit?: number;
  llmQualityLabelFirst?: boolean | null;
  location?: string | null;
  offset?: number;
  qualityLabel?: OpsCompanyManagementQualityLabelFilter | null;
  query?: string | null;
}): Promise<OpsCompanyManagementPageResponse> {
  const admin = getSupabaseAdmin();
  const limit = Math.max(
    1,
    Math.min(
      Number(args.limit ?? OPS_COMPANY_MANAGEMENT_PAGE_SIZE) ||
        OPS_COMPANY_MANAGEMENT_PAGE_SIZE,
      OPS_COMPANY_MANAGEMENT_PAGE_SIZE
    )
  );
  const offset = Math.max(0, Number(args.offset ?? 0) || 0);
  const companyName = sanitizeCompanyManagementFilterText(
    String(args.companyName ?? args.query ?? "")
  );
  const location = sanitizeCompanyManagementFilterText(
    String(args.location ?? "")
  );
  const investors = sanitizeCompanyManagementFilterText(
    String(args.investors ?? "")
  );
  const foundedYearMin = normalizeCompanyManagementFoundedYearMin(
    args.foundedYearMin
  );
  const employeeCountRange = normalizeCompanyManagementEmployeeCountRangeFilter(
    args.employeeCountRange
  );
  const qualityLabel = normalizeOpsCompanyManagementQualityLabelFilter(
    args.qualityLabel
  );
  const humanLabelMissingFirst = Boolean(args.humanLabelMissingFirst);
  const llmQualityLabelFirst = Boolean(args.llmQualityLabelFirst);
  const qualityWorkspaceFilter = await fetchWorkspaceIdsForQualityLabelFilter(
    admin,
    qualityLabel
  );
  const employeeCountRangeExactJsonValues =
    getOpsCompanyManagementEmployeeCountRangeExactJsonValues(
      employeeCountRange
    );
  const hasCareerUrlOnly = Boolean(args.hasCareerUrlOnly);
  const hasCompanyDbFilters = Boolean(
    employeeCountRange || location || foundedYearMin || investors
  );
  const shouldOrderByLlmQualityLabelV2 =
    !llmQualityLabelFirst && !humanLabelMissingFirst;
  const companyNameCompanyDbIds = companyName
    ? await fetchCompanyDbIdsForCompanyManagementFilters(admin, {
        companyName,
      })
    : [];
  const shouldFilterByCompanyNameCompanyDbIds =
    companyNameCompanyDbIds.length > 0 &&
    companyNameCompanyDbIds.length <= MAX_COMPANY_DB_IDS_IN_WORKSPACE_FILTER;

  if (
    qualityWorkspaceFilter?.mode === "include" &&
    qualityWorkspaceFilter.ids.length === 0
  ) {
    return {
      filters: {
        companyName,
        employeeCountRange,
        foundedYearMin,
        hasCareerUrlOnly,
        humanLabelMissingFirst,
        investors,
        llmQualityLabelFirst,
        location,
        qualityLabel,
      },
      items: [],
      limit,
      nextOffset: null,
      offset,
      query: companyName,
    };
  }

  const selectColumns = hasCompanyDbFilters
    ? COMPANY_MANAGEMENT_SELECT_WITH_COMPANY_DB_FILTER
    : COMPANY_MANAGEMENT_SELECT;
  const workspaceSelectColumns = shouldOrderByLlmQualityLabelV2
    ? `${selectColumns}, ${COMPANY_MANAGEMENT_QUALITY_LABEL_V2_SELECT}`
    : selectColumns;
  const buildWorkspaceQuery = (options: {
    count?: boolean;
    excludeWorkspaceIds?: string[];
    humanLabelMode?: "missing" | "present";
    humanLabeledWorkspaceIds?: string[];
    includeWorkspaceIds?: string[];
    labelFilter?: {
      humanLabeled?: "present" | "missing";
      llmIsTwo?: "eq" | "neq";
    } | null;
    rangeOffset: number;
    rowCount: number;
  }) => {
    const excludeWorkspaceIds = options.excludeWorkspaceIds ?? [];
    const humanLabeledWorkspaceIds = options.humanLabeledWorkspaceIds ?? [];
    const includeWorkspaceIds = options.includeWorkspaceIds ?? [];
    const labelFilter = options.labelFilter ?? null;
    const tableName = labelFilter
      ? "ops_company_workspace_with_label"
      : "company_workspace";
    let workspaceQuery = options.count
      ? ((admin.from(tableName as any) as any).select(selectColumns, {
          count: "exact",
        }) as any)
      : ((admin.from(tableName as any) as any).select(selectColumns) as any);

    workspaceQuery = shouldOrderByLlmQualityLabelV2
      ? workspaceQuery
          .order("company_workspace_quality_label(llm_quality_label_v2)", {
            ascending: false,
            nullsFirst: false,
          })
          .order("created_at", { ascending: false, nullsFirst: false })
          .order("company_workspace_id", { ascending: true })
      : workspaceQuery
          .order("is_scrape_original", {
            ascending: false,
            nullsFirst: false,
          })
          .order("updated_at", { ascending: false, nullsFirst: false })
          .order("company_workspace_id", { ascending: true });

    if (hasCareerUrlOnly) {
      workspaceQuery = workspaceQuery
        .not("career_url", "is", null)
        .neq("career_url", "");
    } else {
      workspaceQuery = workspaceQuery.is("career_url", null);
    }

    if (
      qualityWorkspaceFilter?.mode === "include" &&
      qualityWorkspaceFilter.ids.length > 0
    ) {
      workspaceQuery = workspaceQuery.in(
        "company_workspace_id",
        qualityWorkspaceFilter.ids
      );
    } else if (
      qualityWorkspaceFilter?.mode === "exclude" &&
      qualityWorkspaceFilter.ids.length > 0
    ) {
      workspaceQuery = workspaceQuery.not(
        "company_workspace_id",
        "in",
        `(${qualityWorkspaceFilter.ids.join(",")})`
      );
    }

    if (includeWorkspaceIds.length > 0) {
      workspaceQuery = workspaceQuery.in(
        "company_workspace_id",
        includeWorkspaceIds
      );
    }
    if (excludeWorkspaceIds.length > 0) {
      workspaceQuery = workspaceQuery.not(
        "company_workspace_id",
        "in",
        `(${excludeWorkspaceIds.join(",")})`
      );
    }

    if (
      options.humanLabelMode === "present" &&
      humanLabeledWorkspaceIds.length > 0
    ) {
      workspaceQuery = workspaceQuery.in(
        "company_workspace_id",
        humanLabeledWorkspaceIds
      );
    } else if (
      options.humanLabelMode === "missing" &&
      humanLabeledWorkspaceIds.length > 0
    ) {
      workspaceQuery = workspaceQuery.not(
        "company_workspace_id",
        "in",
        `(${humanLabeledWorkspaceIds.join(",")})`
      );
    }

    if (labelFilter?.llmIsTwo === "eq") {
      workspaceQuery = workspaceQuery.eq("cwql_llm_quality_label", 2);
    } else if (labelFilter?.llmIsTwo === "neq") {
      workspaceQuery = workspaceQuery.or(
        "cwql_llm_quality_label.neq.2,cwql_llm_quality_label.is.null"
      );
    }
    if (labelFilter?.humanLabeled === "present") {
      workspaceQuery = workspaceQuery.not(
        "cwql_human_quality_label",
        "is",
        null
      );
    } else if (labelFilter?.humanLabeled === "missing") {
      workspaceQuery = workspaceQuery.is("cwql_human_quality_label", null);
    }

    if (employeeCountRangeExactJsonValues.length === 1) {
      workspaceQuery = workspaceQuery.eq(
        "company_db.employee_count_range",
        employeeCountRangeExactJsonValues[0]
      );
    } else if (employeeCountRangeExactJsonValues.length > 1) {
      workspaceQuery = workspaceQuery.or(
        employeeCountRangeExactJsonValues
          .map((value) => `employee_count_range.eq.${value}`)
          .join(","),
        { foreignTable: "company_db" }
      );
    }

    if (location) {
      workspaceQuery = workspaceQuery.ilike(
        "company_db.location",
        `%${location}%`
      );
    }

    if (investors) {
      workspaceQuery = workspaceQuery.ilike(
        "company_db.investors",
        `%${investors}%`
      );
    }

    if (foundedYearMin) {
      workspaceQuery = workspaceQuery.gte(
        "company_db.founded_year",
        foundedYearMin
      );
    }

    if (companyName) {
      const workspaceNameFilters = [
        `company_name.ilike.%${companyName}%`,
        ...(shouldFilterByCompanyNameCompanyDbIds
          ? [`company_db_id.in.(${companyNameCompanyDbIds.join(",")})`]
          : []),
      ];
      workspaceQuery = workspaceQuery.or(workspaceNameFilters.join(","));
    }

    return workspaceQuery.range(
      options.rangeOffset,
      options.rangeOffset + options.rowCount - 1
    );
  };
  const fetchWorkspaceRows = async (options: {
    count?: boolean;
    excludeWorkspaceIds?: string[];
    humanLabelMode?: "missing" | "present";
    humanLabeledWorkspaceIds?: string[];
    includeWorkspaceIds?: string[];
    rangeOffset: number;
    rowCount: number;
  }) => {
    const { data, error, count } = await buildWorkspaceQuery(options);
    if (error) {
      throw new Error(error.message ?? "Failed to load companies");
    }
    return {
      count: typeof count === "number" ? count : null,
      rows: coerceJsonArray<CompanyManagementWorkspaceRow>(data),
    };
  };
  const collectWorkspaceRowsFromBuckets = async (
    buckets: Array<{
      excludeWorkspaceIds?: string[];
      humanLabelMode?: "missing" | "present";
      humanLabeledWorkspaceIds?: string[];
      includeWorkspaceIds?: string[];
      labelFilter?: {
        humanLabeled?: "present" | "missing";
        llmIsTwo?: "eq" | "neq";
      } | null;
      skipIfEmptyInclude?: boolean;
    }>
  ) => {
    const desiredRowCount = limit + 1;
    const collectedRows: CompanyManagementWorkspaceRow[] = [];
    let bucketOffset = offset;

    for (const bucket of buckets) {
      if (collectedRows.length >= desiredRowCount) break;
      if (
        bucket.skipIfEmptyInclude &&
        (bucket.includeWorkspaceIds?.length ?? 0) === 0
      ) {
        continue;
      }

      const result = await fetchWorkspaceRows({
        ...bucket,
        count: true,
        rangeOffset: bucketOffset,
        rowCount: desiredRowCount - collectedRows.length,
      });
      collectedRows.push(...result.rows);

      const bucketTotal = result.count ?? bucketOffset + result.rows.length;
      bucketOffset =
        bucketOffset >= bucketTotal ? bucketOffset - bucketTotal : 0;
    }

    return collectedRows;
  };

  let rows: CompanyManagementWorkspaceRow[];
  if (llmQualityLabelFirst && humanLabelMissingFirst) {
    rows = await collectWorkspaceRowsFromBuckets([
      { labelFilter: { humanLabeled: "missing", llmIsTwo: "eq" } },
      { labelFilter: { humanLabeled: "missing", llmIsTwo: "neq" } },
      { labelFilter: { humanLabeled: "present", llmIsTwo: "eq" } },
      { labelFilter: { humanLabeled: "present", llmIsTwo: "neq" } },
    ]);
  } else if (llmQualityLabelFirst) {
    rows = await collectWorkspaceRowsFromBuckets([
      { labelFilter: { llmIsTwo: "eq" } },
      { labelFilter: { llmIsTwo: "neq" } },
    ]);
  } else if (humanLabelMissingFirst) {
    rows = await collectWorkspaceRowsFromBuckets([
      { labelFilter: { humanLabeled: "missing" } },
      { labelFilter: { humanLabeled: "present" } },
    ]);
  } else {
    rows = (
      await fetchWorkspaceRows({
        rangeOffset: offset,
        rowCount: limit + 1,
      })
    ).rows;
  }
  const pageRows = rows.slice(0, limit);
  const qualityLabelsByWorkspaceId =
    await fetchCompanyQualityLabelsByWorkspaceId(
      admin,
      pageRows.map((row) => String(row.company_workspace_id ?? ""))
    );
  const pageCompanyDbIds = pageRows
    .map((row) => row.company_db_id)
    .filter((id): id is number => typeof id === "number");
  const recentJoinCountByCompanyDbId = await fetchRecentJoinCountByCompanyDbId(
    admin,
    pageCompanyDbIds
  );

  return {
    filters: {
      companyName,
      employeeCountRange,
      foundedYearMin,
      hasCareerUrlOnly,
      humanLabelMissingFirst,
      investors,
      llmQualityLabelFirst,
      location,
      qualityLabel,
    },
    items: pageRows
      .map((row) =>
        mapCompanyManagementRecord({
          qualityLabelRow: qualityLabelsByWorkspaceId.get(
            String(row.company_workspace_id ?? "")
          ),
          recentJoinCount:
            typeof row.company_db_id === "number"
              ? (recentJoinCountByCompanyDbId.get(row.company_db_id) ?? 0)
              : 0,
          row,
        })
      )
      .filter((row) => row.companyWorkspaceId),
    limit,
    nextOffset: rows.length > limit ? offset + limit : null,
    offset,
    query: companyName,
  };
}

export async function updateOpsCompanyScrapeOriginal(args: {
  isScrapeOriginal: boolean;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  const workspaceId = ensureNonEmptyString(args.workspaceId, "workspaceId");
  const isScrapeOriginal = Boolean(args.isScrapeOriginal);

  const { data, error } = await (admin.from("company_workspace" as any) as any)
    .update({
      is_scrape_original: isScrapeOriginal,
      updated_at: new Date().toISOString(),
    })
    .eq("company_workspace_id", workspaceId)
    .select("company_workspace_id, is_scrape_original")
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to update is_scrape_original");
  }

  return {
    isScrapeOriginal: Boolean(data?.is_scrape_original),
    workspaceId: String(data?.company_workspace_id ?? workspaceId),
  };
}

export async function updateOpsCompanyHumanQualityLabel(args: {
  humanQualityLabel: number | null;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  const workspaceId = ensureNonEmptyString(args.workspaceId, "workspaceId");
  const humanQualityLabel =
    args.humanQualityLabel === null
      ? null
      : normalizeCompanyQualityLabel(args.humanQualityLabel);

  if (args.humanQualityLabel !== null && humanQualityLabel === null) {
    throw new Error("humanQualityLabel must be 0, 1, 2, or null");
  }

  const now = new Date().toISOString();
  const { data, error } = await (
    admin.from("company_workspace_quality_label" as any) as any
  )
    .upsert(
      {
        company_workspace_id: workspaceId,
        human_quality_label: humanQualityLabel,
        human_quality_labeled_at: humanQualityLabel === null ? null : now,
        updated_at: now,
      },
      { onConflict: "company_workspace_id" }
    )
    .select(
      [
        "company_workspace_id",
        "human_quality_label",
        "human_quality_labeled_at",
        "llm_quality_label",
      ].join(", ")
    )
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to update human_quality_label");
  }

  const nextHumanQualityLabel = normalizeCompanyQualityLabel(
    data?.human_quality_label
  );
  const nextLlmQualityLabel = normalizeCompanyQualityLabel(
    data?.llm_quality_label
  );

  return {
    effectiveQualityLabel: nextHumanQualityLabel ?? nextLlmQualityLabel,
    humanQualityLabel: nextHumanQualityLabel,
    humanQualityLabeledAt: data?.human_quality_labeled_at ?? null,
    workspaceId: String(data?.company_workspace_id ?? workspaceId),
  };
}

export async function updateOpsCompanyLlmQualityLabel(args: {
  llmQualityLabel: number | null;
  llmQualityLabelReason?: string | null;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  const workspaceId = ensureNonEmptyString(args.workspaceId, "workspaceId");
  const llmQualityLabel =
    args.llmQualityLabel === null
      ? null
      : normalizeCompanyQualityLabel(args.llmQualityLabel);

  if (args.llmQualityLabel !== null && llmQualityLabel === null) {
    throw new Error("llmQualityLabel must be 0, 1, 2, or null");
  }

  const now = new Date().toISOString();
  const { data, error } = await (
    admin.from("company_workspace_quality_label" as any) as any
  )
    .upsert(
      {
        company_workspace_id: workspaceId,
        llm_quality_label: llmQualityLabel,
        llm_quality_label_reason:
          String(args.llmQualityLabelReason ?? "").trim() || null,
        llm_quality_labeled_at: llmQualityLabel === null ? null : now,
        updated_at: now,
      },
      { onConflict: "company_workspace_id" }
    )
    .select(
      [
        "company_workspace_id",
        "human_quality_label",
        "llm_quality_label",
        "llm_quality_label_reason",
        "llm_quality_labeled_at",
      ].join(", ")
    )
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to update llm_quality_label");
  }

  return {
    effectiveQualityLabel:
      normalizeCompanyQualityLabel(data?.human_quality_label) ??
      normalizeCompanyQualityLabel(data?.llm_quality_label),
    llmQualityLabel: normalizeCompanyQualityLabel(data?.llm_quality_label),
    llmQualityLabeledAt: data?.llm_quality_labeled_at ?? null,
    llmQualityLabelReason: data?.llm_quality_label_reason ?? null,
    workspaceId: String(data?.company_workspace_id ?? workspaceId),
  };
}

export async function saveOpsOpportunityWorkspace(args: {
  careerUrl?: string | null;
  companyDescription?: string | null;
  companyName: string;
  homepageUrl?: string | null;
  isInternal: boolean;
  linkedinUrl?: string | null;
  pitch?: string | null;
  request?: string | null;
  workspaceId?: string | null;
}) {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const companyName = ensureNonEmptyString(args.companyName, "companyName");
  const companyDbRecord = await resolveCompanyDbRecord({
    admin,
    companyName,
    linkedinUrl: args.linkedinUrl,
  });

  const payload = {
    career_url: String(args.careerUrl ?? "").trim() || null,
    company_db_id: companyDbRecord.companyDbId,
    company_description: String(args.companyDescription ?? "").trim() || null,
    company_name: companyName,
    homepage_url: String(args.homepageUrl ?? "").trim() || null,
    is_internal: args.isInternal,
    linkedin_url: companyDbRecord.linkedinUrl,
    logo_url: companyDbRecord.logoUrl,
    pitch: String(args.pitch ?? "").trim() || null,
    request: String(args.request ?? "").trim() || null,
    updated_at: now,
  };

  const workspaceId = String(args.workspaceId ?? "").trim();
  const query = workspaceId
    ? (admin.from("company_workspace" as any) as any)
        .update(payload)
        .eq("company_workspace_id", workspaceId)
    : (admin.from("company_workspace" as any) as any).insert({
        ...payload,
        created_at: now,
      });

  const { data, error } = await query
    .select(
      "company_workspace_id, company_name, homepage_url, career_url, linkedin_url, logo_url, company_description, company_db_id, is_internal, pitch, request, created_at, updated_at"
    )
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to save company");
  }

  return mapWorkspaceRecord({
    activeRoleCount: 0,
    externalRoleCount: 0,
    internalRoleCount: 0,
    row: data as WorkspaceRow,
    totalRoleCount: 0,
  });
}

export async function saveOpsOpportunityRole(args: {
  companyWorkspaceId?: string | null;
  description?: string | null;
  descriptionSummary?: string | null;
  employmentTypes?: OpportunityEmploymentType[];
  expiresAt?: string | null;
  externalJdUrl?: string | null;
  locationText?: string | null;
  name: string;
  postedAt?: string | null;
  request?: string | null;
  roleId?: string | null;
  sourceJobId?: string | null;
  sourceProvider?: string | null;
  sourceType?: OpportunitySourceType | null;
  status?: OpportunityStatus | null;
  workMode?: OpportunityWorkMode | null;
}) {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const workspaceId = ensureNonEmptyString(
    args.companyWorkspaceId,
    "companyWorkspaceId"
  );

  const { data: workspaceData, error: workspaceError } = await (
    admin.from("company_workspace" as any) as any
  )
    .select("company_workspace_id, company_name")
    .eq("company_workspace_id", workspaceId)
    .single();

  if (workspaceError || !workspaceData) {
    throw new Error(workspaceError?.message ?? "Workspace not found");
  }

  const payload = {
    company_workspace_id: workspaceId,
    description: String(args.description ?? "").trim() || null,
    description_summary: String(args.descriptionSummary ?? "").trim() || null,
    expires_at: parseDateString(args.expiresAt, "expiresAt"),
    external_jd_url: String(args.externalJdUrl ?? "").trim() || null,
    location_text: String(args.locationText ?? "").trim() || null,
    name: ensureNonEmptyString(args.name, "name"),
    posted_at: parseDateString(args.postedAt, "postedAt"),
    request: String(args.request ?? "").trim() || null,
    source_job_id: String(args.sourceJobId ?? "").trim() || null,
    source_provider: String(args.sourceProvider ?? "").trim() || null,
    source_type: normalizeOpportunitySourceType(args.sourceType),
    status: normalizeOpportunityStatus(args.status),
    type: sanitizeOpportunityEmploymentTypes(args.employmentTypes),
    updated_at: now,
    work_mode: normalizeOpportunityWorkMode(args.workMode),
  };

  const roleId = String(args.roleId ?? "").trim();
  const query = roleId
    ? (admin.from("company_roles" as any) as any)
        .update(payload)
        .eq("role_id", roleId)
        .eq("company_workspace_id", workspaceId)
    : (admin.from("company_roles" as any) as any).insert({
        ...payload,
        created_at: now,
      });

  const { data, error } = await query
    .select(
      "role_id, company_workspace_id, name, external_jd_url, description, description_summary, type, status, request, created_at, updated_at, source_type, source_provider, source_job_id, posted_at, expires_at, location_text, work_mode"
    )
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to save role");
  }

  return mapRoleRecord({
    companyName: String(
      (workspaceData as { company_name?: string }).company_name ?? ""
    ),
    row: data as RoleRow,
  });
}

export async function deleteOpsOpportunityRole(args: {
  companyWorkspaceId?: string | null;
  roleId?: string | null;
}) {
  const admin = getSupabaseAdmin();
  const roleId = ensureNonEmptyString(args.roleId, "roleId");
  const workspaceId = String(args.companyWorkspaceId ?? "").trim();

  let roleQuery = (admin.from("company_roles" as any) as any)
    .select("role_id, company_workspace_id")
    .eq("role_id", roleId);
  if (workspaceId) {
    roleQuery = roleQuery.eq("company_workspace_id", workspaceId);
  }

  const { data: role, error: roleError } = await roleQuery.maybeSingle();
  if (roleError) {
    throw new Error(roleError.message ?? "Failed to load role");
  }
  if (!role) {
    throw new Error("Role not found");
  }

  const { data: recommendationRows, error: recommendationError } = await (
    admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select("id")
    .eq("role_id", roleId);

  if (recommendationError) {
    throw new Error(
      recommendationError.message ?? "Failed to load role recommendations"
    );
  }

  const recommendationIds = coerceJsonArray<{ id?: string | null }>(
    recommendationRows
  )
    .map((item) => String(item.id ?? "").trim())
    .filter(Boolean);

  const deletedCounts: Record<string, number> = {};
  deletedCounts.talent_opportunity_chat_preview = await deleteRowsByColumnIn({
    admin,
    column: "recommendation_id",
    optional: true,
    select: "id",
    table: "talent_opportunity_chat_preview",
    values: recommendationIds,
  });
  deletedCounts.talent_progress = await deleteRowsByColumn({
    admin,
    column: "role_id",
    select: "id",
    table: "talent_progress",
    value: roleId,
  });
  deletedCounts.talent_opportunity_recommendation = await deleteRowsByColumn({
    admin,
    column: "role_id",
    select: "id",
    table: "talent_opportunity_recommendation",
    value: roleId,
  });
  deletedCounts.company_role_liveness = await deleteRowsByColumn({
    admin,
    column: "role_id",
    optional: true,
    table: "company_role_liveness",
    value: roleId,
  });
  deletedCounts.company_role_matched = await deleteRowsByColumn({
    admin,
    column: "role_id",
    optional: true,
    table: "company_role_matched",
    value: roleId,
  });
  deletedCounts.talent_external_fit = await deleteRowsByColumn({
    admin,
    column: "role_id",
    optional: true,
    table: "talent_external_fit",
    value: roleId,
  });
  deletedCounts.wonderful_fde_country_roles = await deleteRowsByColumn({
    admin,
    column: "role_id",
    optional: true,
    table: "wonderful_fde_country_roles",
    value: roleId,
  });

  let deleteRoleQuery = (admin.from("company_roles" as any) as any)
    .delete()
    .eq("role_id", roleId);
  if (workspaceId) {
    deleteRoleQuery = deleteRoleQuery.eq("company_workspace_id", workspaceId);
  }

  const { data: deletedRoles, error: deleteRoleError } =
    await deleteRoleQuery.select("role_id");
  if (deleteRoleError) {
    throw new Error(deleteRoleError.message ?? "Failed to delete role");
  }

  const deletedRoleCount = coerceJsonArray<{ role_id?: string | null }>(
    deletedRoles
  ).length;
  if (deletedRoleCount === 0) {
    throw new Error("Role not found");
  }
  deletedCounts.company_roles = deletedRoleCount;

  return {
    ok: true,
    deletedCounts,
    roleId,
  };
}

export async function syncOpsOpportunityRoles(args: {
  careerUrl?: string | null;
  workspaceId: string;
}): Promise<OpsOpportunityRoleSyncResult> {
  const admin = getSupabaseAdmin();
  const workspaceId = ensureNonEmptyString(args.workspaceId, "workspaceId");
  const { data: workspaceData, error: workspaceError } = await (
    admin.from("company_workspace" as any) as any
  )
    .select(
      "company_workspace_id, company_name, company_description, career_url"
    )
    .eq("company_workspace_id", workspaceId)
    .single();

  if (workspaceError || !workspaceData) {
    throw new Error(workspaceError?.message ?? "Workspace not found");
  }

  const workspace = workspaceData as Pick<
    WorkspaceRow,
    | "career_url"
    | "company_description"
    | "company_name"
    | "company_workspace_id"
  >;
  const careerUrl = normalizeCareerUrl(
    String(args.careerUrl ?? "").trim() ||
      String(workspace.career_url ?? "").trim()
  );

  if (!careerUrl) {
    throw new Error("career url이 필요합니다. 회사 정보에 먼저 저장해 주세요.");
  }

  const provider = detectExternalRoleProvider(careerUrl);
  if (!provider) {
    throw new Error(
      "현재는 Lever 또는 LinkedIn Jobs career url만 sync할 수 있습니다."
    );
  }

  const scrapedRoles = await fetchExternalRolesFromApify({
    careerUrl,
    provider,
  });
  const summarizedRoles = await summarizeExternalRoleSeeds({
    companyDescription: workspace.company_description ?? null,
    companyName: String(workspace.company_name ?? "").trim(),
    roles: scrapedRoles,
  });

  const { data: deletedRows, error: deleteError } = await (
    admin.from("company_roles" as any) as any
  )
    .delete()
    .eq("company_workspace_id", workspaceId)
    .neq("source_type", "internal")
    .select("role_id");

  if (deleteError) {
    throw new Error(deleteError.message ?? "Failed to delete external roles");
  }

  if (summarizedRoles.length > 0) {
    const now = new Date().toISOString();
    const payload = summarizedRoles.map((role) => ({
      company_workspace_id: workspaceId,
      created_at: now,
      description: role.description,
      description_summary: role.descriptionSummary,
      expires_at: role.expiresAt,
      external_jd_url: role.externalJdUrl,
      location_text: role.locationText,
      name: role.name,
      posted_at: role.postedAt,
      source_job_id: role.sourceJobId,
      source_provider: role.sourceProvider,
      source_type: "external",
      status: role.status,
      type: role.employmentTypes,
      updated_at: now,
      work_mode: role.workMode,
    }));

    const { error: insertError } = await (
      admin.from("company_roles" as any) as any
    )
      .insert(payload)
      .select("role_id");

    if (insertError) {
      throw new Error(insertError.message ?? "Failed to insert synced roles");
    }
  }

  return {
    deletedCount: coerceJsonArray<{ role_id?: string | null }>(deletedRows)
      .length,
    insertedCount: summarizedRoles.length,
    provider,
    workspaceId,
  };
}
