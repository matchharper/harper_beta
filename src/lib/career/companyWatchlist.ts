import type { Json } from "@/types/database.types";
import {
  buildTalentProfileContext,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/server";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import { insertTalentActivityEvent } from "@/lib/talentOnboarding/activityEvents";
import { getTalentCareerMoveIntentLabel } from "@/lib/talentNetworkOptions";

if (typeof window !== "undefined") {
  throw new Error("companyWatchlist must not run in the browser");
}

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

export type TalentCompanyWatchlistTab = "recommended" | "following" | "signals";

export type TalentCompanyRecommendationRow = {
  active_role_count: number;
  clicked_at: string | null;
  company_db_id: number;
  company_workspace_id: string | null;
  conversation_id: string | null;
  created_at: string;
  dismissed_at: string | null;
  id: string;
  latest_signal: string | null;
  next_signal: string | null;
  rank: number | null;
  reason_summary: string | null;
  recommendation_reasons: Json;
  recommended_at: string;
  score: number | null;
  signal_summary: string | null;
  source: string;
  talent_id: string;
  updated_at: string;
  viewed_at: string | null;
};

export type TalentCompanyFollowRow = {
  company_db_id: number;
  company_workspace_id: string | null;
  conversation_id: string | null;
  created_at: string;
  discovery_channel_summary: string | null;
  followed_at: string;
  id: string;
  source: string;
  talent_id: string;
  tracking_summary: string | null;
  unfollowed_at: string | null;
  updated_at: string;
};

type CompanyDbRow = {
  crunchbase_information: Json | null;
  description: string | null;
  employee_count_range: Json | null;
  founded_year: number | null;
  funding: Json | null;
  funding_url: string | null;
  id: number;
  investors: string | null;
  last_crunchbase_updated_at: string | null;
  last_updated_at: string;
  linkedin_url: string | null;
  location: string | null;
  logo: string | null;
  name: string | null;
  related_links: string[] | null;
  short_description: string | null;
  specialities: string | null;
  website_url: string | null;
};

type CompanyWorkspaceRow = {
  brief: string | null;
  career_url: string | null;
  company_db_id: number | null;
  company_description: string | null;
  company_name: string;
  company_workspace_id: string;
  homepage_url: string | null;
  is_internal: boolean;
  linkedin_url: string | null;
  logo_url: string | null;
  pitch: string | null;
  request: string | null;
  test_score: number;
  updated_at: string;
};

type CompanyRoleRow = {
  company_workspace_id: string;
  created_at: string;
  description: string | null;
  description_summary: string | null;
  external_jd_url: string | null;
  location_text: string | null;
  name: string;
  posted_at: string | null;
  role_id: string;
  type: string[] | null;
  updated_at: string;
  work_mode: string | null;
};

export type TalentCompanyRolePreview = {
  externalJdUrl: string | null;
  location: string | null;
  name: string;
  postedAt: string | null;
  roleId: string;
  type: string[];
  workMode: string | null;
};

export type TalentCompanyWatchlistItem = {
  activeRoleCount: number;
  careerUrl: string | null;
  companyDbId: number;
  companyWorkspaceId: string | null;
  crunchbaseInformation: Json | null;
  description: string | null;
  discoveryChannelSummary: string | null;
  employeeCountRange: Json | null;
  followedAt: string | null;
  following: boolean;
  foundedYear: number | null;
  funding: Json | null;
  fundingUrl: string | null;
  homepageUrl: string | null;
  id: string;
  investors: string | null;
  lastCrunchbaseUpdatedAt: string | null;
  lastUpdatedAt: string | null;
  latestRolePostedAt: string | null;
  latestSignal: string | null;
  linkedinUrl: string | null;
  location: string | null;
  logoUrl: string | null;
  name: string;
  nextSignal: string | null;
  rank: number | null;
  reasonSummary: string | null;
  recommendationId: string | null;
  recommendationReasons: string[];
  recommendedAt: string | null;
  relatedLinks: string[];
  rolePreviews: TalentCompanyRolePreview[];
  shortDescription: string | null;
  signalSummary: string | null;
  specialities: string[];
  trackingSummary: string | null;
  websiteUrl: string | null;
};

export type TalentCompanyWatchlistPage = {
  count: number;
  items: TalentCompanyWatchlistItem[];
  limit: number;
  nextOffset: number | null;
  offset: number;
  tab: TalentCompanyWatchlistTab;
};

type ActiveRoleStats = {
  count: number;
  latestRolePostedAt: string | null;
  previews: TalentCompanyRolePreview[];
};

const DEFAULT_COMPANY_PAGE_SIZE = 12;
const MAX_COMPANY_PAGE_SIZE = 50;
const COMPANY_RECOMMENDATION_CANDIDATE_LIMIT = 320;
const COMPANY_RECOMMENDATION_LLM_LIMIT = 32;
const DEFAULT_GENERATED_COMPANY_COUNT = 24;
const COMPANY_RECOMMENDATION_CACHE_TTL_MS = 18 * 60 * 60 * 1000;
const MIN_FRESH_COMPANY_RECOMMENDATION_COUNT = 8;
const COMPANY_RECOMMENDATION_PROFILE_CONTEXT_LIMIT = 3600;
const COMPANY_RECOMMENDATION_CARD_DESCRIPTION_LIMIT = 650;

const COMPANY_DB_SELECT =
  "id, name, logo, website_url, linkedin_url, funding_url, short_description, description, specialities, location, investors, funding, employee_count_range, founded_year, related_links, crunchbase_information, last_crunchbase_updated_at, last_updated_at";

const COMPANY_WORKSPACE_SELECT =
  "company_workspace_id, company_name, company_description, homepage_url, career_url, linkedin_url, logo_url, company_db_id, brief, pitch, request, is_internal, test_score, updated_at";

function clampPageLimit(value: unknown) {
  const parsed = Number(value ?? DEFAULT_COMPANY_PAGE_SIZE);
  if (!Number.isFinite(parsed)) return DEFAULT_COMPANY_PAGE_SIZE;
  return Math.max(1, Math.min(Math.floor(parsed), MAX_COMPANY_PAGE_SIZE));
}

export function parseCompanyWatchlistTab(
  value: string | null | undefined
): TalentCompanyWatchlistTab {
  if (value === "following" || value === "signals") return value;
  return "recommended";
}

function cleanText(value: unknown, maxLength = 4000) {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text ? text.slice(0, maxLength) : "";
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidText(value: unknown) {
  return UUID_PATTERN.test(cleanText(value, 80));
}

function uniqueUuidList(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map((value) => cleanText(value, 80))
        .filter((value) => UUID_PATTERN.test(value))
    )
  );
}

function coerceArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toStringList(value: unknown, limit = 8) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => cleanText(entry, 240))
      .filter(Boolean)
      .slice(0, limit);
  }
  if (typeof value === "string") {
    return value
      .split(/[,/·|]+/g)
      .map((entry) => cleanText(entry, 240))
      .filter(Boolean)
      .slice(0, limit);
  }
  return [];
}

function normalizeRecommendationReasons(value: Json | null | undefined) {
  return toStringList(value, 5);
}

function latestTime(values: Array<string | null | undefined>) {
  const timestamps = values
    .map((value) => {
      if (!value) return null;
      const time = Date.parse(value);
      return Number.isFinite(time) ? { time, value } : null;
    })
    .filter((entry): entry is { time: number; value: string } => !!entry)
    .sort((left, right) => right.time - left.time);
  return timestamps[0]?.value ?? null;
}

function isFreshTimestamp(value: string | null | undefined, ttlMs: number) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= ttlMs;
}

function getCompanyDisplayName(args: {
  companyDb?: CompanyDbRow | null;
  workspace?: CompanyWorkspaceRow | null;
}) {
  return (
    cleanText(args.companyDb?.name, 160) ||
    cleanText(args.workspace?.company_name, 160) ||
    "Company"
  );
}

function getCompanyLogoUrl(args: {
  companyDb?: CompanyDbRow | null;
  workspace?: CompanyWorkspaceRow | null;
}) {
  return args.companyDb?.logo ?? args.workspace?.logo_url ?? null;
}

function getCompanyShortDescription(args: {
  companyDb?: CompanyDbRow | null;
  workspace?: CompanyWorkspaceRow | null;
}) {
  return (
    cleanText(args.companyDb?.short_description, 500) ||
    cleanText(args.workspace?.brief, 500) ||
    cleanText(args.workspace?.pitch, 500) ||
    null
  );
}

function getCompanyDescription(args: {
  companyDb?: CompanyDbRow | null;
  workspace?: CompanyWorkspaceRow | null;
}) {
  return (
    cleanText(args.workspace?.company_description, 4000) ||
    cleanText(args.companyDb?.description, 4000) ||
    getCompanyShortDescription(args)
  );
}

function getCompanyLinkedinUrl(args: {
  companyDb?: CompanyDbRow | null;
  workspace?: CompanyWorkspaceRow | null;
}) {
  return args.companyDb?.linkedin_url ?? args.workspace?.linkedin_url ?? null;
}

async function fetchCompanyDbMap(admin: AdminClient, companyDbIds: number[]) {
  const ids = Array.from(new Set(companyDbIds.filter(Number.isFinite)));
  if (ids.length === 0) return new Map<number, CompanyDbRow>();

  const { data, error } = await (admin.from("company_db" as any) as any)
    .select(COMPANY_DB_SELECT)
    .in("id", ids);

  if (error) {
    throw new Error(error.message ?? "Failed to load company_db records");
  }

  return new Map(
    coerceArray<CompanyDbRow>(data).map((row) => [Number(row.id), row])
  );
}

async function fetchWorkspaceMapByIds(
  admin: AdminClient,
  workspaceIds: string[]
) {
  const ids = uniqueUuidList(workspaceIds);
  if (ids.length === 0) return new Map<string, CompanyWorkspaceRow>();

  const { data, error } = await (admin.from("company_workspace" as any) as any)
    .select(COMPANY_WORKSPACE_SELECT)
    .in("company_workspace_id", ids);

  if (error) {
    throw new Error(error.message ?? "Failed to load company workspaces");
  }

  return new Map(
    coerceArray<CompanyWorkspaceRow>(data).map((row) => [
      String(row.company_workspace_id),
      row,
    ])
  );
}

