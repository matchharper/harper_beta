import { MATCH_BOOKING_URL } from "@/lib/booking";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { CandidateTypeWithConnection } from "@/hooks/search/useSearchChatCandidates";
import {
  normalizeMatchDecisionStatus,
  normalizeMatchEmploymentTypes,
  normalizeMatchRoleStatus,
  type MatchCandidateDetailResponse,
  type MatchCandidateRecord,
  type MatchDecisionStatus,
  type MatchEmploymentType,
  type MatchRoleRecord,
  type MatchRoleStatus,
  type MatchWorkspaceRecord,
  type MatchWorkspaceResponse,
} from "./shared";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

type WorkspaceRow = {
  company_db_id?: number | null;
  company_description: string | null;
  company_name: string;
  company_workspace_id: string;
  created_at: string;
  homepage_url: string | null;
  linkedin_url: string | null;
  logo_url: string | null;
  updated_at: string;
};

type RoleRow = {
  company_workspace_id: string;
  created_at: string;
  description: string | null;
  external_jd_url: string | null;
  name: string;
  role_id: string;
  status: string;
  type: string[] | null;
  updated_at: string;
};

type MembershipRow = {
  company_user_id: string;
  company_workspace_id: string;
  role: string | null;
};

type CompanyDbRow = {
  id: number;
  last_updated_at?: string | null;
  linkedin_url: string | null;
  logo: string | null;
};

const MATCH_WORKSPACE_SELECT =
  "company_workspace_id, company_name, homepage_url, linkedin_url, logo_url, company_description, company_db_id, created_at, updated_at";

export type MatchCandidateListItem = CandidateTypeWithConnection & {
  match: MatchCandidateRecord;
};

function ensureNonEmptyString(value: unknown, fieldName: string) {
  const nextValue = String(value ?? "").trim();
  if (!nextValue) {
    throw new Error(`${fieldName} is required`);
  }
  return nextValue;
}

function coerceJsonArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeLink(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function normalizeLinkedinCompanyUrl(raw: string): string | null {
  try {
    const withProtocol = normalizeLink(raw);
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!(host === "linkedin.com" || host.endsWith(".linkedin.com"))) {
      return null;
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    if (segments[0]?.toLowerCase() !== "company") return null;

    const slug = decodeURIComponent(segments[1] ?? "")
      .trim()
      .toLowerCase();
    if (!slug) return null;

    return `https://www.linkedin.com/company/${slug}`;
  } catch {
    return null;
  }
}

async function resolveWorkspaceBrandingFromCompanyDb(
  admin: AdminClient,
  linkedinUrl?: string | null
) {
  const rawLinkedinUrl = String(linkedinUrl ?? "").trim();
  if (!rawLinkedinUrl) {
    return {
      companyDbId: null,
      linkedinUrl: null,
      logoUrl: null,
    };
  }

  const normalizedLinkedinUrl = normalizeLinkedinCompanyUrl(rawLinkedinUrl);
  const linkedinSlug =
    normalizedLinkedinUrl?.split("/").filter(Boolean).at(-1) ?? null;

  if (!normalizedLinkedinUrl || !linkedinSlug) {
    return {
      companyDbId: null,
      linkedinUrl: rawLinkedinUrl,
      logoUrl: null,
    };
  }

  const candidates = [
    normalizedLinkedinUrl,
    `${normalizedLinkedinUrl}/`,
    normalizedLinkedinUrl.replace("https://www.", "https://"),
    `${normalizedLinkedinUrl.replace("https://www.", "https://")}/`,
  ];

  try {
    const exactMatchQuery = (admin.from("company_db" as any) as any)
      .select("id, linkedin_url, logo, last_updated_at")
      .in("linkedin_url", candidates)
      .order("last_updated_at", { ascending: false, nullsFirst: false })
      .limit(1) as any;
    const { data: exactData, error: exactError } = await exactMatchQuery;

    if (exactError) {
      throw exactError;
    }

    const exactRow = coerceJsonArray<CompanyDbRow>(exactData)[0];
    if (exactRow) {
      return {
        companyDbId: Number(exactRow.id),
        linkedinUrl: normalizedLinkedinUrl,
        logoUrl: exactRow.logo ?? null,
      };
    }

    const fuzzyMatchQuery = (admin.from("company_db" as any) as any)
      .select("id, linkedin_url, logo, last_updated_at")
      .ilike("linkedin_url", `%/company/${linkedinSlug}%`)
      .order("last_updated_at", { ascending: false, nullsFirst: false })
      .limit(10) as any;
    const { data: fuzzyData, error: fuzzyError } = await fuzzyMatchQuery;

    if (fuzzyError) {
      throw fuzzyError;
    }

    const fuzzyRow = coerceJsonArray<CompanyDbRow>(fuzzyData).find(
      (row) =>
        normalizeLinkedinCompanyUrl(row.linkedin_url ?? "") ===
        normalizedLinkedinUrl
    );
    return {
      companyDbId: fuzzyRow ? Number(fuzzyRow.id) : null,
      linkedinUrl: normalizedLinkedinUrl,
      logoUrl: fuzzyRow?.logo ?? null,
    };
  } catch {
    return {
      companyDbId: null,
      linkedinUrl: normalizedLinkedinUrl,
      logoUrl: null,
    };
  }
}

function mapWorkspaceRecord(args: {
  membershipRole?: string | null;
  row: WorkspaceRow;
}): MatchWorkspaceRecord {
  return {
    companyDescription: args.row.company_description ?? null,
    companyName: String(args.row.company_name ?? ""),
    companyWorkspaceId: String(args.row.company_workspace_id ?? ""),
    createdAt: String(args.row.created_at ?? ""),
    homepageUrl: args.row.homepage_url ?? null,
    linkedinUrl: args.row.linkedin_url ?? null,
    logoUrl: args.row.logo_url ?? null,
    memberRole: args.membershipRole ?? null,
    updatedAt: String(args.row.updated_at ?? args.row.created_at ?? ""),
  };
}

function mapRoleRecord(args: { row: RoleRow }): MatchRoleRecord {
  const roleId = String(args.row.role_id ?? "");
  return {
    companyWorkspaceId: String(args.row.company_workspace_id ?? ""),
    createdAt: String(args.row.created_at ?? ""),
    description: args.row.description ?? null,
    employmentTypes: normalizeMatchEmploymentTypes(args.row.type),
    externalJdUrl: args.row.external_jd_url ?? null,
    name: String(args.row.name ?? ""),
    roleId,
    status: normalizeMatchRoleStatus(args.row.status),
    updatedAt: String(args.row.updated_at ?? args.row.created_at ?? ""),
  };
}

async function fetchMembershipRows(admin: AdminClient, userId: string) {
  const { data, error } = await (
    admin.from("company_user_workspace" as any) as any
  )
    .select("company_user_id, company_workspace_id, role")
    .eq("company_user_id", userId);

  if (error) {
    throw new Error(error.message ?? "Failed to load workspace memberships");
  }

  return coerceJsonArray<MembershipRow>(data);
}

async function ensureWorkspaceMembership(args: {
  admin: AdminClient;
  userId: string;
  workspaceId: string;
}) {
  const { data: existingData, error: existingError } = await (
    args.admin.from("company_user_workspace" as any) as any
  )
    .select("company_user_id, company_workspace_id, role")
    .eq("company_user_id", args.userId)
    .eq("company_workspace_id", args.workspaceId)
    .limit(1);

  if (existingError) {
    throw new Error(
      existingError.message ?? "Failed to load workspace membership"
    );
  }

  const existingMembership =
    coerceJsonArray<MembershipRow>(existingData)[0] ?? null;
  if (existingMembership) {
    return existingMembership.role ?? null;
  }

  const { data, error } = await (
    args.admin.from("company_user_workspace" as any) as any
  )
    .insert({
      company_user_id: args.userId,
      company_workspace_id: args.workspaceId,
      role: "owner",
    })
    .select("company_user_id, company_workspace_id, role")
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to create workspace membership");
  }

  return (data as MembershipRow).role ?? "owner";
}

