import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { InternalApiError } from "@/lib/internalApi";
import { applyWebsiteCompanyDataChanges } from "@/lib/org/companyDataWebsite";
import { getOrgRoleStatusPresentation } from "@/lib/org/roleStatus";
import {
  describeOpsCompanyProgressActivity,
  describeOpsCompanyRoleRecommendation,
  getOpsCompanyStageLabelKey,
  isHiddenOpsCompanyProgressActivity,
} from "@/lib/ops/companyActivityPresentation";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

type CompanyUserWorkspaceRow = {
  authority: string;
  company_user_id: string;
  company_workspace_id: string;
  created_at: string;
  id: string;
  role: string | null;
  updated_at: string;
};

type CompanyUserRow = {
  created_at: string;
  email: string | null;
  name: string | null;
  profile_picture: string | null;
  role: string | null;
  user_id: string;
};

type TalentUserRow = {
  email: string | null;
  name: string | null;
  profile_picture: string | null;
  user_id: string;
};

type CompanyRoleRow = {
  created_at: string;
  is_expired: boolean | null;
  name: string;
  role_id: string;
  status: string;
  updated_at: string;
};

type RecommendationRow = {
  created_at: string;
  feedback: string | null;
  feedback_at: string | null;
  id: string;
  recommended_at: string;
  role_id: string;
  saved_stage: string | null;
  talent_id: string;
  updated_at: string;
};

type TalentProgressRow = {
  created_at: string;
  id: string;
  kind: string;
  metadata: unknown;
  role_id: string;
  talent_id: string;
  text: string;
};

type RoleStageRow = {
  id: string;
  label: string;
  role_id: string;
};

type TalentMemoRow = {
  content: string;
  created_at: string;
  id: string;
  talent_id: string;
  updated_at: string;
};

type CompanyConversationMessageRow = {
  company_user_id: string | null;
  company_workspace_id: string;
  content: string;
  conversation_id: string;
  created_at: string;
  id: number;
  message_type: string;
  metadata: unknown;
  role: string;
  slack_thread_id: string | null;
  slack_user_id: string | null;
  status: string;
};

export type OpsCompanyMemberRecord = {
  email: string | null;
  joinedAt: string;
  membershipId: string;
  name: string | null;
  profilePicture: string | null;
  role: string | null;
  updatedAt: string;
  userId: string;
};

export type OpsCompanyMembersResponse = {
  items: OpsCompanyMemberRecord[];
  query: string;
  totalCount: number;
  workspaceId: string;
};

export type OpsCompanyActivityKind =
  | "candidate_accepted"
  | "candidate_recommended"
  | "candidate_status_changed"
  | "member_joined"
  | "memo_left"
  | "role_created"
  | "role_deleted"
  | "role_updated";

export type OpsCompanyActivityItem = {
  id: string;
  kind: OpsCompanyActivityKind;
  meta: string | null;
  occurredAt: string;
  subtitle: string | null;
  title: string;
};

export type OpsCompanyActivityResponse = {
  items: OpsCompanyActivityItem[];
  limit: number;
  nextOffset: number | null;
  offset: number;
  totalCount: number;
  workspaceId: string;
};

export type OpsCompanyConversationSource = "slack" | "web";
export type OpsCompanyConversationRole = "assistant" | "user";

export type OpsCompanyConversationItem = {
  content: string;
  conversationId: string;
  messageId: number;
  occurredAt: string;
  role: OpsCompanyConversationRole;
  source: OpsCompanyConversationSource;
  user: {
    email: string | null;
    name: string | null;
    slackUserId: string | null;
  };
};

export type OpsCompanyConversationsResponse = {
  items: OpsCompanyConversationItem[];
  limit: number;
  nextCursor: number | null;
  workspaceId: string;
};

export type OpsCompanyWaitingSource = "/company" | "/test_company2";

export type OpsCompanyWaitingItem = {
  company: string | null;
  createdAt: string;
  email: string;
  hiringNeed: string | null;
  name: string | null;
  requestType: string | null;
  sourcePage: OpsCompanyWaitingSource;
  status: string;
};

export type OpsCompanyWaitingResponse = {
  counts: {
    company: number;
    pending: number;
    testCompany2: number;
    total: number;
  };
  items: OpsCompanyWaitingItem[];
};