async function fetchBestWorkspaceByCompanyDbIds(
  admin: AdminClient,
  companyDbIds: number[]
) {
  const ids = Array.from(new Set(companyDbIds.filter(Number.isFinite)));
  if (ids.length === 0) return new Map<number, CompanyWorkspaceRow>();

  const { data, error } = await (admin.from("company_workspace" as any) as any)
    .select(COMPANY_WORKSPACE_SELECT)
    .in("company_db_id", ids)
    .order("test_score", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(Math.max(ids.length * 4, 20));

  if (error) {
    throw new Error(error.message ?? "Failed to load company workspaces");
  }

  const byCompanyDbId = new Map<number, CompanyWorkspaceRow>();
  for (const row of coerceArray<CompanyWorkspaceRow>(data)) {
    const companyDbId = Number(row.company_db_id);
    if (!Number.isFinite(companyDbId) || byCompanyDbId.has(companyDbId)) {
      continue;
    }
    byCompanyDbId.set(companyDbId, row);
  }

  return byCompanyDbId;
}

async function fetchActiveRoleStatsByCompanyDbIds(
  admin: AdminClient,
  companyDbIds: number[]
): Promise<Map<number, ActiveRoleStats>> {
  const ids = Array.from(new Set(companyDbIds.filter(Number.isFinite)));
  const empty = new Map<number, ActiveRoleStats>();
  if (ids.length === 0) return empty;

  const { data: workspaceData, error: workspaceError } = await (
    admin.from("company_workspace" as any) as any
  )
    .select("company_workspace_id, company_db_id")
    .in("company_db_id", ids);

  if (workspaceError) {
    throw new Error(workspaceError.message ?? "Failed to load workspaces");
  }

  const workspaceToCompanyDbId = new Map<string, number>();
  for (const row of coerceArray<{
    company_db_id?: number | null;
    company_workspace_id?: string | null;
  }>(workspaceData)) {
    const workspaceId = cleanText(row.company_workspace_id);
    const companyDbId = Number(row.company_db_id);
    if (!isUuidText(workspaceId) || !Number.isFinite(companyDbId)) continue;
    workspaceToCompanyDbId.set(workspaceId, companyDbId);
  }

  const workspaceIds = Array.from(workspaceToCompanyDbId.keys());
  if (workspaceIds.length === 0) return empty;

  const now = new Date().toISOString();
  const { data: roleData, error: roleError } = await (
    admin.from("company_roles" as any) as any
  )
    .select(
      "role_id, company_workspace_id, name, external_jd_url, location_text, work_mode, type, posted_at, updated_at, created_at"
    )
    .in("company_workspace_id", workspaceIds)
    .eq("status", "active")
    .not("is_expired", "is", true)
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(500);

  if (roleError) {
    throw new Error(roleError.message ?? "Failed to load active roles");
  }

  const stats = new Map<number, ActiveRoleStats>();
  for (const role of coerceArray<CompanyRoleRow>(roleData)) {
    const companyDbId = workspaceToCompanyDbId.get(
      String(role.company_workspace_id)
    );
    if (!companyDbId) continue;
    const current = stats.get(companyDbId) ?? {
      count: 0,
      latestRolePostedAt: null,
      previews: [],
    };
    current.count += 1;
    current.latestRolePostedAt = latestTime([
      current.latestRolePostedAt,
      role.posted_at,
      role.updated_at,
      role.created_at,
    ]);
    if (current.previews.length < 8) {
      current.previews.push({
        externalJdUrl: role.external_jd_url ?? null,
        location: role.location_text ?? null,
        name: String(role.name ?? ""),
        postedAt: role.posted_at ?? null,
        roleId: String(role.role_id ?? ""),
        type: Array.isArray(role.type) ? role.type : [],
        workMode: role.work_mode ?? null,
      });
    }
    stats.set(companyDbId, current);
  }

  return stats;
}

async function fetchActiveFollowRows(
  admin: AdminClient,
  userId: string,
  companyDbIds: number[]
) {
  const ids = Array.from(new Set(companyDbIds.filter(Number.isFinite)));
  if (ids.length === 0) return new Map<number, TalentCompanyFollowRow>();

  const { data, error } = await (
    admin.from("talent_company_follow" as any) as any
  )
    .select("*")
    .eq("talent_id", userId)
    .in("company_db_id", ids)
    .is("unfollowed_at", null);

  if (error) {
    throw new Error(error.message ?? "Failed to load company follows");
  }

  return new Map(
    coerceArray<TalentCompanyFollowRow>(data).map((row) => [
      Number(row.company_db_id),
      row,
    ])
  );
}

async function fetchRecommendationRowsByCompanyDbIds(
  admin: AdminClient,
  userId: string,
  companyDbIds: number[]
) {
  const ids = Array.from(new Set(companyDbIds.filter(Number.isFinite)));
  if (ids.length === 0) {
    return new Map<number, TalentCompanyRecommendationRow>();
  }

  const { data, error } = await (
    admin.from("talent_company_recommendation" as any) as any
  )
    .select("*")
    .eq("talent_id", userId)
    .in("company_db_id", ids);

  if (error) {
    throw new Error(error.message ?? "Failed to load company recommendations");
  }

  return new Map(
    coerceArray<TalentCompanyRecommendationRow>(data).map((row) => [
      Number(row.company_db_id),
      row,
    ])
  );
}

function mapCompanyWatchlistItem(args: {
  activeRoleStats?: ActiveRoleStats | null;
  companyDb: CompanyDbRow;
  fallbackWorkspace?: CompanyWorkspaceRow | null;
  follow?: TalentCompanyFollowRow | null;
  recommendation?: TalentCompanyRecommendationRow | null;
  workspace?: CompanyWorkspaceRow | null;
}): TalentCompanyWatchlistItem {
  const workspace = args.workspace ?? args.fallbackWorkspace ?? null;
  const follow = args.follow ?? null;
  const recommendation = args.recommendation ?? null;
  const stats = args.activeRoleStats ?? null;
  const activeRoleCount = Math.max(
    0,
    stats?.count ?? recommendation?.active_role_count ?? 0
  );

  return {
    activeRoleCount,
    careerUrl: workspace?.career_url ?? null,
    companyDbId: Number(args.companyDb.id),
    companyWorkspaceId:
      recommendation?.company_workspace_id ??
      follow?.company_workspace_id ??
      workspace?.company_workspace_id ??
      null,
    crunchbaseInformation: args.companyDb.crunchbase_information ?? null,
    description: getCompanyDescription({
      companyDb: args.companyDb,
      workspace,
    }),
    discoveryChannelSummary: follow?.discovery_channel_summary ?? null,
    employeeCountRange: args.companyDb.employee_count_range ?? null,
    followedAt: follow?.followed_at ?? null,
    following: Boolean(follow && !follow.unfollowed_at),
    foundedYear: args.companyDb.founded_year ?? null,
    funding: args.companyDb.funding ?? null,
    fundingUrl: args.companyDb.funding_url ?? null,
    homepageUrl: workspace?.homepage_url ?? args.companyDb.website_url ?? null,
    id: String(recommendation?.id ?? follow?.id ?? args.companyDb.id),
    investors: args.companyDb.investors ?? null,
    lastCrunchbaseUpdatedAt: args.companyDb.last_crunchbase_updated_at ?? null,
    lastUpdatedAt: args.companyDb.last_updated_at ?? null,
    latestRolePostedAt: stats?.latestRolePostedAt ?? null,
    latestSignal: recommendation?.latest_signal ?? null,
    linkedinUrl: getCompanyLinkedinUrl({
      companyDb: args.companyDb,
      workspace,
    }),
    location: args.companyDb.location ?? null,
    logoUrl: getCompanyLogoUrl({
      companyDb: args.companyDb,
      workspace,
    }),
    name: getCompanyDisplayName({
      companyDb: args.companyDb,
      workspace,
    }),
    nextSignal: recommendation?.next_signal ?? null,
    rank: recommendation?.rank ?? null,
    reasonSummary: recommendation?.reason_summary ?? null,
    recommendationId: recommendation?.id ?? null,
    recommendationReasons: normalizeRecommendationReasons(
      recommendation?.recommendation_reasons ?? []
    ),
    recommendedAt: recommendation?.recommended_at ?? null,
    relatedLinks: toStringList(args.companyDb.related_links, 8),
    rolePreviews: stats?.previews ?? [],
    shortDescription: getCompanyShortDescription({
      companyDb: args.companyDb,
      workspace,
    }),
    signalSummary: recommendation?.signal_summary ?? null,
    specialities: toStringList(args.companyDb.specialities, 12),
    trackingSummary: follow?.tracking_summary ?? null,
    websiteUrl: args.companyDb.website_url ?? null,
  };
}

export async function fetchTalentCompanyWatchlistPage(args: {
  admin: AdminClient;
  limit?: number;
  offset?: number;
  tab: TalentCompanyWatchlistTab;
  userId: string;
}): Promise<TalentCompanyWatchlistPage> {
  const limit = clampPageLimit(args.limit);
  const offset = Math.max(0, Math.floor(Number(args.offset ?? 0) || 0));
  if (args.tab === "signals") {
    return {
      count: 0,
      items: [],
      limit,
      nextOffset: null,
      offset,
      tab: args.tab,
    };
  }

  const tab = args.tab;
  const from = offset;
  const to = offset + limit - 1;

  if (tab === "following") {
    const { data, error, count } = await (
      args.admin.from("talent_company_follow" as any) as any
    )
      .select("*", { count: "exact" })
      .eq("talent_id", args.userId)
      .is("unfollowed_at", null)
      .order("followed_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(error.message ?? "Failed to load followed companies");
    }

    const followRows = coerceArray<TalentCompanyFollowRow>(data);
    const companyDbIds = followRows.map((row) => Number(row.company_db_id));
    const workspaceIds = followRows
      .map((row) => cleanText(row.company_workspace_id))
      .filter(Boolean);
    const [
      companyDbById,
      workspaceById,
      fallbackWorkspaceByCompanyDbId,
      recommendationByCompanyDbId,
      activeRoleStatsByCompanyDbId,
    ] = await Promise.all([
      fetchCompanyDbMap(args.admin, companyDbIds),
      fetchWorkspaceMapByIds(args.admin, workspaceIds),
      fetchBestWorkspaceByCompanyDbIds(args.admin, companyDbIds),
      fetchRecommendationRowsByCompanyDbIds(
        args.admin,
        args.userId,
        companyDbIds
      ),
      fetchActiveRoleStatsByCompanyDbIds(args.admin, companyDbIds),
    ]);

    const items = followRows
      .map((follow) => {
        const companyDb = companyDbById.get(Number(follow.company_db_id));
        if (!companyDb) return null;
        return mapCompanyWatchlistItem({
          activeRoleStats: activeRoleStatsByCompanyDbId.get(companyDb.id),
          companyDb,
          fallbackWorkspace: fallbackWorkspaceByCompanyDbId.get(companyDb.id),
          follow,
          recommendation: recommendationByCompanyDbId.get(companyDb.id),
          workspace: follow.company_workspace_id
            ? workspaceById.get(follow.company_workspace_id)
            : null,
        });
      })
      .filter((item): item is TalentCompanyWatchlistItem => item !== null);

    return {
      count: count ?? items.length,
      items,
      limit,
      nextOffset:
        offset + items.length < (count ?? items.length) ? offset + limit : null,
      offset,
      tab: args.tab,
    };
  }

  const { data, error, count } = await (
    args.admin.from("talent_company_recommendation" as any) as any
  )
    .select("*", { count: "exact" })
    .eq("talent_id", args.userId)
    .is("dismissed_at", null)
    .order("rank", { ascending: true, nullsFirst: false })
    .order("recommended_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message ?? "Failed to load recommended companies");
  }

  const recommendationRows = coerceArray<TalentCompanyRecommendationRow>(data);
  const companyDbIds = recommendationRows.map((row) =>
    Number(row.company_db_id)
  );
  const workspaceIds = recommendationRows
    .map((row) => cleanText(row.company_workspace_id))
    .filter(Boolean);
  const [
    companyDbById,
    workspaceById,
    fallbackWorkspaceByCompanyDbId,
    followByCompanyDbId,
    activeRoleStatsByCompanyDbId,
  ] = await Promise.all([
    fetchCompanyDbMap(args.admin, companyDbIds),
    fetchWorkspaceMapByIds(args.admin, workspaceIds),
    fetchBestWorkspaceByCompanyDbIds(args.admin, companyDbIds),
    fetchActiveFollowRows(args.admin, args.userId, companyDbIds),
    fetchActiveRoleStatsByCompanyDbIds(args.admin, companyDbIds),
  ]);

  const items = recommendationRows
    .map((recommendation) => {
      const companyDb = companyDbById.get(Number(recommendation.company_db_id));
      if (!companyDb) return null;
      return mapCompanyWatchlistItem({
        activeRoleStats: activeRoleStatsByCompanyDbId.get(companyDb.id),
        companyDb,
        fallbackWorkspace: fallbackWorkspaceByCompanyDbId.get(companyDb.id),
        follow: followByCompanyDbId.get(companyDb.id),
        recommendation,
        workspace: recommendation.company_workspace_id
          ? workspaceById.get(recommendation.company_workspace_id)
          : null,
      });
    })
    .filter((item): item is TalentCompanyWatchlistItem => item !== null);

  return {
    count: count ?? items.length,
    items,
    limit,
    nextOffset:
      offset + items.length < (count ?? items.length) ? offset + limit : null,
    offset,
    tab: args.tab,
  };
}

export async function fetchTalentCompanyWatchlistDetail(args: {
  admin: AdminClient;
  companyDbId: number;
  userId: string;
}) {
  const companyDbId = Number(args.companyDbId);
  if (!Number.isFinite(companyDbId) || companyDbId <= 0) {
    throw new Error("companyDbId is required");
  }

  const [
    companyDbById,
    fallbackWorkspaceByCompanyDbId,
    followByCompanyDbId,
    recommendationByCompanyDbId,
    activeRoleStatsByCompanyDbId,
  ] = await Promise.all([
    fetchCompanyDbMap(args.admin, [companyDbId]),
    fetchBestWorkspaceByCompanyDbIds(args.admin, [companyDbId]),
    fetchActiveFollowRows(args.admin, args.userId, [companyDbId]),
    fetchRecommendationRowsByCompanyDbIds(args.admin, args.userId, [
      companyDbId,
    ]),
    fetchActiveRoleStatsByCompanyDbIds(args.admin, [companyDbId]),
  ]);

  const companyDb = companyDbById.get(companyDbId);
  if (!companyDb) return null;
  const recommendation = recommendationByCompanyDbId.get(companyDbId) ?? null;
  const follow = followByCompanyDbId.get(companyDbId) ?? null;
  const workspace = fallbackWorkspaceByCompanyDbId.get(companyDbId) ?? null;

  return mapCompanyWatchlistItem({
    activeRoleStats: activeRoleStatsByCompanyDbId.get(companyDbId),
    companyDb,
    follow,
    recommendation,
    workspace,
  });
}

async function assertConversationAccess(args: {
  admin: AdminClient;
  conversationId: string;
  userId: string;
}) {
  const { data, error } = await (
    args.admin.from("talent_conversations" as any) as any
  )
    .select("id")
    .eq("id", args.conversationId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to read conversation");
  }
  if (!data) {
    throw new Error("Conversation not found");
  }
}

export async function updateTalentCompanyFollow(args: {
  action: "follow" | "unfollow";
  admin: AdminClient;
  companyDbId: number;
  companyWorkspaceId?: string | null;
  conversationId?: string | null;
  source?: string | null;
  userId: string;
}) {
  const companyDbId = Number(args.companyDbId);
  if (!Number.isFinite(companyDbId) || companyDbId <= 0) {
    throw new Error("companyDbId is required");
  }

  const existingDetail = await fetchTalentCompanyWatchlistDetail({
    admin: args.admin,
    companyDbId,
    userId: args.userId,
  });
  if (!existingDetail) {
    throw new Error("Company not found");
  }

  const conversationId = cleanText(args.conversationId, 120) || null;
  if (conversationId) {
    await assertConversationAccess({
      admin: args.admin,
      conversationId,
      userId: args.userId,
    });
  }

  const { data: existingFollow, error: existingError } = await (
    args.admin.from("talent_company_follow" as any) as any
  )
    .select("*")
    .eq("talent_id", args.userId)
    .eq("company_db_id", companyDbId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message ?? "Failed to read company follow");
  }

  const now = new Date().toISOString();
  const source = cleanText(args.source, 80) || "watchlist";
  const companyWorkspaceId =
    cleanText(args.companyWorkspaceId, 120) ||
    existingDetail.companyWorkspaceId ||
    null;

  if (args.action === "unfollow") {
    if (!existingFollow || existingFollow.unfollowed_at) {
      return {
        assistantMessage: null,
        changed: false,
        item: { ...existingDetail, following: false, followedAt: null },
        userMessage: null,
      };
    }

    const { error } = await (
      args.admin.from("talent_company_follow" as any) as any
    )
      .update({
        unfollowed_at: now,
        updated_at: now,
      })
      .eq("talent_id", args.userId)
      .eq("company_db_id", companyDbId);

    if (error) throw new Error(error.message ?? "Failed to unfollow company");

    await insertTalentActivityEvent({
      admin: args.admin as TalentAdminClient,
      changedDomains: ["company_follow"],
      conversationId,
      eventType: "company_unfollowed",
      impactLevel: "low",
      metadata: {
        companyDbId,
        companyName: existingDetail.name,
        source,
      },
      relatedEntityId: String(companyDbId),
      relatedEntityType: "company_db",
      source,
      summary: `User unfollowed company "${existingDetail.name}".`,
      userId: args.userId,
    });

    return {
      assistantMessage: null,
      changed: true,
      item: { ...existingDetail, following: false, followedAt: null },
      userMessage: null,
    };
  }

  const alreadyFollowing = Boolean(
    existingFollow && !existingFollow.unfollowed_at
  );
  if (alreadyFollowing) {
    return {
      assistantMessage: null,
      changed: false,
      item: existingDetail,
      userMessage: null,
    };
  }

  const trackingSummary =
    "시그널 추적 중. 펀딩, 채용, Founder 글, 팀 변화 중 의미 있는 변화만 요약합니다.";
  const discoveryChannelSummary =
    "회사 측 검색 노출 활성. 이 회사가 인재를 찾거나 Harper에 채용 요청을 보낼 때 팔로워 신호를 우선 반영합니다.";
  const { error: upsertError } = await (
    args.admin.from("talent_company_follow" as any) as any
  ).upsert(
    {
      company_db_id: companyDbId,
      company_workspace_id: companyWorkspaceId,
      conversation_id: conversationId,
      discovery_channel_summary: discoveryChannelSummary,
      followed_at: now,
      source,
      talent_id: args.userId,
      tracking_summary: trackingSummary,
      unfollowed_at: null,
      updated_at: now,
    },
    { onConflict: "talent_id,company_db_id" }
  );

  if (upsertError) {
    throw new Error(upsertError.message ?? "Failed to follow company");
  }

  await insertTalentActivityEvent({
    admin: args.admin as TalentAdminClient,
    changedDomains: [
      "company_follow",
      "signal_tracking",
      "company_discovery_channel",
    ],
    conversationId,
    eventType: "company_followed",
    impactLevel: "medium",
    metadata: {
      companyDbId,
      companyName: existingDetail.name,
      companyWorkspaceId,
      source,
    },
    relatedEntityId: String(companyDbId),
    relatedEntityType: "company_db",
    source,
    summary: `User followed company "${existingDetail.name}". Harper should track company signals and prioritize this follower signal if the company searches for talent.`,
    userId: args.userId,
  });

  const item = await fetchTalentCompanyWatchlistDetail({
    admin: args.admin,
    companyDbId,
    userId: args.userId,
  });

  return {
    assistantMessage: null,
    changed: true,
    followUp: {
      companyDbId,
      delayed: Boolean(conversationId),
    },
    item: item ?? {
      ...existingDetail,
      discoveryChannelSummary,
      followedAt: now,
      following: true,
      trackingSummary,
    },
    userMessage: null,
  };
}

