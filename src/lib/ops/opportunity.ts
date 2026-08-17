import { OPS_OPPORTUNITY_COMPANY_PAGE_SIZE } from "@/lib/ops/opportunityConstants";
import {
  type CompanyEventInsertClient,
  writeCompanyEvent,
} from "@/lib/org/companyEvents";
import { applyWebsiteCompanyDataChanges } from "@/lib/org/companyDataWebsite";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { getCompanyInternalRoleRequest } from "@/lib/companyInternalRole";

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
  published_name?: string | null;
  request?: string | null;
  updated_at: string;
};

type RoleRow = {
  company_internal_roles?:
    | { is_auto?: boolean | null; request?: string | null }
    | Array<{ is_auto?: boolean | null; request?: string | null }>
    | null;
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
  source_job_id?: string | null;
  source_provider?: string | null;
  source_type?: string | null;
  status: string;
  type: string[] | null;
  updated_at: string;
  work_mode?: string | null;
};

type RecommendationConnectionRow = {
  id: string;
  role_id: string;
  saved_stage: string | null;
  talent_id: string;
};

type ConnectedProgressRow = {
  metadata: unknown;
  recommendation_id: string | null;
};

type OpportunityStageTagRow = {
  opportunity_id: string;
  tag: string;
  talent_id: string;
};

type CompanyMessageRecencyRow = {
  company_workspace_id: string;
  conversation_id: string;
  created_at: string;
  id: number;
  message_type: string;
  role: string;
  slack_thread_id: string | null;
  status: string;
};

export type OpportunitySourceType = "internal" | "external";
export type OpportunityStatus =
  | "draft"
  | "top_priority"
  | "active"
  | "ended"
  | "paused";
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
  connectedCount: number;
  createdAt: string;
  externalRoleCount: number;
  homepageUrl: string | null;
  internalRoleCount: number;
  hasAutoRole: boolean;
  hasSlackConnection: boolean;
  isInternal: boolean;
  linkedinUrl: string | null;
  logoUrl: string | null;
  memberCount: number;
  pendingConnectionCount: number;
  pitch: string | null;
  publishedName: string | null;
  request: string | null;
  recentConversationAt: string | null;
  totalRoleCount: number;
  updatedAt: string;
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