export type OpsCompanyWorkspaceUpdateInput = {
  careerUrl: string | null;
  companyDescription: string | null;
  companyName: string;
  homepageUrl: string | null;
  linkedinUrl: string | null;
  logoUrl: string | null;
  pitch: string | null;
  publishedName: string | null;
  request: string | null;
  workspaceId: string;
};

export type OpsCompanyWorkspaceUpdateResponse = {
  ok: true;
  workspace: {
    careerUrl: string | null;
    companyDescription: string | null;
    companyName: string;
    homepageUrl: string | null;
    linkedinUrl: string | null;
    logoUrl: string | null;
    pitch: string | null;
    publishedName: string | null;
    request: string | null;
    updatedAt: string;
    workspaceId: string;
  };
};

export type OpsCompanyRoleAutomationState = {
  isAuto: boolean;
  roleId: string;
};

export type OpsCompanyRoleAutomationUpdateInput = {
  isAuto: boolean;
  roleId: string;
  workspaceId: string;
};

export type OpsCompanyRoleAutomationUpdateResponse = {
  ok: true;
  role: OpsCompanyRoleAutomationState & {
    updatedAt: string;
    workspaceId: string;
  };
};

function coerceJsonArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOptionalText(value: unknown) {
  return String(value ?? "").trim() || null;
}

function normalizeQuery(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getSlackUserName(value: unknown) {
  return normalizeText(getRecord(value).slackUserName) || null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => normalizeText(value)).filter(Boolean))
  );
}

function chunkValues<T>(values: T[], size = 100) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function displayPersonName(
  person: { email?: string | null; name?: string | null } | null | undefined,
  fallback = "이름 없음"
) {
  return (
    normalizeText(person?.name) || normalizeText(person?.email) || fallback
  );
}

function roleStatusLabel(status: string | null | undefined) {
  return status ? getOrgRoleStatusPresentation(status).label : "상태 없음";
}

function isAcceptedFeedback(feedback: string | null | undefined) {
  const normalized = normalizeText(feedback).toLowerCase();
  return (
    normalized === "like" ||
    normalized === "liked" ||
    normalized === "positive" ||
    normalized === "accepted"
  );
}

function isAcceptedRecommendation(row: RecommendationRow) {
  return (
    isAcceptedFeedback(row.feedback) ||
    normalizeText(row.saved_stage).toLowerCase() === "accepted"
  );
}

function isDifferentTimestamp(
  left: string | null | undefined,
  right: string | null | undefined
) {
  if (!left || !right) return false;
  return new Date(left).getTime() !== new Date(right).getTime();
}

async function fetchMembershipRows(args: {
  admin: AdminClient;
  limit?: number;
  workspaceId: string;
}) {
  let query = (args.admin.from("company_user_workspace" as any) as any)
    .select(
      "id, company_user_id, company_workspace_id, authority, role, created_at, updated_at"
    )
    .eq("company_workspace_id", args.workspaceId)
    .order("created_at", { ascending: false }) as any;

  if (args.limit) {
    query = query.limit(args.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message ?? "Failed to load company members");
  }
  return coerceJsonArray<CompanyUserWorkspaceRow>(data);
}

async function fetchCompanyUsersByIds(args: {
  admin: AdminClient;
  userIds: string[];
}) {
  const userIds = uniqueStrings(args.userIds);
  const users = new Map<string, CompanyUserRow>();
  if (userIds.length === 0) return users;

  for (const chunk of chunkValues(userIds)) {
    const { data, error } = await (
      args.admin.from("company_users" as any) as any
    )
      .select("user_id, name, email, profile_picture, role, created_at")
      .in("user_id", chunk);

    if (error) {
      throw new Error(error.message ?? "Failed to load company users");
    }

    for (const row of coerceJsonArray<CompanyUserRow>(data)) {
      const userId = normalizeText(row.user_id);
      if (userId) users.set(userId, row);
    }
  }

  return users;
}