type CompanyRecommendationCandidate = {
  activeRoleCount: number;
  companyDb: CompanyDbRow;
  latestRoleAt: string | null;
  roles: CompanyRoleRow[];
  workspace: CompanyWorkspaceRow;
};

function tokenizeForScore(value: string) {
  return Array.from(
    new Set(
      value
        .toLocaleLowerCase("ko-KR")
        .replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]+/g, " ")
        .split(/\s+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
        .slice(0, 160)
    )
  );
}

function scoreCandidate(
  candidate: CompanyRecommendationCandidate,
  profileText: string,
  request: string | null
) {
  const profileTokens = new Set(
    tokenizeForScore([profileText, request ?? ""].join(" "))
  );
  const companyText = [
    candidate.companyDb.name,
    candidate.companyDb.short_description,
    candidate.companyDb.description,
    candidate.companyDb.specialities,
    candidate.companyDb.investors,
    candidate.workspace.company_name,
    candidate.workspace.company_description,
    candidate.workspace.pitch,
    ...candidate.roles.flatMap((role) => [
      role.name,
      role.description_summary,
      role.description,
      role.location_text,
      role.work_mode,
    ]),
  ]
    .map((entry) => cleanText(entry, 1200))
    .filter(Boolean)
    .join(" ");
  const companyTokens = tokenizeForScore(companyText);
  const overlap = companyTokens.reduce(
    (count, token) => count + (profileTokens.has(token) ? 1 : 0),
    0
  );
  const roleBoost = Math.min(candidate.activeRoleCount, 8) * 0.45;
  const qualityBoost =
    Math.max(0, Number(candidate.workspace.test_score ?? 0)) / 8;
  const recencyBoost = candidate.latestRoleAt
    ? Math.max(
        0,
        2 -
          (Date.now() - Date.parse(candidate.latestRoleAt)) /
            (1000 * 60 * 60 * 24 * 90)
      )
    : 0;
  return overlap * 0.7 + roleBoost + qualityBoost + recencyBoost;
}

