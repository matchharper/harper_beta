import type { Json } from "@/types/database.types";
import { MATCH_BOOKING_URL } from "@/lib/booking";
import {
  applyListRevealState,
  fetchBaseCandidatesByIds,
  fetchCandidateMarkMapForUser,
  fetchGithubPreviewByCandidateIds,
  fetchRevealMapForUser,
  fetchScholarPreviewByCandidateIds,
  fetchShortlistMemoMapForUser,
  getSupabaseAdmin,
} from "@/lib/server/candidateAccess";
import type { CandidateTypeWithConnection } from "@/hooks/useSearchChatCandidates";
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
  information: Json | null;
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

type MatchRow = {
  candid_id: string;
  company_role: {
    company_workspace_id: string;
    name: string;
    role_id: string;
    status: string;
    updated_at: string;
  } | null;
  created_at: string;
  feedback_text: string | null;
  harper_memo: string | null;
  id: string;
  role_id: string;
  status: string;
  updated_at: string;
};

type CompanyDbRow = {
  linkedin_url: string | null;
  logo: string | null;
};

export type MatchCandidateListItem = CandidateTypeWithConnection & {
  match: MatchCandidateRecord;
};

const ROLE_STATUS_WEIGHT: Record<MatchRoleStatus, number> = {
  top_priority: 0,
  active: 1,
  paused: 2,
  ended: 3,
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

    const slug = decodeURIComponent(segments[1] ?? "").trim().toLowerCase();
    if (!slug) return null;

    return `https://www.linkedin.com/company/${slug}`;
  } catch {
    return null;
  }
}