async function fetchTalentUsersByIds(args: {
  admin: AdminClient;
  userIds: string[];
}) {
  const userIds = uniqueStrings(args.userIds);
  const users = new Map<string, TalentUserRow>();
  if (userIds.length === 0) return users;

  for (const chunk of chunkValues(userIds)) {
    const { data, error } = await (
      args.admin.from("talent_users" as any) as any
    )
      .select("user_id, name, email, profile_picture")
      .in("user_id", chunk);

    if (error) {
      throw new Error(error.message ?? "Failed to load talent users");
    }

    for (const row of coerceJsonArray<TalentUserRow>(data)) {
      const userId = normalizeText(row.user_id);
      if (userId) users.set(userId, row);
    }
  }

  return users;
}

async function fetchWorkspaceRoles(args: {
  admin: AdminClient;
  workspaceId: string;
}) {
  const { data, error } = await (args.admin.from("company_roles" as any) as any)
    .select("role_id, name, status, is_expired, created_at, updated_at")
    .eq("company_workspace_id", args.workspaceId)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(error.message ?? "Failed to load company roles");
  }

  return coerceJsonArray<CompanyRoleRow>(data);
}

function mapMemberRecord(args: {
  membership: CompanyUserWorkspaceRow;
  user: CompanyUserRow | null;
}): OpsCompanyMemberRecord {
  return {
    email: args.user?.email ?? null,
    joinedAt: String(args.membership.created_at ?? ""),
    membershipId: String(args.membership.id ?? ""),
    name: args.user?.name ?? null,
    profilePicture: args.user?.profile_picture ?? null,
    role: args.membership.role ?? args.user?.role ?? null,
    updatedAt: String(
      args.membership.updated_at ?? args.membership.created_at ?? ""
    ),
    userId: String(args.membership.company_user_id ?? ""),
  };
}