async function fetchCompanyRecommendationCandidates(args: {
  admin: AdminClient;
}): Promise<CompanyRecommendationCandidate[]> {
  const threshold = new Date(
    Date.now() - 183 * 24 * 60 * 60 * 1000
  ).toISOString();
  const now = new Date().toISOString();

  const { data: roleData, error: roleError } = await (
    args.admin.from("company_roles" as any) as any
  )
    .select(
      "role_id, company_workspace_id, name, description, description_summary, external_jd_url, location_text, work_mode, type, posted_at, updated_at, created_at"
    )
    .eq("status", "active")
    .not("is_expired", "is", true)
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .or(
      `posted_at.gte.${threshold},updated_at.gte.${threshold},created_at.gte.${threshold}`
    )
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(COMPANY_RECOMMENDATION_CANDIDATE_LIMIT);

  if (roleError) {
    throw new Error(
      roleError.message ?? "Failed to load company role candidates"
    );
  }

  const roles = coerceArray<CompanyRoleRow>(roleData);
  const workspaceIds = Array.from(
    new Set(
      roles
        .map((role) => cleanText(role.company_workspace_id))
        .filter(isUuidText)
    )
  );
  if (workspaceIds.length === 0) return [];

  const workspaceById = await fetchWorkspaceMapByIds(args.admin, workspaceIds);
  const companyDbIds = Array.from(
    new Set(
      Array.from(workspaceById.values())
        .map((workspace) => Number(workspace.company_db_id))
        .filter(Number.isFinite)
    )
  );
  const companyDbById = await fetchCompanyDbMap(args.admin, companyDbIds);
  const rolesByCompanyDbId = new Map<number, CompanyRoleRow[]>();
  const workspaceByCompanyDbId = new Map<number, CompanyWorkspaceRow>();

  for (const role of roles) {
    const workspace = workspaceById.get(String(role.company_workspace_id));
    const companyDbId = Number(workspace?.company_db_id);
    if (!workspace || !Number.isFinite(companyDbId)) continue;
    const companyDb = companyDbById.get(companyDbId);
    if (!cleanText(companyDb?.linkedin_url)) continue;

    const current = rolesByCompanyDbId.get(companyDbId) ?? [];
    current.push(role);
    rolesByCompanyDbId.set(companyDbId, current);

    const currentWorkspace = workspaceByCompanyDbId.get(companyDbId);
    if (
      !currentWorkspace ||
      Number(workspace.test_score ?? 0) >
        Number(currentWorkspace.test_score ?? 0)
    ) {
      workspaceByCompanyDbId.set(companyDbId, workspace);
    }
  }

  return Array.from(rolesByCompanyDbId.entries())
    .map<CompanyRecommendationCandidate | null>(
      ([companyDbId, companyRoles]) => {
        const companyDb = companyDbById.get(companyDbId);
        const workspace = workspaceByCompanyDbId.get(companyDbId);
        if (!companyDb || !workspace) return null;

        const latestRoleAt = latestTime(
          companyRoles.flatMap((role) => [
            role.posted_at,
            role.updated_at,
            role.created_at,
          ])
        );

        return {
          activeRoleCount: companyRoles.length,
          companyDb,
          latestRoleAt,
          roles: companyRoles.slice(0, 8),
          workspace,
        };
      }
    )
    .filter(
      (candidate): candidate is CompanyRecommendationCandidate =>
        candidate !== null
    );
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
}