async function fetchWorkspaceRowByCompanyDbId(
  admin: AdminClient,
  companyDbId: number | null
) {
  if (companyDbId === null) return null;

  const { data, error } = await (admin.from("company_workspace" as any) as any)
    .select(MATCH_WORKSPACE_SELECT)
    .eq("company_db_id", companyDbId)
    .limit(1);

  if (error) {
    throw new Error(error.message ?? "Failed to load workspace by company_db");
  }

  return coerceJsonArray<WorkspaceRow>(data)[0] ?? null;
}

async function fetchWorkspaceRowsByIds(
  admin: AdminClient,
  workspaceIds: string[]
) {
  if (workspaceIds.length === 0) return [] as WorkspaceRow[];

  const { data, error } = await (admin.from("company_workspace" as any) as any)
    .select(MATCH_WORKSPACE_SELECT)
    .in("company_workspace_id", workspaceIds)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "Failed to load workspaces");
  }

  return coerceJsonArray<WorkspaceRow>(data);
}

async function resolveWorkspaceContext(args: {
  admin: AdminClient;
  userId: string;
  workspaceId?: string | null;
}) {
  const memberships = await fetchMembershipRows(args.admin, args.userId);
  const workspaceIds = Array.from(
    new Set(
      memberships
        .map((row) => String(row.company_workspace_id ?? "").trim())
        .filter(Boolean)
    )
  );

  if (workspaceIds.length === 0) {
    return {
      membership: null,
      memberships,
      workspaces: [] as MatchWorkspaceRecord[],
      workspace: null,
      workspaceIds,
    };
  }

  const workspaceRows = await fetchWorkspaceRowsByIds(args.admin, workspaceIds);
  const membershipByWorkspaceId = new Map(
    memberships.map(
      (row) => [String(row.company_workspace_id ?? ""), row] as const
    )
  );
  const workspaces = workspaceRows.map((row) =>
    mapWorkspaceRecord({
      membershipRole:
        membershipByWorkspaceId.get(String(row.company_workspace_id ?? ""))
          ?.role ?? null,
      row,
    })
  );
  const workspaceById = new Map(
    workspaceRows.map((row) => [String(row.company_workspace_id), row] as const)
  );
  const requestedWorkspaceId = String(args.workspaceId ?? "").trim();
  const resolvedWorkspace =
    (requestedWorkspaceId
      ? workspaceById.get(requestedWorkspaceId)
      : workspaceRows[0]) ?? null;

  if (!resolvedWorkspace) {
    throw new Error("Workspace not found");
  }

  const membership =
    memberships.find(
      (row) =>
        String(row.company_workspace_id ?? "") ===
        String(resolvedWorkspace.company_workspace_id ?? "")
    ) ?? null;

  if (!membership) {
    throw new Error("Forbidden");
  }

  return {
    membership,
    memberships,
    workspaces,
    workspace: resolvedWorkspace,
    workspaceIds,
  };
}

export async function fetchWorkspaceRoles(args: {
  admin: AdminClient;
  workspaceId: string;
}) {
  const { data, error } = await (args.admin.from("company_roles" as any) as any)
    .select(
      "role_id, company_workspace_id, name, external_jd_url, description, type, status, created_at, updated_at"
    )
    .eq("company_workspace_id", args.workspaceId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "Failed to load roles");
  }

  const roleRows = coerceJsonArray<RoleRow>(data);

  return roleRows.map((row) =>
    mapRoleRecord({
      row,
    })
  );
}

export async function fetchMatchWorkspace(args: {
  userId: string;
  workspaceId?: string | null;
}): Promise<MatchWorkspaceResponse> {
  const admin = getSupabaseAdmin();
  const resolved = await resolveWorkspaceContext({
    admin,
    userId: args.userId,
    workspaceId: args.workspaceId,
  });

  if (!resolved.workspace) {
    return {
      bookingUrl: MATCH_BOOKING_URL,
      roles: [],
      workspace: null,
      workspaces: [],
    };
  }

  const roles = await fetchWorkspaceRoles({
    admin,
    workspaceId: resolved.workspace.company_workspace_id,
  });

  return {
    bookingUrl: MATCH_BOOKING_URL,
    roles,
    workspace: mapWorkspaceRecord({
      membershipRole: resolved.membership?.role ?? null,
      row: resolved.workspace,
    }),
    workspaces: resolved.workspaces,
  };
}

