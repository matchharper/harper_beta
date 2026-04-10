import type { Json } from "@/types/database.types";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { normalizeTalentNetworkApplication } from "@/lib/talentNetworkApplication";
import { OpportunityType, isOpportunityType } from "@/lib/opportunityType";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

type WorkspaceRow = {
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

type CompanyDbRow = {
  id: number;
  linkedin_url: string | null;
  logo: string | null;
  name: string | null;
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

export type OpsOpportunityRoleRecord = {
  companyName: string;
  companyWorkspaceId: string;
  createdAt: string;
  description: string | null;
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
  return memo ? [memo] : [];
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
    recommendationMemo: recommendationReasons[0] ?? null,
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

async function resolveCompanyDbRecord(args: {
  admin: AdminClient;
  companyName?: string | null;
  linkedinUrl?: string | null;
}) {
  const rawLinkedinUrl = String(args.linkedinUrl ?? "").trim();
  const normalizedLinkedinUrl = rawLinkedinUrl
    ? normalizeLinkedinCompanyUrl(rawLinkedinUrl)
    : null;
  const normalizedCompanyName = String(args.companyName ?? "").trim();

  if (normalizedLinkedinUrl) {
    const linkedinCandidates = [
      normalizedLinkedinUrl,
      `${normalizedLinkedinUrl}/`,
      normalizedLinkedinUrl.replace("https://www.", "https://"),
      `${normalizedLinkedinUrl.replace("https://www.", "https://")}/`,
    ];

    const { data, error } = await (args.admin.from("company_db" as any) as any)
      .select("id, name, linkedin_url, logo")
      .in("linkedin_url", linkedinCandidates)
      .limit(1);

    if (error) {
      throw new Error(error.message ?? "Failed to resolve company");
    }

    const match = coerceJsonArray<CompanyDbRow>(data)[0];
    if (match) {
      return {
        companyDbId: Number(match.id),
        linkedinUrl: normalizedLinkedinUrl,
        logoUrl: match.logo ?? null,
      };
    }
  }

  if (normalizedCompanyName) {
    const { data, error } = await (args.admin.from("company_db" as any) as any)
      .select("id, name, linkedin_url, logo")
      .ilike("name", normalizedCompanyName)
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

function mapWorkspaceRecord(args: {
  activeRoleCount: number;
  externalRoleCount: number;
  internalRoleCount: number;
  row: WorkspaceRow;
  totalRoleCount: number;
}): OpsOpportunityWorkspaceRecord {
  return {
    activeRoleCount: args.activeRoleCount,
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
        "company_workspace_id, company_name, homepage_url, linkedin_url, logo_url, logo_storage_path, company_description, company_db_id, created_at, updated_at"
      )
      .order("updated_at", { ascending: false }) as any,
    (admin.from("company_roles" as any) as any)
      .select(
        "role_id, company_workspace_id, name, external_jd_url, description, information, type, status, created_at, updated_at, source_type, source_provider, source_job_id, posted_at, expires_at, location_text, work_mode"
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
      "company_workspace_id, company_name, homepage_url, linkedin_url, logo_url, logo_storage_path, company_description, company_db_id, created_at, updated_at"
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
      "role_id, company_workspace_id, name, external_jd_url, description, information, type, status, created_at, updated_at, source_type, source_provider, source_job_id, posted_at, expires_at, location_text, work_mode"
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
      "role_id, company_workspace_id, name, external_jd_url, description, information, type, status, created_at, updated_at, source_type, source_provider, source_job_id, posted_at, expires_at, location_text, work_mode"
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
