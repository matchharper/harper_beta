import { OPS_OPPORTUNITY_COMPANY_PAGE_SIZE } from "@/lib/ops/opportunityConstants";
import {
  type CompanyEventInsertClient,
  writeCompanyEvent,
} from "@/lib/org/companyEvents";
import { applyWebsiteCompanyDataChanges } from "@/lib/org/companyDataWebsite";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

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
  isInternal: boolean;
  linkedinUrl: string | null;
  logoUrl: string | null;
  memberCount: number;
  pitch: string | null;
  publishedName: string | null;
  request: string | null;
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
    publishedName: args.row.published_name ?? null,
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
      const workspaceId = String(row.company_workspace_id ?? "");
      const stats = roleStatsByWorkspaceId.get(workspaceId) ?? {
        active: 0,
        external: 0,
        internal: 0,
        total: 0,
      };

      return mapWorkspaceRecord({
        activeRoleCount: stats.active,
        externalRoleCount: stats.external,
        internalRoleCount: stats.internal,
        memberCount: memberCountByWorkspaceId.get(workspaceId) ?? 0,
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
  const roleSelect =
    "role_id, company_workspace_id, name, external_jd_url, description, description_summary, type, status, request, created_at, updated_at, source_type, source_provider, source_job_id, posted_at, expires_at, location_text, work_mode";
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
        { key: "role_request", roleId, value: payload.request },
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

  const savedRole = data as RoleRow;
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
      after: savedRole[key],
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