export async function createMatchWorkspace(args: {
  companyDescription?: string | null;
  companyName: string;
  homepageUrl?: string | null;
  linkedinUrl?: string | null;
  userId: string;
}) {
  const admin = getSupabaseAdmin();
  const resolvedBranding = await resolveWorkspaceBrandingFromCompanyDb(
    admin,
    args.linkedinUrl
  );
  const existingWorkspace = await fetchWorkspaceRowByCompanyDbId(
    admin,
    resolvedBranding.companyDbId
  );

  if (existingWorkspace) {
    const memberRole = await ensureWorkspaceMembership({
      admin,
      userId: args.userId,
      workspaceId: existingWorkspace.company_workspace_id,
    });

    return mapWorkspaceRecord({
      membershipRole: memberRole,
      row: existingWorkspace,
    });
  }

  const payload = {
    company_description: String(args.companyDescription ?? "").trim() || null,
    company_db_id: resolvedBranding.companyDbId,
    company_name: ensureNonEmptyString(args.companyName, "companyName"),
    homepage_url: String(args.homepageUrl ?? "").trim() || null,
    linkedin_url: resolvedBranding.linkedinUrl,
    logo_url: resolvedBranding.logoUrl,
  };

  const { data, error } = await (admin.from("company_workspace" as any) as any)
    .insert(payload)
    .select(MATCH_WORKSPACE_SELECT)
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to create workspace");
  }

  const workspaceRow = data as WorkspaceRow;
  const memberRole = await ensureWorkspaceMembership({
    admin,
    userId: args.userId,
    workspaceId: workspaceRow.company_workspace_id,
  });

  return mapWorkspaceRecord({
    membershipRole: memberRole,
    row: workspaceRow,
  });
}

export async function updateMatchWorkspace(args: {
  companyDescription?: string | null;
  companyName?: string;
  homepageUrl?: string | null;
  linkedinUrl?: string | null;
  userId: string;
  workspaceId?: string | null;
}) {
  const admin = getSupabaseAdmin();
  const resolved = await resolveWorkspaceContext({
    admin,
    userId: args.userId,
    workspaceId: args.workspaceId,
  });

  if (!resolved.workspace) {
    throw new Error("Workspace not found");
  }

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (args.companyName !== undefined) {
    payload.company_name = ensureNonEmptyString(
      args.companyName,
      "companyName"
    );
  }
  if (args.companyDescription !== undefined) {
    payload.company_description =
      String(args.companyDescription ?? "").trim() || null;
  }
  if (args.homepageUrl !== undefined) {
    payload.homepage_url = String(args.homepageUrl ?? "").trim() || null;
  }
  if (args.linkedinUrl !== undefined) {
    const resolvedBranding = await resolveWorkspaceBrandingFromCompanyDb(
      admin,
      args.linkedinUrl
    );
    const existingWorkspace = await fetchWorkspaceRowByCompanyDbId(
      admin,
      resolvedBranding.companyDbId
    );
    if (
      existingWorkspace &&
      existingWorkspace.company_workspace_id !==
        resolved.workspace.company_workspace_id
    ) {
      throw new Error(
        "A workspace already exists for this LinkedIn company page"
      );
    }
    payload.company_db_id = resolvedBranding.companyDbId;
    payload.linkedin_url = resolvedBranding.linkedinUrl;
    payload.logo_url = resolvedBranding.logoUrl;
  }

  const { data, error } = await (admin.from("company_workspace" as any) as any)
    .update(payload)
    .eq("company_workspace_id", resolved.workspace.company_workspace_id)
    .select(MATCH_WORKSPACE_SELECT)
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to save workspace");
  }

  return mapWorkspaceRecord({
    membershipRole: resolved.membership?.role ?? null,
    row: data as WorkspaceRow,
  });
}