async function resolveWorkspaceLogoFromCompanyDb(
  admin: AdminClient,
  linkedinUrl?: string | null
) {
  const rawLinkedinUrl = String(linkedinUrl ?? "").trim();
  if (!rawLinkedinUrl) {
    return {
      linkedinUrl: null,
      logoUrl: null,
    };
  }

  const normalizedLinkedinUrl = normalizeLinkedinCompanyUrl(rawLinkedinUrl);
  const linkedinSlug = normalizedLinkedinUrl?.split("/").filter(Boolean).at(-1) ?? null;

  if (!normalizedLinkedinUrl || !linkedinSlug) {
    return {
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
    const exactMatchQuery = (((admin.from("company_db" as any) as any)
      .select("linkedin_url, logo")
      .in("linkedin_url", candidates)
      .not("logo", "is", null)
      .limit(1)) as any);
    const { data: exactData, error: exactError } = await exactMatchQuery;

    if (exactError) {
      throw exactError;
    }

    const exactRow = coerceJsonArray<CompanyDbRow>(exactData)[0];
    if (exactRow?.logo) {
      return {
        linkedinUrl: normalizedLinkedinUrl,
        logoUrl: exactRow.logo,
      };
    }

    const fuzzyMatchQuery = (((admin.from("company_db" as any) as any)
      .select("linkedin_url, logo")
      .ilike("linkedin_url", `%/company/${linkedinSlug}%`)
      .not("logo", "is", null)
      .limit(1)) as any);
    const { data: fuzzyData, error: fuzzyError } = await fuzzyMatchQuery;

    if (fuzzyError) {
      throw fuzzyError;
    }

    const fuzzyRow = coerceJsonArray<CompanyDbRow>(fuzzyData)[0];
    return {
      linkedinUrl: normalizedLinkedinUrl,
      logoUrl: fuzzyRow?.logo ?? null,
    };
  } catch {
    return {
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

function mapRoleRecord(args: {
  matchedCandidateCountByRoleId: Map<string, number>;
  row: RoleRow;
}): MatchRoleRecord {
  const roleId = String(args.row.role_id ?? "");
  return {
    companyWorkspaceId: String(args.row.company_workspace_id ?? ""),
    createdAt: String(args.row.created_at ?? ""),
    description: args.row.description ?? null,
    employmentTypes: normalizeMatchEmploymentTypes(args.row.type),
    externalJdUrl: args.row.external_jd_url ?? null,
    information: args.row.information ?? null,
    matchedCandidateCount: args.matchedCandidateCountByRoleId.get(roleId) ?? 0,
    name: String(args.row.name ?? ""),
    roleId,
    status: normalizeMatchRoleStatus(args.row.status),
    updatedAt: String(args.row.updated_at ?? args.row.created_at ?? ""),
  };
}

function mapMatchRecord(args: {
  relatedRoleIds?: string[];
  relatedRoleNames?: string[];
  row: MatchRow;
}): MatchCandidateRecord {
  return {
    candidId: String(args.row.candid_id ?? ""),
    feedbackText: args.row.feedback_text ?? null,
    harperMemo: args.row.harper_memo ?? null,
    matchId: String(args.row.id ?? ""),
    relatedRoleIds: args.relatedRoleIds ?? [String(args.row.role_id ?? "")],
    relatedRoleNames:
      args.relatedRoleNames ?? [String(args.row.company_role?.name ?? "")],
    roleId: String(args.row.role_id ?? ""),
    roleName: String(args.row.company_role?.name ?? ""),
    status: normalizeMatchDecisionStatus(args.row.status),
    updatedAt: String(args.row.updated_at ?? args.row.created_at ?? ""),
  };
}

async function fetchMembershipRows(admin: AdminClient, userId: string) {
  const { data, error } = await ((admin.from("company_user_workspace" as any) as any)
    .select("company_user_id, company_workspace_id, role")
    .eq("company_user_id", userId));

  if (error) {
    throw new Error(error.message ?? "Failed to load workspace memberships");
  }

  return coerceJsonArray<MembershipRow>(data);
}

async function fetchWorkspaceRowsByIds(
  admin: AdminClient,
  workspaceIds: string[]
) {
  if (workspaceIds.length === 0) return [] as WorkspaceRow[];

  const { data, error } = await ((admin.from("company_workspace" as any) as any)
    .select(
      "company_workspace_id, company_name, homepage_url, linkedin_url, logo_url, company_description, created_at, updated_at"
    )
    .in("company_workspace_id", workspaceIds)
    .order("updated_at", { ascending: false }));

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
    memberships.map((row) => [String(row.company_workspace_id ?? ""), row] as const)
  );
  const workspaces = workspaceRows.map((row) =>
    mapWorkspaceRecord({
      membershipRole:
        membershipByWorkspaceId.get(String(row.company_workspace_id ?? ""))?.role ??
        null,
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

async function fetchMatchedCandidateCountByRoleId(
  admin: AdminClient,
  roleIds: string[]
) {
  const countByRoleId = new Map<string, number>();
  if (roleIds.length === 0) return countByRoleId;

  const { data, error } = await ((admin.from("company_role_matched" as any) as any)
    .select("role_id")
    .in("role_id", roleIds));

  if (error) {
    throw new Error(error.message ?? "Failed to load matched candidate counts");
  }

  for (const row of coerceJsonArray<any>(data)) {
    const roleId = String(row?.role_id ?? "").trim();
    if (!roleId) continue;
    countByRoleId.set(roleId, (countByRoleId.get(roleId) ?? 0) + 1);
  }

  return countByRoleId;
}

export async function fetchWorkspaceRoles(args: {
  admin: AdminClient;
  workspaceId: string;
}) {
  const { data, error } = await ((args.admin.from("company_roles" as any) as any)
    .select(
      "role_id, company_workspace_id, name, external_jd_url, description, information, type, status, created_at, updated_at"
    )
    .eq("company_workspace_id", args.workspaceId)
    .order("updated_at", { ascending: false }));

  if (error) {
    throw new Error(error.message ?? "Failed to load roles");
  }

  const roleRows = coerceJsonArray<RoleRow>(data);
  const roleIds = roleRows.map((row) => String(row.role_id ?? "")).filter(Boolean);
  const matchedCandidateCountByRoleId = await fetchMatchedCandidateCountByRoleId(
    args.admin,
    roleIds
  );

  return roleRows.map((row) =>
    mapRoleRecord({
      matchedCandidateCountByRoleId,
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
  const resolvedBranding = await resolveWorkspaceLogoFromCompanyDb(
    admin,
    args.linkedinUrl
  );

  const payload = {
    company_description:
      String(args.companyDescription ?? "").trim() || null,
    company_name: ensureNonEmptyString(args.companyName, "companyName"),
    homepage_url: String(args.homepageUrl ?? "").trim() || null,
    linkedin_url: resolvedBranding.linkedinUrl,
    logo_url: resolvedBranding.logoUrl,
  };

  const { data, error } = await ((admin.from("company_workspace" as any) as any)
    .insert(payload)
    .select(
      "company_workspace_id, company_name, homepage_url, linkedin_url, logo_url, company_description, created_at, updated_at"
    )
    .single());

  if (error) {
    throw new Error(error.message ?? "Failed to create workspace");
  }

  const workspaceRow = data as WorkspaceRow;
  const { error: membershipError } = await (
    (admin.from("company_user_workspace" as any) as any)
  ).insert({
    company_user_id: args.userId,
    company_workspace_id: workspaceRow.company_workspace_id,
    role: "owner",
  });

  if (membershipError) {
    throw new Error(membershipError.message ?? "Failed to create workspace membership");
  }

  return mapWorkspaceRecord({
    membershipRole: "owner",
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
    payload.company_name = ensureNonEmptyString(args.companyName, "companyName");
  }
  if (args.companyDescription !== undefined) {
    payload.company_description =
      String(args.companyDescription ?? "").trim() || null;
  }
  if (args.homepageUrl !== undefined) {
    payload.homepage_url = String(args.homepageUrl ?? "").trim() || null;
  }
  if (args.linkedinUrl !== undefined) {
    const resolvedBranding = await resolveWorkspaceLogoFromCompanyDb(
      admin,
      args.linkedinUrl
    );
    payload.linkedin_url = resolvedBranding.linkedinUrl;
    payload.logo_url = resolvedBranding.logoUrl;
  }

  const { data, error } = await ((admin.from("company_workspace" as any) as any)
    .update(payload)
    .eq("company_workspace_id", resolved.workspace.company_workspace_id)
    .select(
      "company_workspace_id, company_name, homepage_url, linkedin_url, logo_url, company_description, created_at, updated_at"
    )
    .single());

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
  information?: Json | null;
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
    information: args.information ?? null,
    name: ensureNonEmptyString(args.name, "roleName"),
    status: normalizeMatchRoleStatus(args.status),
    type: normalizeMatchEmploymentTypes(args.employmentTypes ?? []),
    updated_at: now,
  };

  const roleId = String(args.roleId ?? "").trim();
  const query = roleId
    ? ((admin.from("company_roles" as any) as any)
        .update(basePayload)
        .eq("role_id", roleId)
        .eq("company_workspace_id", resolved.workspace.company_workspace_id))
    : ((admin.from("company_roles" as any) as any)
        .insert({
          ...basePayload,
          created_at: now,
        }));

  const { data, error } = await query
    .select(
      "role_id, company_workspace_id, name, external_jd_url, description, information, type, status, created_at, updated_at"
    )
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to save role");
  }

  return mapRoleRecord({
    matchedCandidateCountByRoleId: new Map(),
    row: data as RoleRow,
  });
}

async function fetchRawMatchRows(args: {
  admin: AdminClient;
  roleId?: string | null;
  roleIds: string[];
}) {
  if (args.roleIds.length === 0) return [] as MatchRow[];

  let query = ((args.admin.from("company_role_matched" as any) as any)
    .select(
      `
        id,
        candid_id,
        role_id,
        harper_memo,
        status,
        feedback_text,
        created_at,
        updated_at,
        company_role:company_roles (
          role_id,
          company_workspace_id,
          name,
          status,
          updated_at
        )
      `
    )
    .in("role_id", args.roleIds)
    .order("updated_at", { ascending: false })) as any;

  const requestedRoleId = String(args.roleId ?? "").trim();
  if (requestedRoleId) {
    query = query.eq("role_id", requestedRoleId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message ?? "Failed to load matched candidates");
  }

  return coerceJsonArray<MatchRow>(data);
}

function compareMatchRows(a: MatchRow, b: MatchRow) {
  const aWeight =
    ROLE_STATUS_WEIGHT[normalizeMatchRoleStatus(a.company_role?.status)] ?? 99;
  const bWeight =
    ROLE_STATUS_WEIGHT[normalizeMatchRoleStatus(b.company_role?.status)] ?? 99;

  if (aWeight !== bWeight) return aWeight - bWeight;

  const aUpdated = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
  const bUpdated = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
  return bUpdated - aUpdated;
}

function dedupeWorkspaceMatchRows(rows: MatchRow[]) {
  const grouped = new Map<string, MatchRow[]>();

  for (const row of rows) {
    const candidId = String(row.candid_id ?? "").trim();
    if (!candidId) continue;
    grouped.set(candidId, [...(grouped.get(candidId) ?? []), row]);
  }

  const deduped: Array<{
    primary: MatchRow;
    relatedRoleIds: string[];
    relatedRoleNames: string[];
  }> = [];

  for (const candidateRows of Array.from(grouped.values())) {
    const sorted = [...candidateRows].sort(compareMatchRows);
    const primary = sorted[0];
    deduped.push({
      primary,
      relatedRoleIds: sorted.map((row) => String(row.role_id ?? "")).filter(Boolean),
      relatedRoleNames: sorted
        .map((row) => String(row.company_role?.name ?? "").trim())
        .filter(Boolean),
    });
  }

  return deduped.sort((a, b) => compareMatchRows(a.primary, b.primary));
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

  const rawRows = await fetchRawMatchRows({
    admin,
    roleId: requestedRoleId || null,
    roleIds,
  });
  const groupedRows = requestedRoleId
    ? rawRows.map((row) => ({
        primary: row,
        relatedRoleIds: [String(row.role_id ?? "")],
        relatedRoleNames: [String(row.company_role?.name ?? "")],
      }))
    : dedupeWorkspaceMatchRows(rawRows);

  const pageIdx = Math.max(0, Number(args.pageIdx ?? 0) || 0);
  const pageSize = Math.min(50, Math.max(1, Number(args.pageSize ?? 24) || 24));
  const start = pageIdx * pageSize;
  const pagedRows = groupedRows.slice(start, start + pageSize);
  const candidateIds = pagedRows
    .map((row) => String(row.primary.candid_id ?? "").trim())
    .filter(Boolean);

  if (candidateIds.length === 0) {
    return {
      hasNext: false,
      items: [] as MatchCandidateListItem[],
      total: groupedRows.length,
      workspace: mapWorkspaceRecord({
        membershipRole: resolved.membership?.role ?? null,
        row: resolved.workspace,
      }),
    };
  }

  const [
    candidates,
    revealMap,
    candidateMarkMap,
    shortlistMemoMap,
    scholarPreviewByCandidateId,
    githubPreviewByCandidateId,
  ] = await Promise.all([
    fetchBaseCandidatesByIds({
      ids: candidateIds,
      supabaseAdmin: admin,
      userId: args.userId,
    }),
    fetchRevealMapForUser(admin, args.userId, candidateIds),
    fetchCandidateMarkMapForUser(admin, args.userId, candidateIds),
    fetchShortlistMemoMapForUser(admin, args.userId, candidateIds),
    fetchScholarPreviewByCandidateIds(admin, candidateIds),
    fetchGithubPreviewByCandidateIds(admin, candidateIds),
  ]);

  const candidateById = new Map(
    candidates.map((candidate: any) => [String(candidate.id), candidate] as const)
  );

  const items = pagedRows
    .map(({ primary, relatedRoleIds, relatedRoleNames }) => {
      const candidId = String(primary.candid_id ?? "").trim();
      const candidate = candidateById.get(candidId);
      if (!candidate) return null;

      const isRevealed = revealMap.get(candidId) === true;
      const payload = {
        ...candidate,
        candidate_mark: candidateMarkMap.get(candidId) ?? null,
        github_profile_preview: githubPreviewByCandidateId.get(candidId) ?? null,
        match: mapMatchRecord({
          relatedRoleIds,
          relatedRoleNames,
          row: primary,
        }),
        scholar_profile_preview: scholarPreviewByCandidateId.get(candidId) ?? null,
        shortlist_memo: isRevealed ? shortlistMemoMap.get(candidId) ?? "" : "",
      };

      return applyListRevealState(payload, isRevealed) as MatchCandidateListItem;
    })
    .filter(Boolean) as MatchCandidateListItem[];

  return {
    hasNext: start + pageSize < groupedRows.length,
    items,
    total: groupedRows.length,
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

  const roles = await fetchWorkspaceRoles({
    admin,
    workspaceId: resolved.workspace.company_workspace_id,
  });
  const roleIds = roles.map((role) => role.roleId);
  const rawRows = await fetchRawMatchRows({
    admin,
    roleId: args.roleId,
    roleIds,
  });
  const candidId = ensureNonEmptyString(args.candidId, "candidId");
  const candidateRows = rawRows.filter(
    (row) => String(row.candid_id ?? "").trim() === candidId
  );

  if (candidateRows.length === 0) {
    throw new Error("Matched candidate not found");
  }

  const sortedRows = [...candidateRows].sort(compareMatchRows);
  const primary = sortedRows[0];
  const relatedRoleIds = sortedRows
    .map((row) => String(row.role_id ?? "").trim())
    .filter(Boolean);
  const relatedRoleNames = sortedRows
    .map((row) => String(row.company_role?.name ?? "").trim())
    .filter(Boolean);
  const role =
    roles.find((item) => item.roleId === String(primary.role_id ?? "")) ?? null;

  return {
    match: mapMatchRecord({
      relatedRoleIds,
      relatedRoleNames,
      row: primary,
    }),
    relatedRoles: roles.filter((item) => relatedRoleIds.includes(item.roleId)),
    role,
    roles,
    workspace: mapWorkspaceRecord({
      membershipRole: resolved.membership?.role ?? null,
      row: resolved.workspace,
    }),
  };
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

  const { data, error } = await ((admin.from("company_role_matched" as any) as any)
    .update({
      feedback_text: feedbackText,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("role_id", roleId)
    .eq("candid_id", candidId)
    .select("id")
    .single());

  if (error) {
    throw new Error(error.message ?? "Failed to update match decision");
  }

  if (!data) {
    throw new Error("Matched candidate not found");
  }

  return fetchMatchCandidateDetail({
    candidId,
    roleId,
    userId: args.userId,
    workspaceId: resolved.workspace.company_workspace_id,
  });
}