async function rankCompanyCandidatesWithLlm(args: {
  candidates: CompanyRecommendationCandidate[];
  profileContext: string;
  request: string | null;
}) {
  if (args.candidates.length === 0) return [];

  const cards = args.candidates
    .slice(0, COMPANY_RECOMMENDATION_LLM_LIMIT)
    .map((candidate, index) => ({
      index: index + 1,
      companyDbId: candidate.companyDb.id,
      companyName: getCompanyDisplayName({
        companyDb: candidate.companyDb,
        workspace: candidate.workspace,
      }),
      activeRoleCount: candidate.activeRoleCount,
      latestRoleAt: candidate.latestRoleAt,
      location: candidate.companyDb.location,
      description:
        cleanText(
          getCompanyShortDescription({
            companyDb: candidate.companyDb,
            workspace: candidate.workspace,
          }) ??
            getCompanyDescription({
              companyDb: candidate.companyDb,
              workspace: candidate.workspace,
            }),
          COMPANY_RECOMMENDATION_CARD_DESCRIPTION_LIMIT
        ) || null,
      specialities: toStringList(candidate.companyDb.specialities, 8),
      roles: candidate.roles.slice(0, 3).map((role) => ({
        name: cleanText(role.name, 160),
        location: cleanText(role.location_text, 120) || null,
        workMode: cleanText(role.work_mode, 80) || null,
      })),
      testScore: candidate.workspace.test_score,
    }));

  const raw = await runTalentAssistantCompletion({
    jsonMode: true,
    primaryModel: "grok-4-1-fast-non-reasoning",
    usageLabel: "career/company_recommendations:rank",
    messages: [
      {
        role: "system",
        content: [
          "You are Harper's company watchlist recommender.",
          "Return JSON only.",
          "Pick companies, not individual roles. Prefer companies that fit the candidate's durable career direction and have current hiring signal.",
          "Do not invent facts. Use only the candidate profile and company cards.",
          'JSON shape: {"recommendations":[{"companyDbId":123,"score":8.5,"reasonSummary":"Korean sentence","recommendationReasons":["Korean phrase","Korean phrase"],"signalSummary":"Korean sentence","latestSignal":"Korean short text","nextSignal":"Korean short text"}]}',
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "[Candidate profile]",
          args.profileContext.slice(
            0,
            COMPANY_RECOMMENDATION_PROFILE_CONTEXT_LIMIT
          ),
          "",
          args.request ? `[User request]\n${args.request}` : "",
          "",
          "[Company cards]",
          JSON.stringify(cards),
        ].join("\n"),
      },
    ],
    temperature: 0.15,
  });

  const parsed = parseJsonObject(raw);
  const rows = Array.isArray(parsed?.recommendations)
    ? parsed.recommendations
    : [];
  const allowedIds = new Set(cards.map((card) => Number(card.companyDbId)));

  return rows
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const companyDbId = Number(record.companyDbId);
      if (!allowedIds.has(companyDbId)) return null;
      return {
        companyDbId,
        latestSignal: cleanText(record.latestSignal, 180) || null,
        nextSignal: cleanText(record.nextSignal, 180) || null,
        reasonSummary: cleanText(record.reasonSummary, 500) || null,
        recommendationReasons: toStringList(record.recommendationReasons, 4),
        score: Number.isFinite(Number(record.score))
          ? Math.max(0, Math.min(10, Number(record.score)))
          : null,
        signalSummary: cleanText(record.signalSummary, 500) || null,
      };
    })
    .filter(
      (
        entry
      ): entry is {
        companyDbId: number;
        latestSignal: string | null;
        nextSignal: string | null;
        reasonSummary: string | null;
        recommendationReasons: string[];
        score: number | null;
        signalSummary: string | null;
      } => entry !== null
    );
}

