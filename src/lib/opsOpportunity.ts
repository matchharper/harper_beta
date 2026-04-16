import type { Json } from "@/types/database.types";
import { ApifyClient } from "apify-client";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import {
  DEFAULT_OPS_TALENT_RECOMMENDATION_PROMPT,
  renderOpsTalentRecommendationPrompt,
} from "@/lib/opsOpportunityRecommendationPrompt";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { normalizeTalentNetworkApplication } from "@/lib/talentNetworkApplication";
import {
  OPPORTUNITY_TYPE_LABEL,
  OpportunityType,
  isOpportunityType,
} from "@/lib/opportunityType";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

type WorkspaceRow = {
  career_url: string | null;
  company_db_id?: number | null;
  company_description: string | null;
  company_name: string;
  company_workspace_id: string;
  created_at: string;
  homepage_url: string | null;
  linkedin_url: string | null;
  logo_storage_path: string | null;
  logo_url: string | null;
  updated_at: string;
};

type RoleRow = {
  company_workspace_id: string;
  created_at: string;
  description: string | null;
  description_summary?: string | null;
  expires_at?: string | null;
  external_jd_url: string | null;
  information: Record<string, unknown> | null;
  location_text?: string | null;
  name: string;
  posted_at?: string | null;
  role_id: string;
  source_job_id?: string | null;
  source_provider?: string | null;
  source_type?: string | null;
  status: string;
  type: string[] | null;
  updated_at: string;
  work_mode?: string | null;
};

type CandidateRow = {
  bio: string | null;
  career_profile: unknown;
  email: string | null;
  headline: string | null;
  location: string | null;
  name: string | null;
  network_application: unknown;
  profile_picture: string | null;
  resume_links: string[] | null;
  resume_text: string | null;
  updated_at: string;
  user_id: string;
};

type TalentExperiencePromptRow = {
  company_location: string | null;
  company_name: string | null;
  description: string | null;
  end_date: string | null;
  memo: string | null;
  months: number | null;
  role: string | null;
  start_date: string | null;
};

type TalentEducationPromptRow = {
  degree: string | null;
  end_date: string | null;
  field: string | null;
  memo: string | null;
  school: string | null;
  start_date: string | null;
};

type MatchRow = {
  candid?: {
    headline: string | null;
    id: string;
    linkedin_url: string | null;
    location: string | null;
    name: string | null;
    profile_picture: string | null;
  } | null;
  candid_id: string;
  created_at: string;
  harper_memo: string | null;
  id: string;
  role_id: string;
  status: string;
  updated_at: string;
};

type RecommendationRow = {
  company_role: {
    company_workspace: {
      company_name: string;
    } | null;
    external_jd_url: string | null;
    location_text: string | null;
    name: string;
    posted_at: string | null;
    role_id: string;
    source_type: string;
  } | null;
  created_at: string;
  feedback: string | null;
  id: string;
  kind: string;
  opportunity_type: string | null;
  recommendation_reasons: Json;
  recommended_at: string;
  role_id: string;
  saved_stage: string | null;
  talent_id: string;
  updated_at: string;
};

type RecommendationDraftRoleRow = {
  company_workspace: {
    company_description: string | null;
    company_name: string | null;
    homepage_url: string | null;
    linkedin_url: string | null;
  } | null;
  description: string | null;
  expires_at: string | null;
  external_jd_url: string | null;
  location_text: string | null;
  name: string | null;
  posted_at: string | null;
  role_id: string;
  source_job_id: string | null;
  source_provider: string | null;
  source_type: string | null;
  status: string | null;
  type: string[] | null;
  work_mode: string | null;
};

type CompanyDbRow = {
  description: string | null;
  id: number;
  last_updated_at: string;
  linkedin_url: string | null;
  logo: string | null;
  name: string | null;
  short_description: string | null;
  website_url: string | null;
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
  linkedinUrl: string | null;
  logoStoragePath: string | null;
  logoUrl: string | null;
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
  matchedCandidateCount: number;
  name: string;
  postedAt: string | null;
  roleId: string;
  sourceJobId: string | null;
  sourceProvider: string | null;
  sourceType: OpportunitySourceType;
  status: OpportunityStatus;
  updatedAt: string;
  workMode: OpportunityWorkMode | null;
};

export type OpsOpportunityCatalogResponse = {
  roles: OpsOpportunityRoleRecord[];
  workspaces: OpsOpportunityWorkspaceRecord[];
};

export type OpsOpportunityCandidateRecord = {
  candidId: string | null;
  email: string | null;
  headline: string | null;
  linkedinUrl: string | null;
  location: string | null;
  matched: boolean;
  name: string | null;
  profilePicture: string | null;
  summary: string | null;
  talentId: string;
  totalExpMonths: number | null;
};

export type OpsOpportunityCandidateSearchResponse = {
  items: OpsOpportunityCandidateRecord[];
  query: string;
};

export type OpsOpportunityMatchRecord = {
  candidateHeadline: string | null;
  candidateId: string;
  candidateLinkedinUrl: string | null;
  candidateLocation: string | null;
  candidateName: string | null;
  candidateProfilePicture: string | null;
  companyName: string;
  createdAt: string;
  harperMemo: string | null;
  matchId: string;
  roleId: string;
  roleName: string;
  status: string;
  updatedAt: string;
};

export type OpsOpportunityMatchListResponse = {
  items: OpsOpportunityMatchRecord[];
};

export type OpsOpportunityRecommendationFeedback = "like" | "dislike";

export { OpportunityType as OpsOpportunityType };

export type OpsOpportunitySavedStage =
  | "saved"
  | "applied"
  | "connected"
  | "closed";

export type OpsOpportunityRecommendationRecord = {
  companyName: string;
  createdAt: string;
  feedback: OpsOpportunityRecommendationFeedback | null;
  kind: "match" | "recommendation";
  locationText: string | null;
  opportunityType: OpportunityType;
  postedAt: string | null;
  recommendationId: string;
  recommendationMemo: string | null;
  recommendationReasons: string[];
  recommendedAt: string;
  roleId: string;
  roleName: string;
  savedStage: OpsOpportunitySavedStage | null;
  sourceType: OpportunitySourceType;
  talentId: string;
  updatedAt: string;
};