function sanitizeOpportunityFilterText(value: string) {
  return value
    .replace(/[%(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchCompanyInternalRoleRequestSearchIds(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  queryText: string;
}) {
  const { data, error } = await args.admin
    .from("company_internal_roles")
    .select("role_id")
    .ilike("request", `%${args.queryText}%`)
    .limit(5000);
  if (error) {
    throw new Error(error.message ?? "Failed to search internal role requests");
  }
  return (data ?? []).map((row) => row.role_id).filter(Boolean);
}

function normalizeOpportunitySourceType(value: unknown): OpportunitySourceType {
  return value === "external" ? "external" : "internal";
}

function isCompanyInternalRoleAuto(value: RoleRow["company_internal_roles"]) {
  const records = Array.isArray(value) ? value : value ? [value] : [];
  return records.some((record) => record?.is_auto === true);
}

function isConnectedProgress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return (value as Record<string, unknown>).stage === "connected";
}

function conversationScopeKey(row: CompanyMessageRecencyRow) {
  return [
    row.conversation_id,
    row.message_type,
    row.message_type === "slack" ? (row.slack_thread_id ?? "") : "",
  ].join(":");
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
  if (value === "draft") return "draft";
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

function mapWorkspaceRecord(args: {
  activeRoleCount: number;
  connectedCount?: number;
  externalRoleCount: number;
  internalRoleCount: number;
  hasAutoRole?: boolean;
  hasSlackConnection?: boolean;
  memberCount?: number;
  pendingConnectionCount?: number;
  recentConversationAt?: string | null;
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
    connectedCount: Math.max(
      0,
      Math.floor(Number(args.connectedCount ?? 0) || 0)
    ),
    createdAt: String(args.row.created_at ?? ""),
    externalRoleCount: args.externalRoleCount,
    homepageUrl: args.row.homepage_url ?? null,
    internalRoleCount: args.internalRoleCount,
    hasAutoRole: Boolean(args.hasAutoRole),
    hasSlackConnection: Boolean(args.hasSlackConnection),
    isInternal: Boolean(args.row.is_internal),
    linkedinUrl: args.row.linkedin_url ?? null,
    logoUrl: args.row.logo_url ?? null,
    memberCount: Math.max(0, Math.floor(Number(args.memberCount ?? 0) || 0)),
    pendingConnectionCount: Math.max(
      0,
      Math.floor(Number(args.pendingConnectionCount ?? 0) || 0)
    ),
    pitch: args.row.pitch ?? null,
    publishedName: args.row.published_name ?? null,
    request: args.row.request ?? null,
    recentConversationAt: args.recentConversationAt ?? null,
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
    request: getCompanyInternalRoleRequest(args.row.company_internal_roles),
    roleId: String(args.row.role_id ?? ""),
    sourceJobId: args.row.source_job_id ?? null,
    sourceProvider: args.row.source_provider ?? null,
    sourceType: normalizeOpportunitySourceType(args.row.source_type),
    status: normalizeOpportunityStatus(args.row.status),
    updatedAt: String(args.row.updated_at ?? args.row.created_at ?? ""),
    workMode: normalizeOpportunityWorkMode(args.row.work_mode),
  };
}

async function fetchWorkspaceSlackConnectionIds(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  workspaceIds: string[];
}) {
  if (args.workspaceIds.length === 0) return new Set<string>();

  const { data, error } = await (
    args.admin.from("company_slack_integrations" as any) as any
  )
    .select("company_workspace_id")
    .in("company_workspace_id", args.workspaceIds)
    .eq("status", "active");
  if (error) {
    throw new Error(error.message ?? "Failed to load Slack connection status");
  }
  return new Set(
    coerceJsonArray<{ company_workspace_id?: string | null }>(data)
      .map((row) => String(row.company_workspace_id ?? "").trim())
      .filter(Boolean)
  );
}

async function fetchWorkspaceConnectionCounts(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  roleWorkspaceId: ReadonlyMap<string, string>;
}) {
  const roleIds = Array.from(args.roleWorkspaceId.keys());
  const empty = new Map<
    string,
    { connectedCount: number; pendingConnectionCount: number }
  >();
  if (roleIds.length === 0) return empty;

  const [recommendationResult, progressResult, tagResult] = await Promise.all([
    (args.admin.from("talent_opportunity_recommendation" as any) as any)
      .select("id, talent_id, role_id, saved_stage")
      .in("role_id", roleIds)
      .limit(10_000),
    (args.admin.from("talent_progress" as any) as any)
      .select("recommendation_id, metadata")
      .eq("kind", "org_stage_change")
      .in("role_id", roleIds)
      .contains("metadata", { stage: "connected" })
      .not("recommendation_id", "is", null)
      .limit(10_000),
    (args.admin.from("talent_opportunity_tag" as any) as any)
      .select("talent_id, opportunity_id, tag")
      .in("opportunity_id", roleIds)
      .in("tag", ["내부:수락", "내부:연결대기", "내부:연결됨"])
      .limit(10_000),
  ]);
  if (recommendationResult.error) {
    throw new Error(
      recommendationResult.error.message ??
        "Failed to load company connection counts"
    );
  }
  if (progressResult.error) {
    throw new Error(
      progressResult.error.message ??
        "Failed to load company connection progress"
    );
  }
  if (tagResult.error) {
    throw new Error(
      tagResult.error.message ?? "Failed to load company connection stages"
    );
  }

  const connectedRecommendationIds = new Set(
    coerceJsonArray<ConnectedProgressRow>(progressResult.data)
      .filter((row) => isConnectedProgress(row.metadata))
      .map((row) => String(row.recommendation_id ?? "").trim())
      .filter(Boolean)
  );
  const stageByWorkspaceAndTalent = new Map<
    string,
    { connected: boolean; pending: boolean }
  >();

  const markStage = (
    workspaceId: string,
    talentId: string,
    stage: "connected" | "pending"
  ) => {
    const key = `${workspaceId}:${talentId}`;
    const current = stageByWorkspaceAndTalent.get(key) ?? {
      connected: false,
      pending: false,
    };
    if (stage === "connected") current.connected = true;
    else current.pending = true;
    stageByWorkspaceAndTalent.set(key, current);
  };

  const recommendationsById = new Map<string, RecommendationConnectionRow>();
  for (const recommendation of coerceJsonArray<RecommendationConnectionRow>(
    recommendationResult.data
  )) {
    const recommendationId = String(recommendation.id ?? "").trim();
    if (recommendationId) {
      recommendationsById.set(recommendationId, recommendation);
    }
  }

  for (const tag of coerceJsonArray<OpportunityStageTagRow>(tagResult.data)) {
    const workspaceId = args.roleWorkspaceId.get(
      String(tag.opportunity_id ?? "").trim()
    );
    const talentId = String(tag.talent_id ?? "").trim();
    const stageTag = String(tag.tag ?? "").trim();
    if (!workspaceId || !talentId) continue;
    if (stageTag === "내부:연결됨") {
      markStage(workspaceId, talentId, "connected");
    } else if (stageTag === "내부:연결대기") {
      markStage(workspaceId, talentId, "pending");
    }
  }

  for (const recommendationId of connectedRecommendationIds) {
    const recommendation = recommendationsById.get(recommendationId);
    if (!recommendation) continue;
    const workspaceId = args.roleWorkspaceId.get(
      String(recommendation.role_id ?? "").trim()
    );
    const talentId = String(recommendation.talent_id ?? "").trim();
    if (!workspaceId || !talentId) continue;
    markStage(workspaceId, talentId, "connected");
  }

  for (const recommendation of recommendationsById.values()) {
    const workspaceId = args.roleWorkspaceId.get(
      String(recommendation.role_id ?? "").trim()
    );
    const talentId = String(recommendation.talent_id ?? "").trim();
    const savedStage = String(recommendation.saved_stage ?? "")
      .trim()
      .toLowerCase();
    if (!workspaceId || !talentId) continue;
    if (savedStage === "connected") {
      markStage(workspaceId, talentId, "connected");
    } else if (savedStage === "pending_connection") {
      markStage(workspaceId, talentId, "pending");
    }
  }

  for (const [key, stage] of stageByWorkspaceAndTalent) {
    const workspaceId = key.slice(0, key.lastIndexOf(":"));
    const current = empty.get(workspaceId) ?? {
      connectedCount: 0,
      pendingConnectionCount: 0,
    };
    if (stage.connected) {
      current.connectedCount += 1;
    } else if (stage.pending) {
      current.pendingConnectionCount += 1;
    }
    empty.set(workspaceId, current);
  }

  return empty;
}

async function fetchRecentConversationAtByWorkspace(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  workspaceIds: string[];
}) {
  const recentByWorkspaceId = new Map<string, string>();
  if (args.workspaceIds.length === 0) return recentByWorkspaceId;

  const { data, error } = await (
    args.admin.from("company_messages" as any) as any
  )
    .select(
      "id, company_workspace_id, conversation_id, role, message_type, status, slack_thread_id, created_at"
    )
    .in("company_workspace_id", args.workspaceIds)
    .in("message_type", ["chat", "slack"])
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(5_000);
  if (error) {
    throw new Error(error.message ?? "Failed to load recent company messages");
  }

  const rows = coerceJsonArray<CompanyMessageRecencyRow>(data).sort(
    (left, right) => {
      const byOccurredAt =
        new Date(left.created_at).getTime() -
        new Date(right.created_at).getTime();
      return byOccurredAt || Number(left.id) - Number(right.id);
    }
  );
  const latestUserByScope = new Map<string, CompanyMessageRecencyRow>();
  for (const row of rows) {
    const workspaceId = String(row.company_workspace_id ?? "").trim();
    if (!workspaceId) continue;
    const scope = conversationScopeKey(row);
    if (row.role === "user") {
      latestUserByScope.set(scope, row);
      continue;
    }
    if (
      row.role !== "assistant" ||
      row.status !== "completed" ||
      !latestUserByScope.has(scope)
    ) {
      continue;
    }
    const current = recentByWorkspaceId.get(workspaceId);
    if (
      !current ||
      new Date(row.created_at).getTime() > new Date(current).getTime()
    ) {
      recentByWorkspaceId.set(workspaceId, row.created_at);
    }
  }
  return recentByWorkspaceId;
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
  const workspaceQueryText = sanitizeOpportunityFilterText(
    String(args.workspaceQuery ?? "")
  );

  let workspaceQuery = (admin.from("company_workspace" as any) as any)
    .select(
      "company_workspace_id, company_name, published_name, homepage_url, career_url, linkedin_url, logo_url, company_description, company_db_id, is_internal, pitch, request, created_at, updated_at",
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
        "role_id, company_workspace_id, name, external_jd_url, description, description_summary, type, status, created_at, updated_at, source_type, source_provider, source_job_id, posted_at, expires_at, location_text, work_mode, company_internal_roles(request, is_auto)"
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
    {
      active: number;
      external: number;
      hasAutoRole: boolean;
      internal: number;
      total: number;
    }
  >();
  const memberCountByWorkspaceId = new Map<string, number>();
  const roleWorkspaceId = new Map<string, string>(
    roleRows
      .map((row): [string, string] => [
        String(row.role_id ?? "").trim(),
        String(row.company_workspace_id ?? "").trim(),
      ])
      .filter(([roleId, workspaceId]) => roleId && workspaceId)
  );

  const [
    memberResult,
    slackWorkspaceIds,
    connectionCountsByWorkspaceId,
    recentConversationByWorkspaceId,
  ] = await Promise.all([
    workspaceIds.length > 0
      ? (admin.from("company_user_workspace" as any) as any)
          .select("company_workspace_id")
          .in("company_workspace_id", workspaceIds)
      : Promise.resolve({ data: [], error: null }),
    fetchWorkspaceSlackConnectionIds({ admin, workspaceIds }),
    fetchWorkspaceConnectionCounts({ admin, roleWorkspaceId }),
    fetchRecentConversationAtByWorkspace({ admin, workspaceIds }),
  ]);

  if (memberResult.error) {
    throw new Error(
      memberResult.error.message ?? "Failed to load company members"
    );
  }

  for (const row of coerceJsonArray<{ company_workspace_id?: string | null }>(
    memberResult.data
  )) {
    const workspaceId = String(row.company_workspace_id ?? "").trim();
    if (!workspaceId) continue;
    memberCountByWorkspaceId.set(
      workspaceId,
      (memberCountByWorkspaceId.get(workspaceId) ?? 0) + 1
    );
  }

  for (const row of roleRows) {
    const workspaceId = String(row.company_workspace_id ?? "").trim();
    if (!workspaceId) continue;

    const current = roleStatsByWorkspaceId.get(workspaceId) ?? {
      active: 0,
      external: 0,
      hasAutoRole: false,
      internal: 0,
      total: 0,
    };

    current.total += 1;
    const status = normalizeOpportunityStatus(row.status);
    if (status === "active" || status === "top_priority") {
      current.active += 1;
    }
    if (isCompanyInternalRoleAuto(row.company_internal_roles)) {
      current.hasAutoRole = true;
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
      const workspaceId = String(row.company_workspace_id ?? "");
      const stats = roleStatsByWorkspaceId.get(workspaceId) ?? {
        active: 0,
        external: 0,
        hasAutoRole: false,
        internal: 0,
        total: 0,
      };
      const connectionCounts = connectionCountsByWorkspaceId.get(workspaceId);

      return mapWorkspaceRecord({
        activeRoleCount: stats.active,
        connectedCount: connectionCounts?.connectedCount ?? 0,
        externalRoleCount: stats.external,
        hasAutoRole: stats.hasAutoRole,
        hasSlackConnection: slackWorkspaceIds.has(workspaceId),
        internalRoleCount: stats.internal,
        memberCount: memberCountByWorkspaceId.get(workspaceId) ?? 0,
        pendingConnectionCount: connectionCounts?.pendingConnectionCount ?? 0,
        recentConversationAt:
          recentConversationByWorkspaceId.get(workspaceId) ?? null,
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
  const queryText = sanitizeOpportunityFilterText(String(args.query ?? ""));
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

  const requestRoleIds =
    queryText && sourceType !== "external"
      ? await fetchCompanyInternalRoleRequestSearchIds({ admin, queryText })
      : [];

  let roleQuery = (admin.from("company_roles" as any) as any)
    .select(
      "role_id, company_workspace_id, name, external_jd_url, description, description_summary, type, status, created_at, updated_at, source_type, source_provider, source_job_id, posted_at, expires_at, location_text, work_mode, company_internal_roles(request)",
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
        ...(requestRoleIds.length > 0
          ? [`role_id.in.(${requestRoleIds.join(",")})`]
          : []),
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

export async function saveOpsOpportunityRole(args: {
  companyWorkspaceId?: string | null;
  description?: string | null;
  descriptionSummary?: string | null;
  employmentTypes?: OpportunityEmploymentType[];
  eventActorLabel: string;
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

  const request = String(args.request ?? "").trim() || null;
  const sourceType = normalizeOpportunitySourceType(args.sourceType);
  if (sourceType === "external" && request) {
    throw new Error("External roles cannot have an internal matching request");
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
    source_job_id: String(args.sourceJobId ?? "").trim() || null,
    source_provider: String(args.sourceProvider ?? "").trim() || null,
    source_type: sourceType,
    status: normalizeOpportunityStatus(args.status),
    type: sanitizeOpportunityEmploymentTypes(args.employmentTypes),
    updated_at: now,
    work_mode: normalizeOpportunityWorkMode(args.workMode),
  };

  const roleId = String(args.roleId ?? "").trim();
  const roleSelect =
    "role_id, company_workspace_id, name, external_jd_url, description, description_summary, type, status, created_at, updated_at, source_type, source_provider, source_job_id, posted_at, expires_at, location_text, work_mode, company_internal_roles(request)";
  let beforeRole: RoleRow | null = null;
  if (roleId) {
    const { data: beforeData, error: beforeError } = await (
      admin.from("company_roles" as any) as any
    )
      .select(roleSelect)
      .eq("role_id", roleId)
      .eq("company_workspace_id", workspaceId)
      .maybeSingle();
    if (beforeError) {
      throw new Error(beforeError.message ?? "Failed to load role");
    }
    beforeRole = (beforeData as RoleRow | null) ?? null;
    if (!beforeRole) {
      throw new Error("Role not found");
    }
  }

  if (beforeRole) {
    await applyWebsiteCompanyDataChanges({
      actorLabel: args.eventActorLabel,
      admin,
      changes: [
        {
          key: "role_source_type",
          roleId,
          value: payload.source_type,
        },
        { key: "role_name", roleId, value: payload.name },
        { key: "role_description", roleId, value: payload.description },
        {
          key: "role_description_summary",
          roleId,
          value: payload.description_summary,
        },
        {
          key: "role_external_jd_url",
          roleId,
          value: payload.external_jd_url,
        },
        { key: "role_location", roleId, value: payload.location_text },
        { key: "role_status", roleId, value: payload.status },
        {
          key: "role_employment_types",
          roleId,
          value: payload.type,
        },
        { key: "role_work_mode", roleId, value: payload.work_mode },
        ...(payload.source_type === "internal"
          ? [{ key: "role_request" as const, roleId, value: request }]
          : []),
        {
          key: "role_source_provider",
          roleId,
          value: payload.source_provider,
        },
        {
          key: "role_source_job_id",
          roleId,
          value: payload.source_job_id,
        },
        {
          key: "role_posted_at",
          roleId,
          value: payload.posted_at,
        },
        {
          key: "role_expires_at",
          roleId,
          value: payload.expires_at,
        },
      ],
      workspaceId,
    });

    const { data: savedData, error: savedError } = await (
      admin.from("company_roles" as any) as any
    )
      .select(roleSelect)
      .eq("role_id", roleId)
      .eq("company_workspace_id", workspaceId)
      .single();
    if (savedError)
      throw new Error(savedError.message ?? "Failed to load role");
    return mapRoleRecord({
      companyName: String(
        (workspaceData as { company_name?: string }).company_name ?? ""
      ),
      row: savedData as RoleRow,
    });
  }

  const query = (admin.from("company_roles" as any) as any).insert({
    ...payload,
    created_at: now,
  });

  const { data, error } = await query.select(roleSelect).single();

  if (error) {
    throw new Error(error.message ?? "Failed to save role");
  }

  const insertedRole = data as RoleRow;
  if (payload.source_type === "internal") {
    const { error: internalError } = await admin
      .from("company_internal_roles")
      .upsert(
        {
          request,
          role_id: insertedRole.role_id,
          updated_at: now,
        },
        { onConflict: "role_id" }
      );
    if (internalError) {
      throw new Error(
        internalError.message ?? "Failed to save internal role request"
      );
    }
  }

  const { data: savedData, error: savedError } = await (
    admin.from("company_roles" as any) as any
  )
    .select(roleSelect)
    .eq("role_id", insertedRole.role_id)
    .single();
  if (savedError || !savedData) {
    throw new Error(savedError?.message ?? "Failed to reload saved role");
  }
  const savedRole = savedData as RoleRow;
  const savedRequest = getCompanyInternalRoleRequest(
    savedRole.company_internal_roles
  );
  const eventFields = [
    "name",
    "description",
    "description_summary",
    "request",
    "external_jd_url",
    "location_text",
    "type",
    "work_mode",
    "status",
    "source_type",
    "source_provider",
    "source_job_id",
    "posted_at",
    "expires_at",
  ] as const;
  const roleLabel = savedRole.name;
  await writeCompanyEvent({
    actorLabel: args.eventActorLabel,
    changes: eventFields.map((key) => ({
      after: key === "request" ? savedRequest : savedRole[key],
      before: null,
      key: `${roleLabel}.${key}`,
    })),
    client: admin as unknown as CompanyEventInsertClient,
    source: "website",
    workspaceId,
  });

  return mapRoleRecord({
    companyName: String(
      (workspaceData as { company_name?: string }).company_name ?? ""
    ),
    row: savedRole,
  });
}