async function fetchReusableFreshCompanyRecommendationPage(args: {
  admin: AdminClient;
  limit: number;
  request: string | null;
  forceRefresh?: boolean;
  userId: string;
}) {
  if (args.forceRefresh || args.request) return null;

  const requiredCount = Math.min(
    args.limit,
    MIN_FRESH_COMPANY_RECOMMENDATION_COUNT
  );
  const { data, error } = await (
    args.admin.from("talent_company_recommendation" as any) as any
  )
    .select("id, recommended_at")
    .eq("talent_id", args.userId)
    .is("dismissed_at", null)
    .order("recommended_at", { ascending: false })
    .limit(requiredCount);

  if (error) {
    throw new Error(
      error.message ?? "Failed to read recent company recommendations"
    );
  }

  const rows =
    coerceArray<Pick<TalentCompanyRecommendationRow, "recommended_at">>(data);
  if (rows.length < requiredCount) return null;

  const newestRecommendedAt = rows[0]?.recommended_at ?? null;
  if (
    !isFreshTimestamp(newestRecommendedAt, COMPANY_RECOMMENDATION_CACHE_TTL_MS)
  ) {
    return null;
  }

  return fetchTalentCompanyWatchlistPage({
    admin: args.admin,
    limit: args.limit,
    offset: 0,
    tab: "recommended",
    userId: args.userId,
  });
}

function buildCompanyRecommendationAnswerDraft(args: {
  cacheHit?: boolean;
  page: TalentCompanyWatchlistPage;
}) {
  const headline = args.cacheHit
    ? `최근 저장된 추천 회사 ${args.page.items.length}개를 불러왔습니다.`
    : `워치리스트에 추천 회사 ${args.page.items.length}개를 저장했습니다.`;

  return [
    headline,
    "",
    ...args.page.items.slice(0, 5).map((item, index) => {
      const reason =
        item.reasonSummary ??
        item.recommendationReasons[0] ??
        "현재 채용 신호가 있고 프로필 방향과 겹칩니다.";
      return `${index + 1}. **${item.name}** — ${reason}`;
    }),
    "",
    "워치리스트 > 추천회사에서 상세 정보와 팔로우 버튼을 볼 수 있습니다.",
  ].join("\n");
}

async function buildCompanyRecommendationProfileContext(args: {
  admin: AdminClient;
  userId: string;
}) {
  const [profile, setting, insights] = await Promise.all([
    fetchTalentUserProfile({ admin: args.admin, userId: args.userId }),
    fetchTalentSetting({ admin: args.admin, userId: args.userId }),
    fetchTalentInsights({ admin: args.admin, userId: args.userId }),
  ]);
  const structuredProfile = await fetchTalentStructuredProfile({
    admin: args.admin,
    userId: args.userId,
    talentUser: profile,
  });
  const careerMoveIntent = setting?.career_move_intent ?? null;
  return [
    buildTalentProfileContext({
      profile,
      setting,
      structuredProfile,
      maxResumeChars: 2400,
    }),
    "",
    "[Career move intent]",
    getTalentCareerMoveIntentLabel(careerMoveIntent) ?? "미확인",
    "",
    "[Talent insights]",
    JSON.stringify(insights?.content ?? {}, null, 2),
  ].join("\n");
}