export type OpsOpportunityRecommendationListResponse = {
  items: OpsOpportunityRecommendationRecord[];
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

function normalizeLink(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function findTalentLinkedinUrl(row: CandidateRow): string | null {
  const application =
    normalizeTalentNetworkApplication(row.career_profile) ??
    normalizeTalentNetworkApplication(row.network_application);
  if (application?.linkedinProfileUrl) {
    return normalizeLink(application.linkedinProfileUrl);
  }

  const resumeLinks = Array.isArray(row.resume_links) ? row.resume_links : [];
  const linkedinLink = resumeLinks.find((item) =>
    /linkedin\.com\/(in|pub)\//i.test(String(item ?? ""))
  );

  if (!linkedinLink) return null;
  return normalizeLink(String(linkedinLink));
}

function extractLinkedinProfileId(
  raw: string | null | undefined
): string | null {
  const normalized = String(raw ?? "").trim();
  if (!normalized) return null;

  try {
    const parsed = new URL(normalizeLink(normalized));
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!(host === "linkedin.com" || host.endsWith(".linkedin.com"))) {
      return null;
    }

    const segments = parsed.pathname
      .split("/")
      .map((segment) => decodeURIComponent(segment).trim().toLowerCase())
      .filter(Boolean);

    if ((segments[0] === "in" || segments[0] === "pub") && segments[1]) {
      return segments[1].replace(/[^a-z0-9-_%]/g, "");
    }

    return null;
  } catch {
    return null;
  }
}

async function resolveCandidateIdByLinkedinProfileIds(
  admin: AdminClient,
  profileIds: string[]
) {
  const uniqueIds = Array.from(
    new Set(profileIds.map((item) => item.trim()).filter(Boolean))
  );
  const byProfileId = new Map<string, string>();

  await Promise.all(
    uniqueIds.map(async (profileId) => {
      const pattern = `%linkedin.com/in/${profileId}%`;
      let { data, error } = await (admin.from("candid" as any) as any)
        .select("id, linkedin_url, last_updated_at")
        .ilike("linkedin_url", pattern)
        .order("last_updated_at", { ascending: false, nullsFirst: false })
        .limit(1);

      if (!error && coerceJsonArray(data).length === 0) {
        const pubPattern = `%linkedin.com/pub/${profileId}%`;
        const fallbackResponse = await (admin.from("candid" as any) as any)
          .select("id, linkedin_url, last_updated_at")
          .ilike("linkedin_url", pubPattern)
          .order("last_updated_at", { ascending: false, nullsFirst: false })
          .limit(1);
        data = fallbackResponse.data;
        error = fallbackResponse.error;
      }

      if (error) {
        throw new Error(error.message ?? "Failed to resolve candidate");
      }

      const match = coerceJsonArray<{
        id?: string | null;
        linkedin_url?: string | null;
      }>(data)[0];

      const candidateId = String(match?.id ?? "").trim();
      if (!candidateId) return;
      byProfileId.set(profileId, candidateId);
    })
  );

  return byProfileId;
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

  return decodeHtmlEntities(normalized).replace(/[ \t]+\n/g, "\n").replace(
    /\n{3,}/g,
    "\n\n"
  );
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
  const normalized = String(value ?? "").trim().toLowerCase();
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

function inferWorkModeFromLabels(values: unknown[]): OpportunityWorkMode | null {
  const normalizedValues = values
    .map((item) => String(item ?? "").trim().toLowerCase())
    .filter(Boolean);

  if (
    normalizedValues.some((item) =>
      item.includes("hybrid") || item.includes("하이브리드")
    )
  ) {
    return "hybrid";
  }
  if (
    normalizedValues.some((item) =>
      item.includes("remote") ||
      item.includes("remotely") ||
      item.includes("리모트")
    )
  ) {
    return "remote";
  }
  if (
    normalizedValues.some((item) =>
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

function getApifyClient() {
  const token = String(process.env.APIFY_CLIENT_KEY ?? "").trim();
  if (!token) {
    throw new Error("APIFY_CLIENT_KEY is not configured");
  }
  return new ApifyClient({ token });
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

    if (host === "jobs.lever.co" || host.endsWith(".lever.co") || host === "lever.co") {
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
  return [prefix, location ? `(${location})` : ""].filter(Boolean).join(" ").trim();
}

async function summarizeExternalRoleDescription(args: {
  companyDescription: string | null;
  companyName: string;
  role: SyncedExternalRoleSeed;
}) {
  const roleDescriptionText = clampPromptText(htmlToPlainText(args.role.description), 5000);
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
    const summary = await runTalentAssistantCompletion({
      messages: [
        {
          role: "system",
          content:
            "You summarize job descriptions for an internal recruiting database. Return one short plain-text paragraph in Korean. Mention what the company does, what the role owns, and the strongest qualification or domain signal. Do not use markdown or bullets. Keep it under 420 characters.",
        },
        {
          role: "user",
          content: [
            `Company: ${args.companyName}`,
            companyDescription ? `Company Description: ${companyDescription}` : "",
            `Role: ${args.role.name}`,
            args.role.locationText ? `Location: ${args.role.locationText}` : "",
            args.role.workMode ? `Work Mode: ${args.role.workMode}` : "",
            args.role.employmentTypes.length > 0
              ? `Employment Type: ${args.role.employmentTypes.join(", ")}`
              : "",
            roleDescriptionText ? `Job Description:\n${roleDescriptionText}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      temperature: 0.2,
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

function mapLeverRoleItem(item: Record<string, unknown>): SyncedExternalRoleSeed | null {
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
  const client = getApifyClient();

  if (args.provider === "lever") {
    const actorId =
      String(process.env.APIFY_LEVER_JOBS_ACTOR_ID ?? "").trim() ||
      DEFAULT_APIFY_LEVER_JOBS_ACTOR_ID;
    const run = await withTimeout(
      client.actor(actorId).call({
        urls: [{ url: args.careerUrl }],
        proxy: { useApifyProxy: true },
      }),
      120_000,
      "Lever Apify crawl timed out"
    );

    if (!run.defaultDatasetId) {
      throw new Error("Lever Apify actor returned no dataset");
    }

    const { items } = await withTimeout(
      client.dataset(run.defaultDatasetId).listItems({ limit: 500 }),
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
    client.actor(actorId).call({
      urls: [args.careerUrl],
      scrapeCompany: true,
      count: 100,
      splitByLocation: false,
    }),
    120_000,
    "LinkedIn Jobs Apify crawl timed out"
  );

  if (!run.defaultDatasetId) {
    throw new Error("LinkedIn Jobs Apify actor returned no dataset");
  }

  const { items } = await withTimeout(
    client.dataset(run.defaultDatasetId).listItems({ limit: 500 }),
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

function normalizeRecommendationKind(
  value: unknown
): "match" | "recommendation" {
  return value === "match" ? "match" : "recommendation";
}

function normalizeRecommendationFeedback(
  value: unknown
): OpsOpportunityRecommendationFeedback | null {
  if (value === "like" || value === "dislike") {
    return value;
  }
  return null;
}

function normalizeOpportunityType(value: unknown): OpportunityType {
  if (isOpportunityType(value)) return value;
  return OpportunityType.ExternalJd;
}

function normalizeSavedStage(value: unknown): OpsOpportunitySavedStage | null {
  if (
    value === "saved" ||
    value === "applied" ||
    value === "connected" ||
    value === "closed"
  ) {
    return value;
  }
  return null;
}

function normalizeRecommendationReasons(value: Json): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  if (value && typeof value === "object") {
    return Object.values(value)
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  return [];
}

function sanitizeRecommendationReason(value: unknown) {
  const normalized = String(value ?? "")
    .replace(/\r/g, "")
    .trim();
  if (!normalized) return "";

  return normalized
    .replace(/^[-*•]+\s*/, "")
    .replace(/^\d+[\].)\-:]+\s*/, "")
    .trim();
}

function splitRecommendationMemoIntoReasons(memo: string | null) {
  if (!memo) return [];

  const seen = new Set<string>();
  const items: string[] = [];

  for (const line of memo.replace(/\r/g, "").split("\n")) {
    const normalized = sanitizeRecommendationReason(line);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    items.push(normalized);
    if (items.length >= 8) break;
  }

  return items;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildOpportunityRecommendationNotificationMessage(args: {
  companyName: string;
  opportunityType: OpportunityType;
  roleName: string;
}) {
  const companyName = `<strong>${escapeHtml(args.companyName)}</strong>`;
  const roleName = `<strong>${escapeHtml(args.roleName)}</strong>`;

  if (args.opportunityType === OpportunityType.IntroRequest) {
    return `${companyName}의 채용담당자가 회원님과의 연결을 원합니다.`;
  }

  if (args.opportunityType === OpportunityType.InternalRecommendation) {
    return `${companyName}의 ${roleName}에 추천드리고 싶습니다.`;
  }

  return `${companyName}의 ${roleName} 기회를 추천합니다.`;
}

async function insertTalentOpportunityNotification(args: {
  admin: AdminClient;
  message: string;
  talentId: string;
}) {
  const now = new Date().toISOString();
  const message = String(args.message ?? "").trim();
  if (!message) {
    throw new Error("Notification message is required");
  }

  const { error } = await (args.admin.from("talent_notification" as any) as any)
    .insert({
      created_at: now,
      is_read: false,
      message,
      talent_id: args.talentId,
    } as any);

  if (error) {
    throw new Error(error.message ?? "Failed to insert talent notification");
  }
}

function buildRecommendationReasons(memo: string | null) {
  return splitRecommendationMemoIntoReasons(memo);
}

function mapRecommendationRecord(
  row: RecommendationRow
): OpsOpportunityRecommendationRecord | null {
  const role = row.company_role;
  const workspace = role?.company_workspace;
  if (!role || !workspace) return null;

  const recommendationReasons = normalizeRecommendationReasons(
    row.recommendation_reasons
  );

  return {
    companyName: String(workspace.company_name ?? ""),
    createdAt: String(row.created_at ?? ""),
    feedback: normalizeRecommendationFeedback(row.feedback),
    kind: normalizeRecommendationKind(row.kind),
    locationText: role.location_text ?? null,
    opportunityType: normalizeOpportunityType(row.opportunity_type),
    postedAt: role.posted_at ?? null,
    recommendationId: String(row.id ?? ""),
    recommendationMemo:
      recommendationReasons.length > 0
        ? recommendationReasons.join("\n")
        : null,
    recommendationReasons,
    recommendedAt: String(row.recommended_at ?? ""),
    roleId: String(row.role_id ?? ""),
    roleName: String(role.name ?? ""),
    savedStage: normalizeSavedStage(row.saved_stage),
    sourceType: normalizeOpportunitySourceType(role.source_type),
    talentId: String(row.talent_id ?? ""),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
  };
}

function clampPromptText(value: string | null | undefined, maxLength: number) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\r/g, "").trim();
  if (!normalized) return "";
  return normalized.slice(0, maxLength);
}

function formatPromptDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined
) {
  const start = String(startDate ?? "").trim();
  const end = String(endDate ?? "").trim();
  if (!start && !end) return "";
  if (start && end) return `${start} ~ ${end}`;
  if (start) return `${start} ~ Present`;
  return end;
}

function stringifyPromptJson(value: unknown, maxLength: number) {
  if (!value || typeof value !== "object") return "";

  try {
    return JSON.stringify(value, null, 2).slice(0, maxLength).trim();
  } catch {
    return "";
  }
}

function buildRecommendationTalentProfileContext(args: {
  candidate: CandidateRow;
  educations: TalentEducationPromptRow[];
  experiences: TalentExperiencePromptRow[];
}) {
  const { candidate, educations, experiences } = args;
  const lines: string[] = [];
  const resumeLinks = (candidate.resume_links ?? []).filter(
    (link): link is string => typeof link === "string" && link.trim().length > 0
  );

  lines.push("Basic");
  if (candidate.name) lines.push(`- Name: ${candidate.name}`);
  if (candidate.headline) lines.push(`- Headline: ${candidate.headline}`);
  if (candidate.location) lines.push(`- Location: ${candidate.location}`);
  if (candidate.email) lines.push(`- Email: ${candidate.email}`);

  const bio = clampPromptText(candidate.bio, 1200);
  if (bio) lines.push(`- Bio: ${bio}`);

  if (resumeLinks.length > 0) {
    lines.push("Resume Links");
    resumeLinks.slice(0, 8).forEach((link, index) => {
      lines.push(`${index + 1}. ${link}`);
    });
  }

  const careerProfile = stringifyPromptJson(candidate.career_profile, 2000);
  if (careerProfile) {
    lines.push("Career Profile JSON");
    lines.push(careerProfile);
  }

  const networkApplication = stringifyPromptJson(
    candidate.network_application,
    1200
  );
  if (networkApplication) {
    lines.push("Network Application JSON");
    lines.push(networkApplication);
  }

  if (experiences.length > 0) {
    lines.push("Experiences");
    experiences.slice(0, 8).forEach((experience, index) => {
      const parts = [
        `Role: ${experience.role ?? "(unknown)"}`,
        `Company: ${experience.company_name ?? "(unknown)"}`,
      ];
      const dateRange = formatPromptDateRange(
        experience.start_date,
        experience.end_date
      );
      if (dateRange) parts.push(`Dates: ${dateRange}`);
      if (experience.months && experience.months > 0) {
        parts.push(`Months: ${experience.months}`);
      }
      if (experience.company_location) {
        parts.push(`Location: ${experience.company_location}`);
      }

      let itemText = `${index + 1}. ${parts.join(", ")}`;
      const description = clampPromptText(experience.description, 500);
      if (description) itemText += `\n   Description: ${description}`;
      const memo = clampPromptText(experience.memo, 240);
      if (memo) itemText += `\n   Memo: ${memo}`;
      lines.push(itemText);
    });
  }

  if (educations.length > 0) {
    lines.push("Educations");
    educations.slice(0, 5).forEach((education, index) => {
      const parts = [
        `School: ${education.school ?? "(unknown)"}`,
        `Degree: ${education.degree ?? "(unknown)"}`,
      ];
      if (education.field) parts.push(`Field: ${education.field}`);
      const dateRange = formatPromptDateRange(
        education.start_date,
        education.end_date
      );
      if (dateRange) parts.push(`Dates: ${dateRange}`);

      let itemText = `${index + 1}. ${parts.join(", ")}`;
      const memo = clampPromptText(education.memo, 240);
      if (memo) itemText += `\n   Memo: ${memo}`;
      lines.push(itemText);
    });
  }

  const resumeText = clampPromptText(candidate.resume_text, 4000);
  if (resumeText) {
    lines.push("Resume Text Snippet");
    lines.push(resumeText);
  }

  return lines.join("\n");
}

function buildRecommendationRoleContext(args: {
  opportunityType: OpportunityType;
  role: RecommendationDraftRoleRow;
}) {
  const { opportunityType, role } = args;
  const workspace = role.company_workspace;
  const lines: string[] = [];

  lines.push("Role");
  lines.push(`- Opportunity Type: ${OPPORTUNITY_TYPE_LABEL[opportunityType]}`);
  lines.push(`- Role: ${role.name ?? "(unknown)"}`);
  lines.push(`- Company: ${workspace?.company_name ?? "(unknown)"}`);
  lines.push(`- Source: ${normalizeOpportunitySourceType(role.source_type)}`);
  lines.push(`- Status: ${normalizeOpportunityStatus(role.status)}`);

  if (role.location_text) lines.push(`- Location: ${role.location_text}`);
  if (role.work_mode) {
    lines.push(
      `- Work Mode: ${normalizeOpportunityWorkMode(role.work_mode) ?? role.work_mode}`
    );
  }
  if (Array.isArray(role.type) && role.type.length > 0) {
    lines.push(`- Employment Types: ${role.type.join(", ")}`);
  }
  if (role.posted_at) lines.push(`- Posted At: ${role.posted_at}`);
  if (role.expires_at) lines.push(`- Expires At: ${role.expires_at}`);
  if (role.source_provider) {
    lines.push(`- Source Provider: ${role.source_provider}`);
  }
  if (role.source_job_id) lines.push(`- Source Job ID: ${role.source_job_id}`);
  if (role.external_jd_url) {
    lines.push(`- External JD URL: ${role.external_jd_url}`);
  }
  if (workspace?.homepage_url) {
    lines.push(`- Company Homepage: ${workspace.homepage_url}`);
  }
  if (workspace?.linkedin_url) {
    lines.push(`- Company LinkedIn: ${workspace.linkedin_url}`);
  }

  const description = clampPromptText(role.description, 4000);
  if (description) {
    lines.push("Role Description");
    lines.push(description);
  }

  const companyDescription = clampPromptText(
    workspace?.company_description,
    2000
  );
  if (companyDescription) {
    lines.push("Company Description");
    lines.push(companyDescription);
  }

  return lines.join("\n");
}

async function resolveCompanyDbRecord(args: {
  admin: AdminClient;
  companyName?: string | null;
  linkedinUrl?: string | null;
}) {
  const { match: linkedinMatch, normalizedLinkedinUrl, rawLinkedinUrl } =
    await findCompanyDbByLinkedinUrl({
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
    throw new Error("company_db에서 해당 LinkedIn 회사 정보를 찾지 못했습니다.");
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
    linkedinUrl: args.row.linkedin_url ?? null,
    logoStoragePath: args.row.logo_storage_path ?? null,
    logoUrl: args.row.logo_url ?? null,
    totalRoleCount: args.totalRoleCount,
    updatedAt: String(args.row.updated_at ?? args.row.created_at ?? ""),
  };
}

function mapRoleRecord(args: {
  companyName: string;
  matchedCandidateCount: number;
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
    matchedCandidateCount: args.matchedCandidateCount,
    name: String(args.row.name ?? ""),
    postedAt: args.row.posted_at ?? null,
    roleId: String(args.row.role_id ?? ""),
    sourceJobId: args.row.source_job_id ?? null,
    sourceProvider: args.row.source_provider ?? null,
    sourceType: normalizeOpportunitySourceType(args.row.source_type),
    status: normalizeOpportunityStatus(args.row.status),
    updatedAt: String(args.row.updated_at ?? args.row.created_at ?? ""),
    workMode: normalizeOpportunityWorkMode(args.row.work_mode),
  };
}

async function fetchMatchedCandidateCountByRoleId(
  admin: AdminClient,
  roleIds: string[]
) {
  const counts = new Map<string, number>();
  if (roleIds.length === 0) return counts;

  const { data, error } = await (
    admin.from("company_role_matched" as any) as any
  )
    .select("role_id")
    .in("role_id", roleIds);

  if (error) {
    throw new Error(error.message ?? "Failed to load match counts");
  }

  for (const row of coerceJsonArray<{ role_id?: string | null }>(data)) {
    const roleId = String(row.role_id ?? "").trim();
    if (!roleId) continue;
    counts.set(roleId, (counts.get(roleId) ?? 0) + 1);
  }

  return counts;
}

export async function fetchOpsOpportunityCatalog(): Promise<OpsOpportunityCatalogResponse> {
  const admin = getSupabaseAdmin();
  const [workspaceResponse, roleResponse] = await Promise.all([
    (admin.from("company_workspace" as any) as any)
      .select(
        "company_workspace_id, company_name, homepage_url, career_url, linkedin_url, logo_url, logo_storage_path, company_description, company_db_id, created_at, updated_at"
      )
      .order("updated_at", { ascending: false }) as any,
    (admin.from("company_roles" as any) as any)
      .select(
        "role_id, company_workspace_id, name, external_jd_url, description, description_summary, information, type, status, created_at, updated_at, source_type, source_provider, source_job_id, posted_at, expires_at, location_text, work_mode"
      )
      .order("updated_at", { ascending: false }) as any,
  ]);

  const workspaceError = (workspaceResponse as { error?: { message?: string } })
    .error;
  if (workspaceError) {
    throw new Error(workspaceError.message ?? "Failed to load companies");
  }

  const roleError = (roleResponse as { error?: { message?: string } }).error;
  if (roleError) {
    throw new Error(roleError.message ?? "Failed to load roles");
  }

  const workspaceRows = coerceJsonArray<WorkspaceRow>(
    (workspaceResponse as { data?: unknown }).data
  );
  const roleRows = coerceJsonArray<RoleRow>(
    (roleResponse as { data?: unknown }).data
  );
  const roleIds = roleRows
    .map((row) => String(row.role_id ?? ""))
    .filter(Boolean);
  const matchedCandidateCountByRoleId =
    await fetchMatchedCandidateCountByRoleId(admin, roleIds);
  const workspaceById = new Map(
    workspaceRows.map(
      (row) => [String(row.company_workspace_id ?? ""), row] as const
    )
  );
  const roleStatsByWorkspaceId = new Map<
    string,
    { active: number; external: number; internal: number; total: number }
  >();

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

  return {
    roles: roleRows
      .map((row) =>
        mapRoleRecord({
          companyName:
            workspaceById.get(String(row.company_workspace_id ?? ""))
              ?.company_name ?? "",
          matchedCandidateCount:
            matchedCandidateCountByRoleId.get(String(row.role_id ?? "")) ?? 0,
          row,
        })
      )
      .filter((row) => row.companyWorkspaceId),
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
        row,
        totalRoleCount: stats.total,
      });
    }),
  };
}

export async function saveOpsOpportunityWorkspace(args: {
  careerUrl?: string | null;
  companyDescription?: string | null;
  companyName: string;
  homepageUrl?: string | null;
  linkedinUrl?: string | null;
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
    linkedin_url: companyDbRecord.linkedinUrl,
    logo_storage_path: null,
    logo_url: companyDbRecord.logoUrl,
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
      "company_workspace_id, company_name, homepage_url, career_url, linkedin_url, logo_url, logo_storage_path, company_description, company_db_id, created_at, updated_at"
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
    information: null,
    location_text: String(args.locationText ?? "").trim() || null,
    name: ensureNonEmptyString(args.name, "name"),
    posted_at: parseDateString(args.postedAt, "postedAt"),
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
      "role_id, company_workspace_id, name, external_jd_url, description, description_summary, information, type, status, created_at, updated_at, source_type, source_provider, source_job_id, posted_at, expires_at, location_text, work_mode"
    )
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to save role");
  }

  const savedRole = data as RoleRow;
  const matchedCounts = await fetchMatchedCandidateCountByRoleId(admin, [
    String(savedRole.role_id ?? ""),
  ]);

  return mapRoleRecord({
    companyName: String(
      (workspaceData as { company_name?: string }).company_name ?? ""
    ),
    matchedCandidateCount:
      matchedCounts.get(String(savedRole.role_id ?? "")) ?? 0,
    row: savedRole,
  });
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
    "career_url" | "company_description" | "company_name" | "company_workspace_id"
  >;
  const careerUrl = normalizeCareerUrl(
    String(args.careerUrl ?? "").trim() || String(workspace.career_url ?? "").trim()
  );

  if (!careerUrl) {
    throw new Error("career url이 필요합니다. 회사 정보에 먼저 저장해 주세요.");
  }

  const provider = detectExternalRoleProvider(careerUrl);
  if (!provider) {
    throw new Error("현재는 Lever 또는 LinkedIn Jobs career url만 sync할 수 있습니다.");
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
      information: null,
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

    const { error: insertError } = await (admin.from("company_roles" as any) as any)
      .insert(payload)
      .select("role_id");

    if (insertError) {
      throw new Error(insertError.message ?? "Failed to insert synced roles");
    }
  }

  return {
    deletedCount: coerceJsonArray<{ role_id?: string | null }>(deletedRows).length,
    insertedCount: summarizedRoles.length,
    provider,
    workspaceId,
  };
}

export async function searchOpsOpportunityCandidates(args: {
  limit?: number;
  query?: string | null;
  roleId?: string | null;
}): Promise<OpsOpportunityCandidateSearchResponse> {
  const admin = getSupabaseAdmin();
  const query = String(args.query ?? "").trim();
  if (!query) {
    return { items: [], query };
  }

  const limit = Math.max(1, Math.min(Number(args.limit ?? 20) || 20, 40));
  const safeQuery = query.replace(/[%(),]/g, " ").trim();
  const pattern = `%${safeQuery}%`;

  const { data, error } = await (admin.from("talent_users" as any) as any)
    .select(
      "user_id, name, headline, location, profile_picture, email, bio, resume_text, resume_links, career_profile, network_application, updated_at"
    )
    .or(
      [
        `name.ilike.${pattern}`,
        `headline.ilike.${pattern}`,
        `location.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `bio.ilike.${pattern}`,
        `resume_text.ilike.${pattern}`,
      ].join(",")
    )
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message ?? "Failed to search talents");
  }

  const rows = coerceJsonArray<CandidateRow>(data);
  const linkedinProfileIdByTalentId = new Map<string, string>();
  const linkedinUrlByTalentId = new Map<string, string>();

  for (const row of rows) {
    const talentId = String(row.user_id ?? "").trim();
    if (!talentId) continue;
    const linkedinUrl = findTalentLinkedinUrl(row);
    if (!linkedinUrl) continue;
    linkedinUrlByTalentId.set(talentId, linkedinUrl);
    const linkedinProfileId = extractLinkedinProfileId(linkedinUrl);
    if (!linkedinProfileId) continue;
    linkedinProfileIdByTalentId.set(talentId, linkedinProfileId);
  }

  const candidateIdByLinkedinProfileId =
    await resolveCandidateIdByLinkedinProfileIds(
      admin,
      Array.from(linkedinProfileIdByTalentId.values())
    );

  const roleId = String(args.roleId ?? "").trim();
  const matchedIds = new Set<string>();

  if (roleId && rows.length > 0) {
    const candidateIds = rows
      .map((row) => {
        const talentId = String(row.user_id ?? "").trim();
        const linkedinProfileId = linkedinProfileIdByTalentId.get(talentId);
        if (!linkedinProfileId) return "";
        return (
          candidateIdByLinkedinProfileId.get(linkedinProfileId) ?? ""
        ).trim();
      })
      .filter(Boolean);

    if (candidateIds.length > 0) {
      const { data: matchData, error: matchError } = await (
        admin.from("company_role_matched" as any) as any
      )
        .select("candid_id")
        .eq("role_id", roleId)
        .in("candid_id", candidateIds);

      if (matchError) {
        throw new Error(
          matchError.message ?? "Failed to load existing matches"
        );
      }

      for (const row of coerceJsonArray<{ candid_id?: string | null }>(
        matchData
      )) {
        const candidId = String(row.candid_id ?? "").trim();
        if (!candidId) continue;
        matchedIds.add(candidId);
      }
    }
  }

  return {
    items: rows.map((row) => ({
      candidId:
        candidateIdByLinkedinProfileId.get(
          linkedinProfileIdByTalentId.get(String(row.user_id ?? "").trim()) ??
            ""
        ) ?? null,
      email: row.email ?? null,
      headline: row.headline ?? null,
      linkedinUrl:
        linkedinUrlByTalentId.get(String(row.user_id ?? "").trim()) ?? null,
      location: row.location ?? null,
      matched: matchedIds.has(
        candidateIdByLinkedinProfileId.get(
          linkedinProfileIdByTalentId.get(String(row.user_id ?? "").trim()) ??
            ""
        ) ?? ""
      ),
      name: row.name ?? null,
      profilePicture: row.profile_picture ?? null,
      summary: row.bio ?? row.resume_text ?? null,
      talentId: String(row.user_id ?? ""),
      totalExpMonths: null,
    })),
    query,
  };
}

export async function fetchOpsOpportunityCandidateContact(args: {
  talentId: string;
}) {
  const admin = getSupabaseAdmin();
  const talentId = ensureNonEmptyString(args.talentId, "talentId");

  const { data, error } = await ((admin.from("talent_users" as any) as any)
    .select("user_id, name, email")
    .eq("user_id", talentId)
    .maybeSingle() as any);

  if (error) {
    throw new Error(error.message ?? "Failed to load candidate contact");
  }

  const email = String(data?.email ?? "")
    .trim()
    .toLowerCase();
  if (!email) {
    throw new Error("이 talent에는 등록된 이메일이 없습니다.");
  }

  return {
    email,
    name: typeof data?.name === "string" ? data.name : null,
    talentId,
  };
}

async function fetchRoleLookupByIds(admin: AdminClient, roleIds: string[]) {
  if (roleIds.length === 0) return new Map<string, OpsOpportunityRoleRecord>();

  const { data, error } = await (admin.from("company_roles" as any) as any)
    .select(
      "role_id, company_workspace_id, name, external_jd_url, description, description_summary, information, type, status, created_at, updated_at, source_type, source_provider, source_job_id, posted_at, expires_at, location_text, work_mode"
    )
    .in("role_id", roleIds);

  if (error) {
    throw new Error(error.message ?? "Failed to load roles");
  }

  const roleRows = coerceJsonArray<RoleRow>(data);
  const workspaceIds = Array.from(
    new Set(
      roleRows
        .map((row) => String(row.company_workspace_id ?? ""))
        .filter(Boolean)
    )
  );
  const { data: workspaceData, error: workspaceError } = await (
    admin.from("company_workspace" as any) as any
  )
    .select("company_workspace_id, company_name")
    .in("company_workspace_id", workspaceIds);

  if (workspaceError) {
    throw new Error(workspaceError.message ?? "Failed to load companies");
  }

  const workspaceNameById = new Map(
    coerceJsonArray<{
      company_name?: string | null;
      company_workspace_id?: string | null;
    }>(workspaceData).map((row) => [
      String(row.company_workspace_id ?? ""),
      String(row.company_name ?? ""),
    ])
  );

  const counts = await fetchMatchedCandidateCountByRoleId(admin, roleIds);

  return new Map(
    roleRows.map((row) => [
      String(row.role_id ?? ""),
      mapRoleRecord({
        companyName:
          workspaceNameById.get(String(row.company_workspace_id ?? "")) ?? "",
        matchedCandidateCount: counts.get(String(row.role_id ?? "")) ?? 0,
        row,
      }),
    ])
  );
}

async function fetchRoleNotificationContext(args: {
  admin: AdminClient;
  roleId: string;
}) {
  const { data, error } = await ((args.admin.from("company_roles" as any) as any)
    .select(
      `
        role_id,
        name,
        company_workspace:company_workspace (
          company_name
        )
      `
    )
    .eq("role_id", args.roleId)
    .maybeSingle() as any);

  if (error) {
    throw new Error(error.message ?? "Failed to load role notification context");
  }

  const roleName = String(data?.name ?? "").trim();
  const companyName = String(data?.company_workspace?.company_name ?? "").trim();

  if (!roleName || !companyName) {
    throw new Error("Failed to load role notification context");
  }

  return {
    companyName,
    roleName,
  };
}

export async function fetchOpsOpportunityMatches(args: {
  candidId?: string | null;
  roleId?: string | null;
}): Promise<OpsOpportunityMatchListResponse> {
  const admin = getSupabaseAdmin();
  const roleId = String(args.roleId ?? "").trim();
  const candidId = String(args.candidId ?? "").trim();

  let query = (admin.from("company_role_matched" as any) as any)
    .select(
      `
        id,
        candid_id,
        role_id,
        harper_memo,
        status,
        created_at,
        updated_at,
        candid:candid (
          id,
          name,
          headline,
          location,
          linkedin_url,
          profile_picture
        )
      `
    )
    .order("updated_at", { ascending: false }) as any;

  if (roleId) {
    query = query.eq("role_id", roleId);
  }
  if (candidId) {
    query = query.eq("candid_id", candidId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message ?? "Failed to load matches");
  }

  const rows = coerceJsonArray<MatchRow>(data);
  const roleLookup = await fetchRoleLookupByIds(
    admin,
    Array.from(
      new Set(rows.map((row) => String(row.role_id ?? "")).filter(Boolean))
    )
  );

  return {
    items: rows.map((row) => {
      const role = roleLookup.get(String(row.role_id ?? ""));

      return {
        candidateHeadline: row.candid?.headline ?? null,
        candidateId: String(row.candid_id ?? ""),
        candidateLinkedinUrl: row.candid?.linkedin_url ?? null,
        candidateLocation: row.candid?.location ?? null,
        candidateName: row.candid?.name ?? null,
        candidateProfilePicture: row.candid?.profile_picture ?? null,
        companyName: role?.companyName ?? "",
        createdAt: String(row.created_at ?? ""),
        harperMemo: row.harper_memo ?? null,
        matchId: String(row.id ?? ""),
        roleId: String(row.role_id ?? ""),
        roleName: role?.name ?? "",
        status: String(row.status ?? "pending"),
        updatedAt: String(row.updated_at ?? row.created_at ?? ""),
      };
    }),
  };
}

export async function saveOpsOpportunityMatch(args: {
  candidId: string;
  harperMemo?: string | null;
  roleId: string;
}) {
  const admin = getSupabaseAdmin();
  const candidId = ensureNonEmptyString(args.candidId, "candidId");
  const roleId = ensureNonEmptyString(args.roleId, "roleId");
  const now = new Date().toISOString();

  const { error } = await (
    admin.from("company_role_matched" as any) as any
  ).upsert(
    {
      candid_id: candidId,
      harper_memo: String(args.harperMemo ?? "").trim() || null,
      role_id: roleId,
      status: "pending",
      updated_at: now,
    },
    {
      onConflict: "candid_id,role_id",
    }
  );

  if (error) {
    throw new Error(error.message ?? "Failed to save match");
  }

  return fetchOpsOpportunityMatches({ roleId });
}

export async function deleteOpsOpportunityMatch(args: {
  candidId: string;
  roleId: string;
}) {
  const admin = getSupabaseAdmin();
  const candidId = ensureNonEmptyString(args.candidId, "candidId");
  const roleId = ensureNonEmptyString(args.roleId, "roleId");

  const { error } = await (admin.from("company_role_matched" as any) as any)
    .delete()
    .eq("candid_id", candidId)
    .eq("role_id", roleId);

  if (error) {
    throw new Error(error.message ?? "Failed to delete match");
  }

  return { ok: true };
}

export async function fetchOpsOpportunityRecommendations(args: {
  roleId?: string | null;
  talentId?: string | null;
}): Promise<OpsOpportunityRecommendationListResponse> {
  const admin = getSupabaseAdmin();
  const roleId = String(args.roleId ?? "").trim();
  const talentId = String(args.talentId ?? "").trim();

  let query = (admin.from("talent_opportunity_recommendation" as any) as any)
    .select(
      `
        id,
        talent_id,
        role_id,
        kind,
        opportunity_type,
        recommendation_reasons,
        feedback,
        saved_stage,
        recommended_at,
        created_at,
        updated_at,
        company_role:company_roles (
          role_id,
          name,
          location_text,
          external_jd_url,
          posted_at,
          source_type,
          company_workspace:company_workspace (
            company_name
          )
        )
      `
    )
    .order("recommended_at", { ascending: false }) as any;

  if (roleId) {
    query = query.eq("role_id", roleId);
  }
  if (talentId) {
    query = query.eq("talent_id", talentId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message ?? "Failed to load recommendations");
  }

  return {
    items: coerceJsonArray<RecommendationRow>(data)
      .map(mapRecommendationRecord)
      .filter(
        (item): item is OpsOpportunityRecommendationRecord => item !== null
      ),
  };
}

export async function saveOpsOpportunityRecommendation(args: {
  opportunityType: OpportunityType;
  recommendationMemo?: string | null;
  roleId: string;
  talentId: string;
}) {
  const admin = getSupabaseAdmin();
  const talentId = ensureNonEmptyString(args.talentId, "talentId");
  const roleId = ensureNonEmptyString(args.roleId, "roleId");
  const now = new Date().toISOString();
  const recommendationMemo =
    String(args.recommendationMemo ?? "").trim() || null;
  const opportunityType = normalizeOpportunityType(args.opportunityType);
  const kind =
    opportunityType === OpportunityType.IntroRequest
      ? "match"
      : "recommendation";
  const role = await fetchRoleNotificationContext({ admin, roleId });

  const notificationMessage = buildOpportunityRecommendationNotificationMessage({
    companyName: role.companyName,
    opportunityType,
    roleName: role.roleName,
  });

  const { data, error } = await (
    admin.from("talent_opportunity_recommendation" as any) as any
  )
    .insert({
      kind,
      opportunity_type: opportunityType,
      recommendation_reasons: buildRecommendationReasons(recommendationMemo),
      recommended_at: now,
      role_id: roleId,
      talent_id: talentId,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to save recommendation");
  }

  const recommendationId = String(data?.id ?? "").trim();

  try {
    await insertTalentOpportunityNotification({
      admin,
      message: notificationMessage,
      talentId,
    });
  } catch (notificationError) {
    if (recommendationId) {
      await (admin.from("talent_opportunity_recommendation" as any) as any)
        .delete()
        .eq("id", recommendationId);
    }

    throw notificationError;
  }

  return fetchOpsOpportunityRecommendations({ talentId });
}

export async function generateOpsOpportunityRecommendationDraft(args: {
  opportunityType: OpportunityType;
  promptTemplate?: string | null;
  roleId: string;
  talentId: string;
}) {
  const admin = getSupabaseAdmin();
  const talentId = ensureNonEmptyString(args.talentId, "talentId");
  const roleId = ensureNonEmptyString(args.roleId, "roleId");
  const opportunityType = normalizeOpportunityType(args.opportunityType);
  const promptTemplate =
    String(args.promptTemplate ?? "").trim() ||
    DEFAULT_OPS_TALENT_RECOMMENDATION_PROMPT;

  const [
    candidateResponse,
    roleResponse,
    experienceResponse,
    educationResponse,
  ] = await Promise.all([
    ((admin.from("talent_users" as any) as any)
      .select(
        "user_id, name, headline, location, profile_picture, email, bio, resume_text, resume_links, career_profile, network_application, updated_at"
      )
      .eq("user_id", talentId)
      .maybeSingle() as any),
    ((admin.from("company_roles" as any) as any)
      .select(
        `
          role_id,
          name,
          description,
          external_jd_url,
          source_type,
          source_provider,
          source_job_id,
          posted_at,
          expires_at,
          location_text,
          work_mode,
          status,
          type,
          company_workspace:company_workspace (
            company_name,
            company_description,
            homepage_url,
            linkedin_url
          )
        `
      )
      .eq("role_id", roleId)
      .maybeSingle() as any),
    ((admin.from("talent_experiences" as any) as any)
      .select(
        "role, description, start_date, end_date, months, company_name, company_location, memo"
      )
      .eq("talent_id", talentId)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false }) as any),
    ((admin.from("talent_educations" as any) as any)
      .select("school, degree, field, start_date, end_date, memo")
      .eq("talent_id", talentId)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false }) as any),
  ]);

  if (candidateResponse.error) {
    throw new Error(candidateResponse.error.message ?? "Failed to load talent");
  }
  if (roleResponse.error) {
    throw new Error(roleResponse.error.message ?? "Failed to load role");
  }
  if (experienceResponse.error) {
    throw new Error(
      experienceResponse.error.message ?? "Failed to load talent experiences"
    );
  }
  if (educationResponse.error) {
    throw new Error(
      educationResponse.error.message ?? "Failed to load talent educations"
    );
  }

  const candidate = (candidateResponse.data ?? null) as CandidateRow | null;
  const role = (roleResponse.data ?? null) as RecommendationDraftRoleRow | null;
  const experiences = coerceJsonArray<TalentExperiencePromptRow>(
    experienceResponse.data
  );
  const educations = coerceJsonArray<TalentEducationPromptRow>(
    educationResponse.data
  );

  if (!candidate) {
    throw new Error("추천할 후보자 프로필을 찾지 못했습니다.");
  }
  if (!role?.company_workspace) {
    throw new Error("추천할 role 정보를 찾지 못했습니다.");
  }

  const renderedPrompt = renderOpsTalentRecommendationPrompt(promptTemplate, {
    opportunity_type_label: OPPORTUNITY_TYPE_LABEL[opportunityType],
    candidate_name: String(candidate.name ?? "").trim() || "Unknown Candidate",
    company_name:
      String(role.company_workspace.company_name ?? "").trim() ||
      "Unknown Company",
    role_name: String(role.name ?? "").trim() || "Unknown Role",
    candidate_profile: buildRecommendationTalentProfileContext({
      candidate,
      educations,
      experiences,
    }),
    role_summary: buildRecommendationRoleContext({
      opportunityType,
      role,
    }),
  });

  const response = await runTalentAssistantCompletion({
    messages: [
      {
        role: "system",
        content: renderedPrompt,
      },
      {
        role: "user",
        content:
          "후보자에게 전달할 추천 메모를 작성해줘. 각 추천 포인트는 줄바꿈으로 구분해.",
      },
    ],
    temperature: 0.35,
  });

  const draft = splitRecommendationMemoIntoReasons(response).join("\n");
  if (!draft) {
    throw new Error("추천 메모를 생성하지 못했습니다.");
  }

  return {
    draft,
  };
}

export async function deleteOpsOpportunityRecommendation(args: {
  recommendationId: string;
}) {
  const admin = getSupabaseAdmin();
  const recommendationId = ensureNonEmptyString(
    args.recommendationId,
    "recommendationId"
  );

  const { error } = await (
    admin.from("talent_opportunity_recommendation" as any) as any
  )
    .delete()
    .eq("id", recommendationId);

  if (error) {
    throw new Error(error.message ?? "Failed to delete recommendation");
  }

  return { ok: true };
}
