import type { Json } from "@/types/database.types";
import { normalizeCareerPromptLocale } from "@/lib/career/promptLocale";
import { careerT } from "@/lib/career/translatedCareerMessage";
import {
  getTalentSupabaseAdmin,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/server";
import { insertTalentActivityEvent } from "@/lib/talentOnboarding/activityEvents";

if (typeof window !== "undefined") {
  throw new Error("companyWatchlist must not run in the browser");
}

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

export type TalentCompanyWatchlistTab = "following" | "signals";

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

type CompanyDataRow = {
  company_workspace_id: string;
  last_funding_round_description: string | null;
  last_funding_stage: string | null;
  main_investors: string | null;
  total_funding_raised: string | null;
};

export type TalentCompanySnapshotDossier = {
  fullMarkdown: string;
  investigationDate: string | null;
  snapshotId: string;
  sourceFile: string | null;
  updatedAt: string | null;
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

export type TalentCompanyData = {
  lastFundingRoundDescription: string | null;
  lastFundingStage: string | null;
  mainInvestors: string | null;
  totalFundingRaised: string | null;
};

export type TalentCompanyWatchlistItem = {
  activeRoleCount: number;
  careerUrl: string | null;
  companyData: TalentCompanyData | null;
  companyDbId: number;
  companySnapshot: TalentCompanySnapshotDossier | null;
  companyWorkspaceId: string | null;
  crunchbaseInformation: Json | null;
  description: string | null;
  discoveryChannelSummary: string | null;
  employeeCountRange: Json | null;
  followedAt: string | null;
  following: boolean;
  foundedYear: number | null;
  fundingUrl: string | null;
  homepageUrl: string | null;
  id: string;
  investors: string | null;
  lastCrunchbaseUpdatedAt: string | null;
  lastUpdatedAt: string | null;
  latestRolePostedAt: string | null;
  linkedinUrl: string | null;
  location: string | null;
  logoUrl: string | null;
  name: string;
  relatedLinks: string[];
  rolePreviews: TalentCompanyRolePreview[];
  shortDescription: string | null;
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

const COMPANY_DB_SELECT =
  "id, name, logo, website_url, linkedin_url, funding_url, short_description, description, specialities, location, investors, employee_count_range, founded_year, related_links, crunchbase_information, last_crunchbase_updated_at, last_updated_at";

const COMPANY_WORKSPACE_SELECT =
  "company_workspace_id, company_name, company_description, homepage_url, career_url, linkedin_url, logo_url, company_db_id, brief, pitch, request, is_internal, test_score, updated_at";

const COMPANY_DATA_SELECT =
  "company_workspace_id, total_funding_raised, main_investors, last_funding_stage, last_funding_round_description";

const UNKNOWN_COMPANY_DATA_TEXT = new Set([
  "unknown",
  "unknown undisclosed",
  "not available",
  "not applicable",
  "not disclosed",
  "n a",
  "na",
  "none",
  "null",
  "undisclosed",
  "미상",
  "알 수 없음",
  "알수 없음",
  "확인 불가",
  "비공개",
]);

function clampPageLimit(value: unknown) {
  const parsed = Number(value ?? DEFAULT_COMPANY_PAGE_SIZE);
  if (!Number.isFinite(parsed)) return DEFAULT_COMPANY_PAGE_SIZE;
  return Math.max(1, Math.min(Math.floor(parsed), MAX_COMPANY_PAGE_SIZE));
}

export function parseCompanyWatchlistTab(
  value: string | null | undefined
): TalentCompanyWatchlistTab {
  if (value === "signals") return value;
  return "following";
}

function cleanText(value: unknown, maxLength = 4000) {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text ? text.slice(0, maxLength) : "";
}

function cleanCompanyDataText(value: unknown, maxLength = 1000) {
  const text = cleanText(value, maxLength);
  if (!text) return null;
  const normalized = text
    .toLowerCase()
    .replace(/[()[\]{}.,:;!?]+/g, " ")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return UNKNOWN_COMPANY_DATA_TEXT.has(normalized) ? null : text;
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

function toJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cleanSnapshotText(value: unknown, maxLength = 120_000) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, maxLength) : "";
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

function mapCompanyDataRow(row: CompanyDataRow): TalentCompanyData | null {
  const item = {
    lastFundingRoundDescription: cleanCompanyDataText(
      row.last_funding_round_description,
      1200
    ),
    lastFundingStage: cleanCompanyDataText(row.last_funding_stage, 120),
    mainInvestors: cleanCompanyDataText(row.main_investors, 500),
    totalFundingRaised: cleanCompanyDataText(row.total_funding_raised, 120),
  };

  return Object.values(item).some(Boolean) ? item : null;
}

async function fetchCompanyDataMapByWorkspaceIds(
  admin: AdminClient,
  workspaceIds: string[]
) {
  const ids = uniqueUuidList(workspaceIds);
  if (ids.length === 0) return new Map<string, TalentCompanyData>();

  const { data, error } = await (admin.from("company_data" as any) as any)
    .select(COMPANY_DATA_SELECT)
    .in("company_workspace_id", ids);

  if (error) {
    throw new Error(error.message ?? "Failed to load company_data records");
  }

  const byWorkspaceId = new Map<string, TalentCompanyData>();
  for (const row of coerceArray<CompanyDataRow>(data)) {
    const item = mapCompanyDataRow(row);
    if (item) {
      byWorkspaceId.set(String(row.company_workspace_id), item);
    }
  }
  return byWorkspaceId;
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

async function fetchLatestCompanySnapshotDossier(
  admin: AdminClient,
  companyDbId: number,
  preferredLocale?: string | null
): Promise<TalentCompanySnapshotDossier | null> {
  const expectedLocale = normalizeCareerPromptLocale(preferredLocale);
  const { data, error } = await (admin.from("company_snapshot" as any) as any)
    .select("id, content, created_at, updated_at")
    .eq("company_db_id", companyDbId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(error.message ?? "Failed to load company snapshot");
  }

  const snapshotRows = coerceArray<Record<string, unknown>>(data);
  const row =
    snapshotRows.find((candidate) => {
      const content = toJsonRecord(candidate.content);
      const locale = normalizeCareerPromptLocale(content?.locale);
      return locale === expectedLocale;
    }) ?? null;
  if (!row) return null;

  const content = toJsonRecord(row?.content);
  const fullMarkdown = cleanSnapshotText(content?.full_markdown);
  if (!fullMarkdown) return null;

  const metadata = toJsonRecord(content?.metadata);
  const updatedAt =
    cleanSnapshotText(row?.updated_at, 80) ||
    cleanSnapshotText(row?.created_at, 80) ||
    null;

  return {
    fullMarkdown,
    investigationDate:
      cleanSnapshotText(metadata?.investigation_date, 80) || null,
    snapshotId: cleanSnapshotText(row?.id, 80),
    sourceFile: cleanSnapshotText(metadata?.source_file, 240) || null,
    updatedAt,
  };
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

function mapCompanyWatchlistItem(args: {
  activeRoleStats?: ActiveRoleStats | null;
  companyData?: TalentCompanyData | null;
  companyDb: CompanyDbRow;
  companySnapshot?: TalentCompanySnapshotDossier | null;
  fallbackWorkspace?: CompanyWorkspaceRow | null;
  follow?: TalentCompanyFollowRow | null;
  workspace?: CompanyWorkspaceRow | null;
}): TalentCompanyWatchlistItem {
  const workspace = args.workspace ?? args.fallbackWorkspace ?? null;
  const follow = args.follow ?? null;
  const stats = args.activeRoleStats ?? null;
  const activeRoleCount = Math.max(0, stats?.count ?? 0);

  return {
    activeRoleCount,
    careerUrl: workspace?.career_url ?? null,
    companyData: args.companyData ?? null,
    companyDbId: Number(args.companyDb.id),
    companySnapshot: args.companySnapshot ?? null,
    companyWorkspaceId:
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
    fundingUrl: args.companyDb.funding_url ?? null,
    homepageUrl: workspace?.homepage_url ?? args.companyDb.website_url ?? null,
    id: String(follow?.id ?? args.companyDb.id),
    investors: args.companyDb.investors ?? null,
    lastCrunchbaseUpdatedAt: args.companyDb.last_crunchbase_updated_at ?? null,
    lastUpdatedAt: args.companyDb.last_updated_at ?? null,
    latestRolePostedAt: stats?.latestRolePostedAt ?? null,
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
    relatedLinks: toStringList(args.companyDb.related_links, 8),
    rolePreviews: stats?.previews ?? [],
    shortDescription: getCompanyShortDescription({
      companyDb: args.companyDb,
      workspace,
    }),
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

  const from = offset;
  const to = offset + limit - 1;

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
    activeRoleStatsByCompanyDbId,
  ] = await Promise.all([
    fetchCompanyDbMap(args.admin, companyDbIds),
    fetchWorkspaceMapByIds(args.admin, workspaceIds),
    fetchBestWorkspaceByCompanyDbIds(args.admin, companyDbIds),
    fetchActiveRoleStatsByCompanyDbIds(args.admin, companyDbIds),
  ]);
  const companyDataByWorkspaceId = await fetchCompanyDataMapByWorkspaceIds(
    args.admin,
    followRows
      .map((follow) => {
        const companyDbId = Number(follow.company_db_id);
        return (
          follow.company_workspace_id ??
          fallbackWorkspaceByCompanyDbId.get(companyDbId)
            ?.company_workspace_id ??
          null
        );
      })
      .filter((value): value is string => Boolean(value))
  );

  const items = followRows
    .map((follow) => {
      const companyDb = companyDbById.get(Number(follow.company_db_id));
      if (!companyDb) return null;
      const fallbackWorkspace = fallbackWorkspaceByCompanyDbId.get(
        companyDb.id
      );
      const workspace = follow.company_workspace_id
        ? workspaceById.get(follow.company_workspace_id)
        : null;
      const companyWorkspaceId =
        follow.company_workspace_id ??
        workspace?.company_workspace_id ??
        fallbackWorkspace?.company_workspace_id ??
        null;
      return mapCompanyWatchlistItem({
        activeRoleStats: activeRoleStatsByCompanyDbId.get(companyDb.id),
        companyData: companyWorkspaceId
          ? companyDataByWorkspaceId.get(companyWorkspaceId) ?? null
          : null,
        companyDb,
        fallbackWorkspace,
        follow,
        workspace,
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
  preferredLocale?: string | null;
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
    activeRoleStatsByCompanyDbId,
    companySnapshot,
  ] = await Promise.all([
    fetchCompanyDbMap(args.admin, [companyDbId]),
    fetchBestWorkspaceByCompanyDbIds(args.admin, [companyDbId]),
    fetchActiveFollowRows(args.admin, args.userId, [companyDbId]),
    fetchActiveRoleStatsByCompanyDbIds(args.admin, [companyDbId]),
    fetchLatestCompanySnapshotDossier(
      args.admin,
      companyDbId,
      args.preferredLocale
    ),
  ]);

  const companyDb = companyDbById.get(companyDbId);
  if (!companyDb) return null;
  const follow = followByCompanyDbId.get(companyDbId) ?? null;
  const workspace = fallbackWorkspaceByCompanyDbId.get(companyDbId) ?? null;
  const companyWorkspaceId =
    follow?.company_workspace_id ?? workspace?.company_workspace_id ?? null;
  const companyDataByWorkspaceId = await fetchCompanyDataMapByWorkspaceIds(
    args.admin,
    companyWorkspaceId ? [companyWorkspaceId] : []
  );

  return mapCompanyWatchlistItem({
    activeRoleStats: activeRoleStatsByCompanyDbId.get(companyDbId),
    companyData: companyWorkspaceId
      ? companyDataByWorkspaceId.get(companyWorkspaceId) ?? null
      : null,
    companyDb,
    companySnapshot,
    follow,
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
  preferredLocale?: string | null;
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
    preferredLocale: args.preferredLocale,
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

  const trackingSummary = careerT(
    args.preferredLocale,
    "career.company.follow.tracking_summary",
    "시그널 추적 중. 펀딩, 채용, Founder 글, 팀 변화 중 의미 있는 변화만 요약합니다."
  );
  const discoveryChannelSummary = careerT(
    args.preferredLocale,
    "career.company.follow.discovery_channel_summary",
    "회사 측 검색 노출 활성. 이 회사가 인재를 찾거나 Harper에 채용 요청을 보낼 때 팔로워 신호를 우선 반영합니다."
  );

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
    source,
    summary: `User followed company "${existingDetail.name}". Harper should track company signals and prioritize this follower signal if the company searches for talent.`,
    userId: args.userId,
  });

  const item = await fetchTalentCompanyWatchlistDetail({
    admin: args.admin,
    companyDbId,
    preferredLocale: args.preferredLocale,
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