export async function fetchOpsCompanyMembers(args: {
  query?: string | null;
  workspaceId?: string | null;
}): Promise<OpsCompanyMembersResponse> {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  if (!workspaceId) throw new Error("workspaceId is required");

  const query = normalizeQuery(args.query);
  const memberships = await fetchMembershipRows({ admin, workspaceId });
  const userMap = await fetchCompanyUsersByIds({
    admin,
    userIds: memberships.map((row) => row.company_user_id),
  });

  const items = memberships
    .map((membership) =>
      mapMemberRecord({
        membership,
        user: userMap.get(normalizeText(membership.company_user_id)) ?? null,
      })
    )
    .filter((member) => {
      if (!query) return true;
      return [member.name, member.email, member.role, member.userId]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

  return {
    items,
    query,
    totalCount: items.length,
    workspaceId,
  };
}

export async function fetchOpsCompanyConversations(args: {
  offset?: number | null;
  limit?: number;
  workspaceId?: string | null;
}): Promise<OpsCompanyConversationsResponse> {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  if (!workspaceId) throw new Error("workspaceId is required");

  const limit = Math.max(1, Math.min(Number(args.limit ?? 20) || 20, 20));
  const offset = Math.max(0, Math.floor(Number(args.offset ?? 0) || 0));
  const { data, error } = await (admin.from("company_messages" as any) as any)
    .select(
      "id, company_workspace_id, conversation_id, company_user_id, role, content, message_type, status, slack_thread_id, slack_user_id, metadata, created_at"
    )
    .eq("company_workspace_id", workspaceId)
    .eq("status", "completed")
    .in("role", ["user", "assistant"])
    .in("message_type", ["chat", "slack"])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit);
  if (error) {
    throw new Error(error.message ?? "Failed to load company conversations");
  }

  const rows = coerceJsonArray<CompanyConversationMessageRow>(data);
  const visibleRows = rows.slice(0, limit);
  const companyUserIds = uniqueStrings(
    visibleRows
      .filter((message) => message.role === "user")
      .map((message) => message.company_user_id)
  );
  const companyUsers = await fetchCompanyUsersByIds({
    admin,
    userIds: companyUserIds,
  });
  const items = visibleRows.map<OpsCompanyConversationItem>((message) => {
    const source: OpsCompanyConversationSource =
      message.message_type === "slack" ? "slack" : "web";
    const companyUser = message.company_user_id
      ? (companyUsers.get(normalizeText(message.company_user_id)) ?? null)
      : null;
    const isUserMessage = message.role === "user";

    return {
      content: String(message.content ?? "").trim(),
      conversationId: normalizeText(message.conversation_id),
      messageId: Number(message.id),
      occurredAt: String(message.created_at ?? ""),
      role: isUserMessage ? "user" : "assistant",
      source,
      user: {
        email: isUserMessage ? (companyUser?.email ?? null) : null,
        name: isUserMessage
          ? source === "slack"
            ? getSlackUserName(message.metadata)
            : (companyUser?.name ?? null)
          : null,
        slackUserId:
          isUserMessage && source === "slack"
            ? normalizeOptionalText(message.slack_user_id)
            : null,
      },
    };
  });

  return {
    items,
    limit,
    nextCursor: rows.length > limit ? offset + limit : null,
    workspaceId,
  };
}

async function fetchRecommendations(args: {
  admin: AdminClient;
  limit: number;
  roleIds: string[];
}) {
  if (args.roleIds.length === 0) return [] as RecommendationRow[];
  const { data, error } = await (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(
      "id, talent_id, role_id, feedback, feedback_at, saved_stage, recommended_at, created_at, updated_at"
    )
    .in("role_id", args.roleIds)
    .order("updated_at", { ascending: false })
    .limit(args.limit);

  if (error) {
    throw new Error(error.message ?? "Failed to load recommendations");
  }

  return coerceJsonArray<RecommendationRow>(data);
}

async function fetchTalentProgress(args: {
  admin: AdminClient;
  limit: number;
  roleIds: string[];
}) {
  if (args.roleIds.length === 0) return [] as TalentProgressRow[];
  const { data, error } = await (
    args.admin.from("talent_progress" as any) as any
  )
    .select("id, talent_id, role_id, kind, metadata, text, created_at")
    .in("role_id", args.roleIds)
    .order("created_at", { ascending: false })
    .limit(args.limit);

  if (error) {
    throw new Error(error.message ?? "Failed to load talent progress");
  }

  return coerceJsonArray<TalentProgressRow>(data);
}

async function fetchRoleStages(args: {
  admin: AdminClient;
  roleIds: string[];
}) {
  if (args.roleIds.length === 0) return [] as RoleStageRow[];
  const { data, error } = await (
    args.admin.from("ops_matching_role_stages" as any) as any
  )
    .select("id, role_id, label")
    .in("role_id", args.roleIds)
    .limit(1_000);

  if (error) {
    throw new Error(error.message ?? "Failed to load role stages");
  }

  return coerceJsonArray<RoleStageRow>(data);
}

async function fetchTalentMemos(args: {
  admin: AdminClient;
  limit: number;
  talentIds: string[];
}) {
  const talentIds = uniqueStrings(args.talentIds);
  if (talentIds.length === 0) return [] as TalentMemoRow[];

  const { data, error } = await (
    args.admin.from("talent_ops_profile_memos" as any) as any
  )
    .select("id, talent_id, content, created_at, updated_at")
    .in("talent_id", talentIds)
    .order("updated_at", { ascending: false })
    .limit(args.limit);

  if (error) {
    throw new Error(error.message ?? "Failed to load talent memos");
  }

  return coerceJsonArray<TalentMemoRow>(data);
}

function roleSubtitle(role: CompanyRoleRow) {
  return `현재 상태: ${roleStatusLabel(role.status)}`;
}

function isDeletedRole(role: CompanyRoleRow) {
  const status = normalizeText(role.status);
  return (
    Boolean(role.is_expired) || status === "deleted" || status === "archived"
  );
}

export async function fetchOpsCompanyActivity(args: {
  limit?: number;
  offset?: number;
  workspaceId?: string | null;
}): Promise<OpsCompanyActivityResponse> {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  if (!workspaceId) throw new Error("workspaceId is required");

  const limit = Math.max(1, Math.min(Number(args.limit ?? 20) || 20, 20));
  const offset = Math.max(0, Number(args.offset ?? 0) || 0);
  const sourceLimit = Math.min(200, offset + limit * 4);

  const [roles, members] = await Promise.all([
    fetchWorkspaceRoles({ admin, workspaceId }),
    fetchMembershipRows({ admin, limit: sourceLimit, workspaceId }),
  ]);
  const roleIds = roles
    .map((row) => normalizeText(row.role_id))
    .filter(Boolean);
  const roleById = new Map(
    roles.map((row) => [normalizeText(row.role_id), row])
  );

  const [recommendations, progressRows, roleStages] = await Promise.all([
    fetchRecommendations({ admin, limit: sourceLimit, roleIds }),
    fetchTalentProgress({ admin, limit: sourceLimit, roleIds }),
    fetchRoleStages({ admin, roleIds }),
  ]);
  const customStageLabelByKey = new Map(
    roleStages.map((row) => [
      getOpsCompanyStageLabelKey(row.role_id, row.id),
      normalizeText(row.label) || "회사 지정 단계",
    ])
  );

  const memoTalentIds = uniqueStrings([
    ...recommendations.map((row) => row.talent_id),
    ...progressRows.map((row) => row.talent_id),
  ]);
  const [memos, talentMap, companyUserMap] = await Promise.all([
    fetchTalentMemos({ admin, limit: sourceLimit, talentIds: memoTalentIds }),
    fetchTalentUsersByIds({ admin, userIds: memoTalentIds }),
    fetchCompanyUsersByIds({
      admin,
      userIds: members.map((row) => row.company_user_id),
    }),
  ]);

  const items: OpsCompanyActivityItem[] = [];

  for (const row of recommendations) {
    const talent = talentMap.get(normalizeText(row.talent_id));
    const role = roleById.get(normalizeText(row.role_id));
    const activity = describeOpsCompanyRoleRecommendation({
      candidateName: displayPersonName(talent, "후보자"),
      roleName: role?.name,
    });
    items.push({
      id: `recommendation:${row.id}`,
      kind: "candidate_recommended",
      meta: activity.meta,
      occurredAt: String(row.recommended_at ?? row.created_at ?? ""),
      subtitle: activity.subtitle,
      title: activity.title,
    });

    if (isAcceptedRecommendation(row)) {
      items.push({
        id: `recommendation-accepted:${row.id}`,
        kind: "candidate_accepted",
        meta: "후보자가 역할 추천 수락",
        occurredAt: String(row.feedback_at ?? row.updated_at ?? ""),
        subtitle: role?.name ? role.name : null,
        title: `${displayPersonName(talent, "후보자")} 역할 추천 수락`,
      });
    }
  }

  for (const row of progressRows.filter(
    (row) => !isHiddenOpsCompanyProgressActivity(row)
  )) {
    const talent = talentMap.get(normalizeText(row.talent_id));
    const role = roleById.get(normalizeText(row.role_id));
    const activity = describeOpsCompanyProgressActivity({
      candidateName: displayPersonName(talent, "후보자"),
      customStageLabelByKey,
      progress: {
        kind: row.kind,
        metadata: row.metadata,
        roleId: row.role_id,
        text: row.text,
      },
      roleName: role?.name,
    });
    items.push({
      id: `progress:${row.id}`,
      kind: "candidate_status_changed",
      meta: activity.meta,
      occurredAt: String(row.created_at ?? ""),
      subtitle: activity.subtitle,
      title: activity.title,
    });
  }

  for (const row of memos) {
    const talent = talentMap.get(normalizeText(row.talent_id));
    items.push({
      id: `memo:${row.id}`,
      kind: "memo_left",
      meta: "메모",
      occurredAt: String(row.updated_at ?? row.created_at ?? ""),
      subtitle: normalizeText(row.content).slice(0, 180) || null,
      title: `${displayPersonName(talent, "후보자")} 메모`,
    });
  }

  for (const row of members) {
    const user = companyUserMap.get(normalizeText(row.company_user_id));
    items.push({
      id: `member:${row.id}`,
      kind: "member_joined",
      meta: "새 멤버",
      occurredAt: String(row.created_at ?? ""),
      subtitle: [user?.email, row.role]
        .map(normalizeText)
        .filter(Boolean)
        .join(" · "),
      title: `${displayPersonName(user, "멤버")} 가입`,
    });
  }

  for (const role of roles) {
    items.push({
      id: `role-created:${role.role_id}`,
      kind: "role_created",
      meta: "Role 생성",
      occurredAt: String(role.created_at ?? ""),
      subtitle: roleSubtitle(role),
      title: `${normalizeText(role.name) || "Role"} 생성`,
    });

    if (isDifferentTimestamp(role.updated_at, role.created_at)) {
      const status = normalizeText(role.status);
      const deleted = isDeletedRole(role);
      items.push({
        id: `role-updated:${role.role_id}`,
        kind: deleted ? "role_deleted" : "role_updated",
        meta: deleted
          ? "Role 삭제"
          : status === "paused"
            ? "Role 중단"
            : status === "ended"
              ? "Role 종료"
              : "Role 수정",
        occurredAt: String(role.updated_at ?? role.created_at ?? ""),
        subtitle: roleSubtitle(role),
        title: deleted
          ? `${normalizeText(role.name) || "Role"} 삭제`
          : status === "paused"
            ? `${normalizeText(role.name) || "Role"} 중단`
            : status === "ended"
              ? `${normalizeText(role.name) || "Role"} 종료`
              : `${normalizeText(role.name) || "Role"} 수정`,
      });
    }
  }

  const sortedItems = items
    .filter((item) => item.occurredAt)
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime()
    );
  const hasPossiblyMoreSourceRows =
    recommendations.length === sourceLimit ||
    progressRows.length === sourceLimit ||
    memos.length === sourceLimit ||
    members.length === sourceLimit;
  const nextOffset =
    offset + limit < sortedItems.length
      ? offset + limit
      : hasPossiblyMoreSourceRows && sortedItems.length >= offset + limit
        ? offset + limit
        : null;

  return {
    items: sortedItems.slice(offset, offset + limit),
    limit,
    nextOffset,
    offset,
    totalCount: sortedItems.length,
    workspaceId,
  };
}

function normalizeWaitingSourcePage(
  value: unknown
): OpsCompanyWaitingSource | null {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return null;

  let pathname = rawValue.split(/[?#]/, 1)[0];
  try {
    pathname = new URL(rawValue, "https://matchharper.com").pathname;
  } catch {
    // Keep the relative path parsed above.
  }

  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  if (normalizedPathname === "/company") return "/company";
  if (normalizedPathname === "/test_company2") return "/test_company2";
  return null;
}

function readWaitingSourcePage(
  additional: string | null | undefined
): OpsCompanyWaitingSource | null {
  const pageLine = String(additional ?? "")
    .split("\n")
    .find((line) => line.trim().toLowerCase().startsWith("page:"));
  if (!pageLine) return null;
  return normalizeWaitingSourcePage(pageLine.slice(pageLine.indexOf(":") + 1));
}

export async function fetchOpsCompanyWaiting(): Promise<OpsCompanyWaitingResponse> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("harper_waitlist_company")
    .select("additional, company, created_at, email, name, needs, role, status")
    .eq("is_submit", true)
    .eq("type", "contact_sales")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(error.message ?? "Failed to load company waiting list");
  }

  const items = (data ?? []).flatMap<OpsCompanyWaitingItem>((row) => {
    const sourcePage = readWaitingSourcePage(row.additional);
    if (!sourcePage) return [];

    const hiringNeed = (row.needs ?? [])
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join("\n");

    return [
      {
        company: row.company,
        createdAt: row.created_at,
        email: row.email,
        hiringNeed: hiringNeed || null,
        name: row.name,
        requestType: row.role,
        sourcePage,
        status: normalizeText(row.status) || "pending",
      },
    ];
  });

  return {
    counts: {
      company: items.filter((item) => item.sourcePage === "/company").length,
      pending: items.filter((item) => item.status === "pending").length,
      testCompany2: items.filter((item) => item.sourcePage === "/test_company2")
        .length,
      total: items.length,
    },
    items,
  };
}

export async function updateOpsCompanyWorkspace(
  args: OpsCompanyWorkspaceUpdateInput & { eventActorLabel: string }
): Promise<OpsCompanyWorkspaceUpdateResponse> {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  const companyName = normalizeText(args.companyName);

  if (!workspaceId) throw new Error("workspaceId is required");
  if (!companyName) throw new Error("companyName is required");

  const workspaceSelect =
    "company_workspace_id, company_name, published_name, company_description, pitch, request, homepage_url, career_url, linkedin_url, logo_url, updated_at";
  const payload = {
    career_url: normalizeOptionalText(args.careerUrl),
    company_description: normalizeOptionalText(args.companyDescription),
    company_name: companyName,
    homepage_url: normalizeOptionalText(args.homepageUrl),
    linkedin_url: normalizeOptionalText(args.linkedinUrl),
    logo_url: normalizeOptionalText(args.logoUrl),
    pitch: normalizeOptionalText(args.pitch),
    published_name: normalizeOptionalText(args.publishedName),
    request: normalizeOptionalText(args.request),
  };

  await applyWebsiteCompanyDataChanges({
    actorLabel: args.eventActorLabel,
    admin,
    changes: [
      { key: "company_name", value: payload.company_name },
      {
        key: "company_description",
        value: payload.company_description,
      },
      { key: "pitch", value: payload.pitch },
      { key: "workspace_request", value: payload.request },
      { key: "logo_url", value: payload.logo_url },
      { key: "homepage_url", value: payload.homepage_url },
      { key: "career_url", value: payload.career_url },
      { key: "linkedin_url", value: payload.linkedin_url },
      {
        key: "workspace_published_name",
        value: payload.published_name,
      },
    ],
    workspaceId,
  });
  const { data, error } = await (admin.from("company_workspace" as any) as any)
    .select(workspaceSelect)
    .eq("company_workspace_id", workspaceId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load company workspace");
  }

  return {
    ok: true,
    workspace: {
      careerUrl: data.career_url ?? null,
      companyDescription: data.company_description ?? null,
      companyName: String(data.company_name ?? ""),
      homepageUrl: data.homepage_url ?? null,
      linkedinUrl: data.linkedin_url ?? null,
      logoUrl: data.logo_url ?? null,
      pitch: data.pitch ?? null,
      publishedName: data.published_name ?? null,
      request: data.request ?? null,
      updatedAt: String(data.updated_at ?? ""),
      workspaceId: String(data.company_workspace_id ?? ""),
    },
  };
}

export async function fetchOpsCompanyRoleAutomationStates(args: {
  roleIds: string[];
}): Promise<OpsCompanyRoleAutomationState[]> {
  const roleIds = Array.from(
    new Set(args.roleIds.map(normalizeText).filter(Boolean))
  );
  if (roleIds.length === 0) return [];

  const admin = getSupabaseAdmin();
  const { data, error } = await (
    admin.from("company_internal_roles" as any) as any
  )
    .select("role_id, is_auto")
    .in("role_id", roleIds);

  if (error) {
    throw new Error(error.message ?? "Failed to load role automation states");
  }

  return coerceJsonArray<{ is_auto: boolean | null; role_id: string }>(data)
    .map((row) => ({
      isAuto: row.is_auto === true,
      roleId: normalizeText(row.role_id),
    }))
    .filter((row) => Boolean(row.roleId));
}

export async function updateOpsCompanyRoleAutomation(
  args: OpsCompanyRoleAutomationUpdateInput & { admin?: AdminClient }
): Promise<OpsCompanyRoleAutomationUpdateResponse> {
  const admin = args.admin ?? getSupabaseAdmin();
  const roleId = normalizeText(args.roleId);
  const workspaceId = normalizeText(args.workspaceId);

  if (!workspaceId) throw new InternalApiError(400, "workspaceId is required");
  if (!roleId) throw new InternalApiError(400, "roleId is required");
  if (typeof args.isAuto !== "boolean") {
    throw new InternalApiError(400, "isAuto must be a boolean");
  }

  const { data: role, error: roleError } = await (
    admin.from("company_roles" as any) as any
  )
    .select("role_id")
    .eq("role_id", roleId)
    .eq("company_workspace_id", workspaceId)
    .eq("source_type", "internal")
    .maybeSingle();

  if (roleError) {
    throw new Error(roleError.message ?? "Failed to load role");
  }
  if (!role) {
    throw new InternalApiError(404, "Internal role not found in workspace");
  }

  const now = new Date().toISOString();
  const { data, error } = await (
    admin.from("company_internal_roles" as any) as any
  )
    .update({ is_auto: args.isAuto, updated_at: now })
    .eq("role_id", roleId)
    .select("role_id, is_auto, updated_at")
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to update role automation");
  }
  if (!data) {
    throw new InternalApiError(404, "Internal role settings not found");
  }

  return {
    ok: true,
    role: {
      isAuto: data.is_auto === true,
      roleId: normalizeText(data.role_id),
      updatedAt: String(data.updated_at ?? now),
      workspaceId,
    },
  };
}