export async function saveMatchRole(args: {
  companyWorkspaceId?: string | null;
  description?: string | null;
  employmentTypes?: MatchEmploymentType[];
  externalJdUrl?: string | null;
  name: string;
  roleId?: string | null;
  status?: MatchRoleStatus;
  userId: string;
}) {
  const admin = getSupabaseAdmin();
  const resolved = await resolveWorkspaceContext({
    admin,
    userId: args.userId,
    workspaceId: args.companyWorkspaceId,
  });

  if (!resolved.workspace) {
    throw new Error("Workspace not found");
  }

  const now = new Date().toISOString();
  const basePayload = {
    company_workspace_id: resolved.workspace.company_workspace_id,
    description: String(args.description ?? "").trim() || null,
    external_jd_url: String(args.externalJdUrl ?? "").trim() || null,
    name: ensureNonEmptyString(args.name, "roleName"),
    status: normalizeMatchRoleStatus(args.status),
    type: normalizeMatchEmploymentTypes(args.employmentTypes ?? []),
    updated_at: now,
  };

  const roleId = String(args.roleId ?? "").trim();
  const query = roleId
    ? (admin.from("company_roles" as any) as any)
        .update(basePayload)
        .eq("role_id", roleId)
        .eq("company_workspace_id", resolved.workspace.company_workspace_id)
    : (admin.from("company_roles" as any) as any).insert({
        ...basePayload,
        created_at: now,
      });

  const { data, error } = await query
    .select(
      "role_id, company_workspace_id, name, external_jd_url, description, type, status, created_at, updated_at"
    )
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to save role");
  }

  return mapRoleRecord({
    row: data as RoleRow,
  });
}

export async function fetchMatchCandidates(args: {
  pageIdx?: number;
  pageSize?: number;
  roleId?: string | null;
  userId: string;
  workspaceId?: string | null;
}) {
  const admin = getSupabaseAdmin();
  const resolved = await resolveWorkspaceContext({
    admin,
    userId: args.userId,
    workspaceId: args.workspaceId,
  });

  if (!resolved.workspace) {
    return {
      hasNext: false,
      items: [] as MatchCandidateListItem[],
      total: 0,
      workspace: null,
    };
  }

  const roles = await fetchWorkspaceRoles({
    admin,
    workspaceId: resolved.workspace.company_workspace_id,
  });
  const roleIds = roles.map((role) => role.roleId);
  const requestedRoleId = String(args.roleId ?? "").trim();
  if (requestedRoleId && !roleIds.includes(requestedRoleId)) {
    throw new Error("Role not found");
  }

  return {
    hasNext: false,
    items: [] as MatchCandidateListItem[],
    total: 0,
    workspace: mapWorkspaceRecord({
      membershipRole: resolved.membership?.role ?? null,
      row: resolved.workspace,
    }),
  };
}

export async function fetchMatchCandidateDetail(args: {
  candidId: string;
  roleId?: string | null;
  userId: string;
  workspaceId?: string | null;
}): Promise<MatchCandidateDetailResponse> {
  const admin = getSupabaseAdmin();
  const resolved = await resolveWorkspaceContext({
    admin,
    userId: args.userId,
    workspaceId: args.workspaceId,
  });

  if (!resolved.workspace) {
    throw new Error("Workspace not found");
  }

  ensureNonEmptyString(args.candidId, "candidId");

  throw new Error("Matched candidate not found");
}

export async function updateMatchCandidateDecision(args: {
  candidId: string;
  feedbackText: string;
  roleId: string;
  status: Exclude<MatchDecisionStatus, "pending">;
  userId: string;
  workspaceId?: string | null;
}) {
  const admin = getSupabaseAdmin();
  const feedbackText = ensureNonEmptyString(args.feedbackText, "feedbackText");
  const roleId = ensureNonEmptyString(args.roleId, "roleId");
  const candidId = ensureNonEmptyString(args.candidId, "candidId");
  const status = normalizeMatchDecisionStatus(args.status);

  if (status === "pending") {
    throw new Error("Invalid decision status");
  }

  const resolved = await resolveWorkspaceContext({
    admin,
    userId: args.userId,
    workspaceId: args.workspaceId,
  });

  if (!resolved.workspace) {
    throw new Error("Workspace not found");
  }

  void feedbackText;
  void roleId;
  void candidId;
  void status;

  throw new Error("Matched candidate not found");
}