export async function runCareerCompanyRecommendations(args: {
  admin: AdminClient;
  conversationId?: string | null;
  forceRefresh?: boolean;
  limit?: number;
  request?: string | null;
  source?: string | null;
  userId: string;
}) {
  const parsedLimit = Number(args.limit ?? DEFAULT_GENERATED_COMPANY_COUNT);
  const limit = Math.max(
    1,
    Math.min(
      Math.floor(
        Number.isFinite(parsedLimit)
          ? parsedLimit
          : DEFAULT_GENERATED_COMPANY_COUNT
      ),
      40
    )
  );
  const request = cleanText(args.request, 1200) || null;
  const reusablePage = await fetchReusableFreshCompanyRecommendationPage({
    admin: args.admin,
    forceRefresh: args.forceRefresh,
    limit,
    request,
    userId: args.userId,
  });

  if (reusablePage) {
    return {
      answerDraft: buildCompanyRecommendationAnswerDraft({
        cacheHit: true,
        page: reusablePage,
      }),
      cacheHit: true,
      candidateCount: 0,
      recommendedCount: reusablePage.items.length,
      recommendations: reusablePage.items,
    };
  }

  const [profileContext, candidates] = await Promise.all([
    buildCompanyRecommendationProfileContext({
      admin: args.admin,
      userId: args.userId,
    }),
    fetchCompanyRecommendationCandidates({ admin: args.admin }),
  ]);

  const scoredCandidates = candidates
    .map((candidate) => ({
      candidate,
      deterministicScore: scoreCandidate(candidate, profileContext, request),
    }))
    .sort((left, right) => right.deterministicScore - left.deterministicScore);
  const shortlist = scoredCandidates
    .slice(0, COMPANY_RECOMMENDATION_LLM_LIMIT)
    .map((entry) => entry.candidate);

  let llmRanked: Awaited<ReturnType<typeof rankCompanyCandidatesWithLlm>> = [];
  try {
    llmRanked = await rankCompanyCandidatesWithLlm({
      candidates: shortlist,
      profileContext,
      request,
    });
  } catch (error) {
    console.error("[company-watchlist] LLM ranking failed", {
      error: error instanceof Error ? error.message : String(error),
      userId: args.userId,
    });
  }

  const candidateByCompanyDbId = new Map(
    scoredCandidates.map((entry) => [
      entry.candidate.companyDb.id,
      entry.candidate,
    ])
  );
  const deterministicScoreByCompanyDbId = new Map(
    scoredCandidates.map((entry) => [
      entry.candidate.companyDb.id,
      entry.deterministicScore,
    ])
  );
  const rankedCompanyIds =
    llmRanked.length > 0
      ? llmRanked.map((entry) => entry.companyDbId)
      : scoredCandidates
          .slice(0, limit)
          .map((entry) => entry.candidate.companyDb.id);
  const llmByCompanyDbId = new Map(
    llmRanked.map((entry) => [entry.companyDbId, entry])
  );
  const selected = rankedCompanyIds
    .map((companyDbId) => {
      const candidate = candidateByCompanyDbId.get(companyDbId) ?? null;
      if (!candidate) return null;
      return candidate;
    })
    .filter(
      (candidate): candidate is CompanyRecommendationCandidate =>
        candidate !== null
    )
    .slice(0, limit);

  const now = new Date().toISOString();
  const rows = selected.map((candidate, index) => {
    const llm = llmByCompanyDbId.get(candidate.companyDb.id);
    const companyName = getCompanyDisplayName({
      companyDb: candidate.companyDb,
      workspace: candidate.workspace,
    });
    return {
      active_role_count: candidate.activeRoleCount,
      company_db_id: candidate.companyDb.id,
      company_workspace_id: candidate.workspace.company_workspace_id,
      conversation_id: args.conversationId ?? null,
      dismissed_at: null,
      latest_signal:
        llm?.latestSignal ??
        "최근 채용 신호가 확인되어 추적 후보로 저장했습니다.",
      next_signal:
        llm?.nextSignal ??
        "새 채용이나 팀 변화가 생기면 워치리스트에서 업데이트합니다.",
      rank: index + 1,
      reason_summary:
        llm?.reasonSummary ??
        `${companyName}는 현재 채용 신호가 있고 프로필 방향과 겹치는 회사입니다.`,
      recommendation_reasons:
        llm?.recommendationReasons && llm.recommendationReasons.length > 0
          ? llm.recommendationReasons
          : [
              "최근 채용 신호가 확인되어 추적 후보로 분류했습니다.",
              getCompanyShortDescription({
                companyDb: candidate.companyDb,
                workspace: candidate.workspace,
              }) ?? `${companyName}의 최근 채용 신호가 살아 있습니다.`,
            ],
      recommended_at: now,
      score:
        llm?.score ??
        Math.max(
          0,
          Math.min(
            10,
            deterministicScoreByCompanyDbId.get(candidate.companyDb.id) ?? 0
          )
        ),
      signal_summary:
        llm?.signalSummary ??
        "최근 6개월 안에 활성 채용 신호가 있어 추적 대상으로 적합합니다.",
      source: cleanText(args.source, 80) || "tool",
      talent_id: args.userId,
      updated_at: now,
    };
  });

  if (rows.length > 0) {
    const { error } = await (
      args.admin.from("talent_company_recommendation" as any) as any
    ).upsert(rows, { onConflict: "talent_id,company_db_id" });

    if (error) {
      throw new Error(
        error.message ?? "Failed to save company recommendations"
      );
    }
  }

  const page = await fetchTalentCompanyWatchlistPage({
    admin: args.admin,
    limit,
    offset: 0,
    tab: "recommended",
    userId: args.userId,
  });
  return {
    answerDraft: buildCompanyRecommendationAnswerDraft({ page }),
    cacheHit: false,
    candidateCount: candidates.length,
    recommendedCount: page.items.length,
    recommendations: page.items,
  };
}
