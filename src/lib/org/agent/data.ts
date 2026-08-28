import type { User } from "@supabase/supabase-js";
import {
  fetchOrgBoard,
  OrgHttpError,
  type OrgBoardItem,
  type OrgRole,
} from "@/lib/org/server";
import { fetchRoleForOrgAgent } from "@/lib/org/agent/store";
import { buildReadTalentResponseGuide } from "@/lib/org/agent/talentResponseGuide";
import {
  getOrgAgentPipelineBucket,
  humanizeOrgEmploymentType,
  humanizeOrgMembershipRole,
  humanizeOrgProgressKind,
  humanizeOrgRoleStatus,
  humanizeOrgStage,
  humanizeOrgWorkMode,
  isOrgRoleActivelyHiring,
} from "@/lib/org/pipelineStage";
import type {
  OrgAgentMoreDataKind,
  OrgAgentReadAudience,
} from "@/lib/org/agent/types";
import { formatOrgAgentKstDateTime } from "@/lib/org/agent/dateTime";
import { hasOrgWorkspaceAccessBypass } from "@/lib/org/access";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { humanizeCompanyTalentRequestStatus } from "@/lib/companyTalentRequests/server";
import { normalizeOrgRoleCriteria } from "@/lib/org/roleCriteria";
import { fetchOrgProcessClosureNotifications } from "@/lib/org/processClosureNotification";
import { resolveTalentLocation } from "@/lib/talentLocation";

export { serializeOrgAgentMoreData } from "@/lib/org/agent/promptFormat";

export type OrgAgentAdminClient = ReturnType<typeof getSupabaseAdmin>;

export type OrgAgentRole = OrgRole & {
  hasMemory?: boolean;
};

export type OrgAgentRoleInclude =
  | "criteria"
  | "description"
  | "memory"
  | "pipeline";

export type OrgAgentPipelineRoleCounts = {
  active: number;
  complete: boolean;
  ended: number;
  waiting: number;
};

export type OrgAgentMoreDataFieldState = {
  complete: boolean;
  oversized: boolean;
  truncated: boolean;
};

export type OrgAgentMoreDataResult = {
  companyDetails?: {
    complete: boolean;
    fields: Record<string, OrgAgentMoreDataFieldState>;
    values: Record<string, unknown>;
  };
  members?: {
    complete: boolean;
    items: Array<{ email: string | null; name: string | null; role: string }>;
    returnedCount: number;
    totalCount: number;
  };
  requestedKinds: OrgAgentMoreDataKind[];
  workspaceMemory?: {
    complete: boolean;
    content: string | null;
    exists: boolean;
    truncated: boolean;
  };
};

type RecommendationRow = {
  created_at: string;
  feedback: string | null;
  feedback_at: string | null;
  feedback_reason: string | null;
  fit_reasons: unknown;
  fit_summary: string | null;
  id: string;
  processed_stage: string | null;
  rank: number | null;
  recommended_at: string;
  role_id: string;
  saved_stage: string | null;
  talent_id: string;
  talent_memo: string | null;
  tradeoffs: unknown;
  updated_at: string;
};

type TalentRow = {
  bio?: string | null;
  current_location?: string | null;
  email: string | null;
  headline: string | null;
  location?: string | null;
  name: string | null;
  user_id: string;
};

type ProgressRow = {
  created_at: string;
  kind: string;
  metadata: unknown;
  recommendation_id: string | null;
  role_id: string;
  talent_id: string;
  text: string | null;
};

const RECOMMENDATION_FIELDS =
  "id, talent_id, role_id, fit_summary, fit_reasons, feedback, feedback_at, feedback_reason, processed_stage, saved_stage, talent_memo, tradeoffs, rank, recommended_at, created_at, updated_at";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function clip(value: unknown, maxLength: number) {
  const valueText = text(value);
  return valueText.length > maxLength
    ? `${valueText.slice(0, maxLength - 1)}…`
    : valueText;
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(Math.trunc(parsed), min), max)
    : fallback;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

function stringList(value: unknown, maxItems = 6) {
  if (Array.isArray(value)) {
    return value.map(text).filter(Boolean).slice(0, maxItems);
  }
  if (typeof value === "string") {
    try {
      return stringList(JSON.parse(value), maxItems);
    } catch {
      return [clip(value, 300)];
    }
  }
  return [];
}

function compactJson(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return null;
  const serialized =
    typeof value === "string" ? value : JSON.stringify(value, null, 0);
  return clip(serialized, maxLength) || null;
}

async function fetchTalentsById(args: {
  admin: OrgAgentAdminClient;
  includeProfile?: boolean;
  talentIds: string[];
}) {
  const talentIds = unique(args.talentIds);
  if (talentIds.length === 0) return new Map<string, TalentRow>();
  const fields = args.includeProfile
    ? "user_id, name, email, headline, bio, location, current_location"
    : "user_id, name, email, headline, location, current_location";
  const { data, error } = await (args.admin.from("talent_users" as any) as any)
    .select(fields)
    .in("user_id", talentIds)
    .is("deleted_at", null);
  if (error) throw error;
  return new Map(
    ((data ?? []) as TalentRow[]).map((row) => [row.user_id, row])
  );
}

export async function fetchOrgAgentRoles(args: {
  admin: OrgAgentAdminClient;
  workspaceId: string;
}) {
  const { data, error } = await (args.admin.from("company_roles" as any) as any)
    .select(
      "role_id, company_workspace_id, name, external_jd_url, description, salary_range, status, type, location_text, work_mode, created_at, updated_at"
    )
    .eq("company_workspace_id", args.workspaceId)
    .eq("source_type", "internal")
    .not("is_expired", "is", true)
    .order("updated_at", { ascending: false })
    .order("role_id", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    company_workspace_id: string;
    created_at: string;
    description: string | null;
    external_jd_url: string | null;
    location_text: string | null;
    name: string;
    role_id: string;
    salary_range: string | null;
    status: string | null;
    type: string[] | null;
    updated_at: string;
    work_mode: string | null;
  }>;
  const roleIds = rows.map((row) => row.role_id);
  const [internalResult, memoryResult] = await Promise.all([
    roleIds.length > 0
      ? (args.admin.from("company_internal_roles" as any) as any)
          .select("role_id, request, criteria")
          .in("role_id", roleIds)
      : Promise.resolve({ data: [], error: null }),
    roleIds.length > 0
      ? (args.admin.from("company_memories" as any) as any)
          .select("role_id, content")
          .eq("company_workspace_id", args.workspaceId)
          .in("role_id", roleIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (internalResult.error) throw internalResult.error;
  if (memoryResult.error) throw memoryResult.error;
  const requestByRoleId = new Map<string, string | null>(
    (
      (internalResult.data ?? []) as Array<{
        request: string | null;
        role_id: string;
      }>
    ).map((row) => [row.role_id, text(row.request) || null])
  );
  const criteriaByRoleId = new Map(
    (
      (internalResult.data ?? []) as Array<{
        criteria: unknown;
        role_id: string;
      }>
    ).map((row) => [row.role_id, normalizeOrgRoleCriteria(row.criteria)])
  );
  const memoryRoleIds = new Set(
    (
      (memoryResult.data ?? []) as Array<{
        content: string;
        role_id: string;
      }>
    ).flatMap((row) => (text(row.content) ? [row.role_id] : []))
  );
  return rows
    .map(
      (row): OrgAgentRole => ({
        criteria: criteriaByRoleId.get(row.role_id) ?? [],
        createdAt: row.created_at,
        description: row.description ?? null,
        employmentTypes: Array.isArray(row.type) ? row.type : [],
        externalJdUrl: row.external_jd_url ?? null,
        hasMemory: memoryRoleIds.has(row.role_id),
        locationText: row.location_text ?? null,
        name: row.name,
        request: requestByRoleId.get(row.role_id) ?? null,
        roleId: row.role_id,
        salaryRange: row.salary_range ?? null,
        status: row.status ?? null,
        updatedAt: row.updated_at,
        workMode: row.work_mode ?? null,
        workspaceId: row.company_workspace_id,
      })
    )
    .sort((left, right) => {
      const hiring =
        Number(isOrgRoleActivelyHiring(right.status)) -
        Number(isOrgRoleActivelyHiring(left.status));
      if (hiring !== 0) return hiring;
      const updated = right.updatedAt.localeCompare(left.updatedAt);
      if (updated !== 0) return updated;
      const title = left.name.localeCompare(right.name, "ko");
      return title || left.roleId.localeCompare(right.roleId);
    });
}

async function assertRoleInWorkspace(args: {
  admin: OrgAgentAdminClient;
  includeCriteria?: boolean;
  includeMemory?: boolean;
  roleId: string;
  workspaceId: string;
}) {
  const roleId = text(args.roleId);
  if (!roleId) throw new OrgHttpError(400, "roleId is required");
  return fetchRoleForOrgAgent({
    admin: args.admin,
    includeCriteria: args.includeCriteria,
    includeMemory: args.includeMemory,
    roleId,
    workspaceId: args.workspaceId,
  });
}

function compactBoardItem(
  item: OrgBoardItem,
  options?: { includeProfilePicture?: boolean }
) {
  return {
    candidate: {
      email: item.talent.email,
      headline: item.talent.headline,
      name: item.talent.name ?? item.talent.email ?? item.talentId,
      ...(options?.includeProfilePicture
        ? { profilePicture: item.talent.profilePicture }
        : {}),
      talentId: item.talentId,
    },
    fitSummary: clip(item.fitSummary, 400) || null,
    recommendationId: item.recommendationId,
    recommendedAt: item.recommendedAt,
    role: {
      name: item.roleName,
      roleId: item.roleId,
    },
    stage: item.stage,
    updatedAt: item.updatedAt,
  };
}

async function fetchVisibleOrgAgentBoard(args: {
  audience?: OrgAgentReadAudience;
  recommendationIds?: string[] | null;
  roleId?: string | null;
  user: User;
  workspaceId: string;
}) {
  const audience = args.audience ?? "caller";
  // Slack turns can be executed by an installer or an internal fallback user.
  // Removing the bypass-bearing email keeps membership identity but prevents
  // that service actor from enabling accepted/archived internal stages.
  const audienceUser =
    audience === "company_safe"
      ? ({ ...args.user, email: undefined } as User)
      : args.user;
  return fetchOrgBoard({
    includeInternalStages: audience === "caller",
    includeProfileLabels: false,
    recommendationIds: args.recommendationIds,
    roleId: args.roleId,
    user: audienceUser,
    workspaceId: args.workspaceId,
  });
}

function getBoardStageLabel(
  board: Awaited<ReturnType<typeof fetchVisibleOrgAgentBoard>>,
  item: OrgBoardItem
) {
  const custom = board.stages.find(
    (stage) =>
      stage.id === item.stage && (!stage.roleId || stage.roleId === item.roleId)
  );
  return humanizeOrgStage(item.stage, custom?.label);
}

export async function fetchOrgAgentPipelineSnapshot(args: {
  admin: OrgAgentAdminClient;
  audience?: OrgAgentReadAudience;
  recentLimit?: number;
  roleId?: string | null;
  roles?: OrgAgentRole[];
  user: User;
  workspaceId: string;
}) {
  const roles = args.roles ?? (await fetchOrgAgentRoles(args));
  const selectedRoleId = text(args.roleId);
  const scopedRoles = selectedRoleId
    ? roles.filter((role) => role.roleId === selectedRoleId)
    : roles;
  if (selectedRoleId && scopedRoles.length === 0) {
    throw new OrgHttpError(404, "Role not found");
  }
  const roleIds = scopedRoles.map((role) => role.roleId);
  const emptyCounts = new Map<string, OrgAgentPipelineRoleCounts>(
    roleIds.map((roleId) => [
      roleId,
      { active: 0, complete: true, ended: 0, waiting: 0 },
    ])
  );
  if (roleIds.length === 0) {
    return {
      _visibleItems: [] as OrgBoardItem[],
      availableStages: [],
      countsByRoleId: emptyCounts,
      recentComplete: true,
      recentItems: [],
      returnedItems: 0,
      totalRecommendations: 0,
    };
  }

  const [
    board,
    countResult,
    recommendationActivityResult,
    progressResult,
    tagResult,
  ] = await Promise.all([
    fetchVisibleOrgAgentBoard({
      audience: args.audience,
      roleId: selectedRoleId || null,
      user: args.user,
      workspaceId: args.workspaceId,
    }),
    (args.admin.from("talent_opportunity_recommendation" as any) as any)
      .select("id", { count: "exact", head: true })
      .in("role_id", roleIds),
    (args.admin.from("talent_opportunity_recommendation" as any) as any)
      .select("id, talent_id, role_id, updated_at")
      .in("role_id", roleIds)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1_000),
    (args.admin.from("talent_progress" as any) as any)
      .select("id, recommendation_id, role_id, talent_id, created_at")
      .in("role_id", roleIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1_000),
    (args.admin.from("talent_opportunity_tag" as any) as any)
      .select("id, opportunity_id, talent_id, updated_at")
      .in("opportunity_id", roleIds)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1_000),
  ]);
  for (const result of [
    countResult,
    recommendationActivityResult,
    progressResult,
    tagResult,
  ]) {
    if (result.error) throw result.error;
  }

  const totalRecommendations = countResult.count ?? board.items.length;
  let auxiliaryComplete =
    (progressResult.data ?? []).length < 1_000 &&
    (tagResult.data ?? []).length < 1_000 &&
    board.dependencyCompleteness?.connectedProgress === true &&
    board.dependencyCompleteness?.customStages === true &&
    board.dependencyCompleteness?.tags === true;
  const countsComplete = totalRecommendations <= 800 && auxiliaryComplete;
  const countsByRoleId = new Map<string, OrgAgentPipelineRoleCounts>(
    roleIds.map((roleId) => [
      roleId,
      { active: 0, complete: countsComplete, ended: 0, waiting: 0 },
    ])
  );
  for (const item of board.items) {
    const counts = countsByRoleId.get(item.roleId);
    const bucket = getOrgAgentPipelineBucket(item.stage);
    if (!counts || !bucket) continue;
    counts[bucket] += 1;
  }

  const activityByRecommendationId = new Map<string, string>();
  const activityByTalentRole = new Map<string, string>();
  for (const row of (progressResult.data ?? []) as Array<{
    created_at: string;
    recommendation_id: string | null;
    role_id: string;
    talent_id: string;
  }>) {
    if (row.recommendation_id) {
      const current = activityByRecommendationId.get(row.recommendation_id);
      if (!current || row.created_at > current) {
        activityByRecommendationId.set(row.recommendation_id, row.created_at);
      }
    }
    const key = `${row.talent_id}:${row.role_id}`;
    const current = activityByTalentRole.get(key);
    if (!current || row.created_at > current) {
      activityByTalentRole.set(key, row.created_at);
    }
  }
  for (const row of (tagResult.data ?? []) as Array<{
    opportunity_id: string;
    talent_id: string;
    updated_at: string;
  }>) {
    const key = `${row.talent_id}:${row.opportunity_id}`;
    const current = activityByTalentRole.get(key);
    if (!current || row.updated_at > current) {
      activityByTalentRole.set(key, row.updated_at);
    }
  }

  type ActivityRecommendationRow = {
    id: string;
    role_id: string;
    talent_id: string;
    updated_at: string;
  };
  const activityRecommendationRows = [
    ...((recommendationActivityResult.data ??
      []) as ActivityRecommendationRow[]),
  ];
  const latestRecommendationByTalentRole = new Map<
    string,
    ActivityRecommendationRow
  >();
  for (const row of activityRecommendationRows) {
    const key = `${row.talent_id}:${row.role_id}`;
    const existing = latestRecommendationByTalentRole.get(key);
    if (
      !existing ||
      row.updated_at > existing.updated_at ||
      (row.updated_at === existing.updated_at && row.id > existing.id)
    ) {
      latestRecommendationByTalentRole.set(key, row);
    }
  }

  // A tag or progress event can make an old recommendation relevant even when
  // it is outside the newest recommendation page. Resolve only the first 100
  // active talent-role keys, then visibility-check stable recommendation IDs.
  const activeTalentRoleKeys = [...activityByTalentRole.entries()]
    .sort(
      ([leftKey, leftAt], [rightKey, rightAt]) =>
        rightAt.localeCompare(leftAt) || rightKey.localeCompare(leftKey)
    )
    .slice(0, 100)
    .map(([key]) => key);
  const unresolvedKeys = activeTalentRoleKeys.filter(
    (key) => !latestRecommendationByTalentRole.has(key)
  );
  if (unresolvedKeys.length > 0) {
    const unresolvedTalentIds = unique(
      unresolvedKeys.map((key) => key.slice(0, key.lastIndexOf(":")))
    );
    const { data: supplementalData, error: supplementalError } = await (
      args.admin.from("talent_opportunity_recommendation" as any) as any
    )
      .select("id, talent_id, role_id, updated_at")
      .in("role_id", roleIds)
      .in("talent_id", unresolvedTalentIds)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(800);
    if (supplementalError) throw supplementalError;
    if ((supplementalData ?? []).length >= 800) auxiliaryComplete = false;
    const unresolvedSet = new Set(unresolvedKeys);
    for (const row of (supplementalData ?? []) as ActivityRecommendationRow[]) {
      const key = `${row.talent_id}:${row.role_id}`;
      if (!unresolvedSet.has(key)) continue;
      const existing = latestRecommendationByTalentRole.get(key);
      if (
        !existing ||
        row.updated_at > existing.updated_at ||
        (row.updated_at === existing.updated_at && row.id > existing.id)
      ) {
        latestRecommendationByTalentRole.set(key, row);
      }
      activityRecommendationRows.push(row);
    }
  }

  const activityAtByRecommendationId = new Map<string, string>();
  for (const row of activityRecommendationRows) {
    const key = `${row.talent_id}:${row.role_id}`;
    const activityAt = [
      row.updated_at,
      activityByRecommendationId.get(row.id),
      activityByTalentRole.get(key),
    ]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1)!;
    const current = activityAtByRecommendationId.get(row.id);
    if (!current || activityAt > current) {
      activityAtByRecommendationId.set(row.id, activityAt);
    }
  }
  for (const [recommendationId, activityAt] of activityByRecommendationId) {
    const current = activityAtByRecommendationId.get(recommendationId);
    if (!current || activityAt > current) {
      activityAtByRecommendationId.set(recommendationId, activityAt);
    }
  }
  for (const key of activeTalentRoleKeys) {
    const recommendation = latestRecommendationByTalentRole.get(key);
    const activityAt = activityByTalentRole.get(key);
    if (!recommendation || !activityAt) continue;
    const current = activityAtByRecommendationId.get(recommendation.id);
    if (!current || activityAt > current) {
      activityAtByRecommendationId.set(recommendation.id, activityAt);
    }
  }

  const recentLimit = integer(args.recentLimit, 20, 1, 40);
  const activityRecommendationIds = [...activityAtByRecommendationId.entries()]
    .sort(
      ([leftId, leftAt], [rightId, rightAt]) =>
        rightAt.localeCompare(leftAt) || rightId.localeCompare(leftId)
    )
    .slice(0, 1_000)
    .map(([recommendationId]) => recommendationId);
  const activityVisibleItems: OrgBoardItem[] = [];
  let activityRecommendationIdsExhausted =
    activityRecommendationIds.length === 0;
  let activityUniqueVisibleCount = 0;
  for (
    let offset = 0;
    offset < activityRecommendationIds.length;
    offset += 100
  ) {
    const page = await fetchVisibleOrgAgentBoard({
      audience: args.audience,
      recommendationIds: activityRecommendationIds.slice(offset, offset + 100),
      roleId: selectedRoleId || null,
      user: args.user,
      workspaceId: args.workspaceId,
    });
    activityVisibleItems.push(...page.items);
    activityRecommendationIdsExhausted =
      offset + 100 >= activityRecommendationIds.length;
    const uniqueVisibleKeys = new Set(
      activityVisibleItems.map((item) => `${item.talentId}:${item.roleId}`)
    );
    activityUniqueVisibleCount = uniqueVisibleKeys.size;
    if (activityUniqueVisibleCount >= recentLimit) break;
  }

  const deduped = new Map<
    string,
    ReturnType<typeof compactBoardItem> & {
      activityAt: string;
      stageLabel: string;
    }
  >();
  const visibleItemByRecommendationId = new Map<string, OrgBoardItem>();
  for (const item of [...board.items, ...activityVisibleItems]) {
    visibleItemByRecommendationId.set(item.recommendationId, item);
  }
  for (const item of visibleItemByRecommendationId.values()) {
    const key = `${item.talentId}:${item.roleId}`;
    const activityAt = [
      item.updatedAt,
      activityByRecommendationId.get(item.recommendationId),
      activityByTalentRole.get(key),
    ]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1)!;
    const candidate = {
      ...compactBoardItem(item),
      activityAt,
      stageLabel: getBoardStageLabel(board, item),
    };
    const existing = deduped.get(key);
    if (
      !existing ||
      candidate.activityAt > existing.activityAt ||
      (candidate.activityAt === existing.activityAt &&
        candidate.recommendationId > existing.recommendationId)
    ) {
      deduped.set(key, candidate);
    }
  }
  const recentItems = [...deduped.values()]
    .sort(
      (left, right) =>
        right.activityAt.localeCompare(left.activityAt) ||
        right.recommendationId.localeCompare(left.recommendationId)
    )
    .slice(0, recentLimit);

  return {
    _visibleItems: board.items,
    availableStages: board.stages.map((stage) => ({
      id: stage.id,
      label: humanizeOrgStage(stage.id, stage.label),
      roleId: stage.roleId ?? null,
      sortOrder: stage.sortOrder,
    })),
    countsByRoleId,
    recentComplete:
      activityUniqueVisibleCount >= recentLimit ||
      (totalRecommendations <= 1_000 &&
        auxiliaryComplete &&
        activityRecommendationIdsExhausted),
    recentItems,
    returnedItems: recentItems.length,
    totalRecommendations,
  };
}

export async function fetchRecentOrgAgentRecommendations(args: {
  admin: OrgAgentAdminClient;
  audience?: OrgAgentReadAudience;
  limit?: number;
  user: User;
  workspaceId: string;
}) {
  const snapshot = await fetchOrgAgentPipelineSnapshot({
    ...args,
    recentLimit: args.limit,
  });
  return Object.assign(snapshot.recentItems, {
    recentComplete: snapshot.recentComplete,
    returnedItems: snapshot.returnedItems,
  });
}

function addProfileSearchMatch(args: {
  label: string;
  matches: Map<string, string[]>;
  queryLower: string;
  talentId: string;
  values: unknown[];
}) {
  const value = args.values.map(text).filter(Boolean).join(" | ");
  const normalized = value.toLocaleLowerCase();
  const matchIndex = normalized.indexOf(args.queryLower);
  if (matchIndex < 0) return;
  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(value.length, matchIndex + args.queryLower.length + 140);
  const snippet = `${start > 0 ? "…" : ""}${value.slice(start, end)}${
    end < value.length ? "…" : ""
  }`;
  const current = args.matches.get(args.talentId) ?? [];
  if (current.length < 3) {
    current.push(`${args.label}: ${snippet}`);
    args.matches.set(args.talentId, current);
  }
}

async function findOrgAgentProfileMatches(args: {
  admin: OrgAgentAdminClient;
  query: string;
  talentIds: string[];
}) {
  const queryLower = text(args.query).toLocaleLowerCase();
  const matches = new Map<string, string[]>();
  if (!queryLower || args.talentIds.length === 0) return matches;

  const chunks: string[][] = [];
  for (let index = 0; index < args.talentIds.length; index += 100) {
    chunks.push(args.talentIds.slice(index, index + 100));
  }
  const results = await Promise.all(
    chunks.map(async (talentIds) => {
      const [talents, educationResult, experienceResult, extrasResult] =
        await Promise.all([
          fetchTalentsById({
            admin: args.admin,
            includeProfile: true,
            talentIds,
          }),
          (args.admin.from("talent_educations" as any) as any)
            .select("talent_id, school, degree, field, description, memo")
            .in("talent_id", talentIds)
            .limit(1_000),
          (args.admin.from("talent_experiences" as any) as any)
            .select(
              "talent_id, company_name, role, company_location, description, memo"
            )
            .in("talent_id", talentIds)
            .limit(1_000),
          (args.admin.from("talent_extras" as any) as any)
            .select("talent_id, content")
            .in("talent_id", talentIds)
            .limit(1_000),
        ]);
      if (educationResult.error) throw educationResult.error;
      if (experienceResult.error) throw experienceResult.error;
      if (extrasResult.error) throw extrasResult.error;
      return {
        educations: (educationResult.data ?? []) as Array<
          Record<string, unknown>
        >,
        experiences: (experienceResult.data ?? []) as Array<
          Record<string, unknown>
        >,
        extras: (extrasResult.data ?? []) as Array<Record<string, unknown>>,
        talents,
      };
    })
  );

  for (const result of results) {
    for (const [talentId, talent] of result.talents) {
      addProfileSearchMatch({
        label: "profile",
        matches,
        queryLower,
        talentId,
        values: [talent.bio],
      });
    }
    for (const education of result.educations) {
      addProfileSearchMatch({
        label: "education",
        matches,
        queryLower,
        talentId: text(education.talent_id),
        values: [
          education.school,
          education.degree,
          education.field,
          education.description,
          education.memo,
        ],
      });
    }
    for (const experience of result.experiences) {
      addProfileSearchMatch({
        label: "experience",
        matches,
        queryLower,
        talentId: text(experience.talent_id),
        values: [
          experience.company_name,
          experience.role,
          experience.company_location,
          experience.description,
          experience.memo,
        ],
      });
    }
    for (const extraRow of result.extras) {
      for (const extra of compactTalentExtras(extraRow.content)) {
        addProfileSearchMatch({
          label: "extra",
          matches,
          queryLower,
          talentId: text(extraRow.talent_id),
          values: [extra.title, extra.date, extra.description],
        });
      }
    }
  }
  return matches;
}

export async function getOrgAgentTalents(args: {
  admin: OrgAgentAdminClient;
  audience?: OrgAgentReadAudience;
  includeProfilePicture?: boolean;
  limit?: number;
  limitCap?: number;
  offset?: number;
  query?: string | null;
  roleId?: string | null;
  searchProfile?: boolean;
  user: User;
  workspaceId: string;
}) {
  const queryText = text(args.query);
  const queryLower = queryText.toLocaleLowerCase();
  const limitCap = integer(args.limitCap, 20, 1, 200);
  const limit = integer(args.limit, 10, 1, limitCap);
  const offset = integer(args.offset, 0, 0, 200);
  const board = await fetchVisibleOrgAgentBoard({
    audience: args.audience,
    roleId: text(args.roleId) || null,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const profileMatches = args.searchProfile
    ? await findOrgAgentProfileMatches({
        admin: args.admin,
        query: queryText,
        talentIds: unique(board.items.map((item) => item.talentId)),
      })
    : new Map<string, string[]>();
  const rows = board.items
    .filter((item) => {
      if (!queryLower) return true;
      return (
        profileMatches.has(item.talentId) ||
        [
          item.talent.name,
          item.talent.email,
          item.talent.headline,
          item.talentId,
          item.roleName,
          item.roleId,
        ]
          .map((value) => text(value).toLocaleLowerCase())
          .some((value) => value.includes(queryLower))
      );
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const page = rows.slice(offset, offset + limit);
  return {
    hasMore: rows.length > offset + limit,
    items: page.map((item) => ({
      ...compactBoardItem(item, {
        includeProfilePicture: args.includeProfilePicture,
      }),
      ...(profileMatches.has(item.talentId) && {
        profileMatches: profileMatches.get(item.talentId),
      }),
      stageLabel: getBoardStageLabel(board, item),
    })),
    limit,
    offset,
  };
}

function compactProgressMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const compact: Record<string, unknown> = {};
  for (const key of [
    "stage",
    "fromStage",
    "acceptReason",
    "stopNote",
    "reason",
  ]) {
    if (record[key] !== undefined) {
      compact[key] =
        key === "stage" || key === "fromStage"
          ? humanizeOrgStage(record[key])
          : record[key];
    }
  }
  return Object.keys(compact).length > 0 ? compact : null;
}

const HARPER_SHARED_INFORMATION_FIELDS = [
  { key: "next_scope", label: "원하는 다음 역할" },
  { key: "location", label: "선호 근무 지역·방식" },
  { key: "team_style_fit", label: "선호하는 회사·팀 조건" },
  { key: "must_haves", label: "꼭 있어야 하는 조건" },
  { key: "deal_breakers", label: "피하고 싶은 조건" },
] as const;

function hasSensitiveCompensationText(value: string) {
  return /연봉|급여|보상|희망\s*금액|salary|compensation|base\s*pay|total\s*comp|₩|\$|만원|억원|원\s*(이상|이하|정도)/i.test(
    value
  );
}

function hasSensitivePersonalText(value: string) {
  return /성별|남성|여성|인종|민족|결혼|임신|출산|가족|자녀|종교|정치|장애|질병|건강|병력|성적\s*지향|gender|sex\b|race|ethnicity|marital|pregnan|child|family|religion|politic|disabilit|medical|health|sexual\s+orientation/i.test(
    value
  );
}

function safePreferenceValue(value: unknown) {
  const sentences = text(value)
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(
      (item) =>
        !hasSensitiveCompensationText(item) && !hasSensitivePersonalText(item)
    );
  return clip(sentences.join(" "), 600) || null;
}

function formatRequestTimestamp(value: unknown) {
  const formatted = formatOrgAgentKstDateTime(value, { includeYear: true });
  return formatted ? `${formatted} KST` : null;
}

async function readCompanyTalentRequestProjection(args: {
  admin: OrgAgentAdminClient;
  roleById: Map<string, OrgAgentRole>;
  talentId: string;
  workspaceId: string;
}) {
  const [historyResult, documentsResult] = await Promise.all([
    (args.admin.from("company_talent_requests" as any) as any)
      .select(
        "id, role_id, expects_document, request_context, workflow_status, expires_at, created_at, updated_at, approved_at, delivery_subject, delivery_body, draft_revision, deliveries:contact_queue(scheduled_at, sent_at, cancelled_at, status, type)"
      )
      .eq("company_workspace_id", args.workspaceId)
      .eq("talent_id", args.talentId)
      .order("created_at", { ascending: false })
      .limit(5),
    (args.admin.from("talent_documents" as any) as any)
      .select("id, is_public, is_primary")
      .eq("talent_id", args.talentId)
      .eq("kind", "resume")
      .eq("is_primary", true)
      .limit(1),
  ]);
  if (historyResult.error) throw historyResult.error;
  if (documentsResult.error) throw documentsResult.error;
  const historyRows = (historyResult.data ?? []) as Array<
    Record<string, unknown>
  >;
  const primary = (documentsResult.data ?? [])[0] as
    | { id: string; is_public: boolean }
    | undefined;
  return {
    requestHistory: historyRows.map((row) => {
      const delivery = Array.isArray(row.deliveries)
        ? row.deliveries.find(
            (item) => text(item?.type) === "company_request_candidate_delivery"
          )
        : null;
      const workflowStatus = text(row.workflow_status);
      const expiresAt = Date.parse(text(row.expires_at));
      const blocksNewRequest =
        [
          "draft",
          "queued",
          "failed",
          "awaiting_talent",
          "relay_queued",
          "review_required",
        ].includes(workflowStatus) &&
        (!Number.isFinite(expiresAt) || expiresAt > Date.now());
      return {
        approvedAt: formatRequestTimestamp(row.approved_at),
        at: formatRequestTimestamp(delivery?.sent_at ?? row.created_at),
        blocksNewRequest,
        cancelable:
          workflowStatus === "draft" ||
          (["queued", "failed"].includes(text(delivery?.status)) &&
            ["queued", "failed"].includes(workflowStatus)),
        deliveryStatus: text(delivery?.status),
        draftBody: workflowStatus === "draft" ? text(row.delivery_body) : null,
        draftRevision:
          workflowStatus === "draft" ? Number(row.draft_revision ?? 0) : null,
        draftSubject:
          workflowStatus === "draft" ? text(row.delivery_subject) : null,
        label: row.expects_document ? "이력서 요청" : "회사 질문 확인",
        requestId: text(row.id),
        roleId: text(row.role_id),
        roleName: args.roleById.get(text(row.role_id))?.name ?? null,
        scheduledAt: formatRequestTimestamp(delivery?.scheduled_at),
        status: humanizeCompanyTalentRequestStatus({
          ...row,
          delivery_status: text(delivery?.status),
        }),
        topic: text(row.request_context),
        updatedAt: formatRequestTimestamp(row.updated_at),
      };
    }),
    resumeAvailability: primary
      ? primary.is_public
        ? {
            available: true,
            guidance: "후보자 상세에서 확인 가능한 이력서 파일이 있습니다.",
          }
        : {
            available: false,
            guidance:
              "이력서 파일은 있으나 현재 회사 프로필 공개 대상은 아닙니다.",
          }
      : {
          available: false,
          guidance:
            "현재 후보자 프로필에서 확인 가능한 이력서 파일이 없습니다.",
        },
  };
}

async function readHarperSharedInformation(args: {
  admin: OrgAgentAdminClient;
  talentId: string;
}) {
  const { data: insight, error: insightError } = await (
    args.admin.from("talent_insights" as any) as any
  )
    .select("content")
    .eq("talent_id", args.talentId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (insightError) throw insightError;
  const content =
    insight?.content &&
    typeof insight.content === "object" &&
    !Array.isArray(insight.content)
      ? (insight.content as Record<string, unknown>)
      : {};
  return HARPER_SHARED_INFORMATION_FIELDS.map(({ key, label }) => ({
    key,
    label,
    value: safePreferenceValue(content[key]),
  }));
}

function talentExtraEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const extraRecord = value as Record<string, unknown>;
  for (const key of [
    "talent_extras",
    "talentExtras",
    "extras",
    "items",
    "publications",
    "projects",
    "activities",
  ]) {
    if (Array.isArray(extraRecord[key])) return extraRecord[key];
  }
  return [];
}

function compactTalentExtras(value: unknown) {
  return talentExtraEntries(value)
    .flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const extra = item as Record<string, unknown>;
      const title = clip(extra.title ?? extra.name ?? extra.role, 300) || null;
      const date = clip(
        extra.date ?? extra.issued_at ?? extra.published_at ?? extra.start_date,
        100
      );
      const description =
        clip(extra.description ?? extra.content ?? extra.summary, 1_000) ||
        null;
      if (!title && !date && !description) return [];
      return [{ date: date || null, description, title }];
    })
    .slice(0, 5);
}

export async function readOrgAgentTalent(args: {
  admin: OrgAgentAdminClient;
  audience?: OrgAgentReadAudience;
  includeProfile?: boolean;
  progressLimit?: number;
  roleId?: string | null;
  talentId: string;
  user: User;
  workspaceId: string;
}) {
  const talentId = text(args.talentId);
  if (!talentId) throw new OrgHttpError(400, "talentId is required");
  const exactRoleId = text(args.roleId);
  const roles = await fetchOrgAgentRoles(args);
  const roleById = new Map(roles.map((role) => [role.roleId, role]));
  if (exactRoleId && !roleById.has(exactRoleId)) {
    throw new OrgHttpError(404, "Role not found");
  }
  const relevantRoleIds = exactRoleId ? [exactRoleId] : [...roleById.keys()];
  if (relevantRoleIds.length === 0) {
    throw new OrgHttpError(404, "Talent not found in this workspace");
  }
  const [recommendationIdResult, progressRecommendationIdResult] =
    await Promise.all([
      (args.admin.from("talent_opportunity_recommendation" as any) as any)
        .select("id")
        .eq("talent_id", talentId)
        .in("role_id", relevantRoleIds)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(100),
      (args.admin.from("talent_progress" as any) as any)
        .select("recommendation_id")
        .eq("talent_id", talentId)
        .in("role_id", relevantRoleIds)
        .not("recommendation_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
  if (recommendationIdResult.error) throw recommendationIdResult.error;
  if (progressRecommendationIdResult.error) {
    throw progressRecommendationIdResult.error;
  }
  const candidateRecommendationIds = unique([
    ...(progressRecommendationIdResult.data ?? []).map(
      (row: { recommendation_id: string | null }) => row.recommendation_id
    ),
    ...(recommendationIdResult.data ?? []).map((row: { id: string }) => row.id),
  ]).slice(0, 100);
  // Use an ID-scoped visibility read instead of the newest-800 board page.
  // This keeps a recommendation discoverable after a recent progress/tag
  // event even when the recommendation itself is old.
  const board = await fetchVisibleOrgAgentBoard({
    audience: args.audience,
    recommendationIds: candidateRecommendationIds,
    roleId: exactRoleId || null,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const visibleItems = board.items.filter((item) => item.talentId === talentId);
  if (visibleItems.length === 0) {
    throw new OrgHttpError(404, "Talent not found in this workspace");
  }
  const visibleItemByRecommendationId = new Map(
    visibleItems.map((item) => [item.recommendationId, item])
  );
  const recommendationIds = [...visibleItemByRecommendationId.keys()];
  const visibleRoleIds = unique(visibleItems.map((item) => item.roleId));

  const [{ data: recommendationData, error: recommendationError }, talentById] =
    await Promise.all([
      (args.admin.from("talent_opportunity_recommendation" as any) as any)
        .select(RECOMMENDATION_FIELDS)
        .in("id", recommendationIds)
        .order("updated_at", { ascending: false })
        .limit(100),
      fetchTalentsById({
        admin: args.admin,
        includeProfile: Boolean(args.includeProfile),
        talentIds: [talentId],
      }),
    ]);
  if (recommendationError) throw recommendationError;
  const recommendations = (recommendationData ?? []) as RecommendationRow[];
  const talent = talentById.get(talentId);
  if (!talent || recommendations.length === 0) {
    throw new OrgHttpError(404, "Talent not found in this workspace");
  }

  const progressLimit = integer(args.progressLimit, 10, 1, 30);
  const [
    progressResult,
    requestProjection,
    harperSharedInformation,
    processClosureNotifications,
  ] = await Promise.all([
    (args.admin.from("talent_progress" as any) as any)
      .select(
        "created_at, kind, recommendation_id, role_id, talent_id, text, metadata"
      )
      .eq("talent_id", talentId)
      .in("role_id", visibleRoleIds)
      .order("created_at", { ascending: false })
      .limit(Math.max(progressLimit * 5, 50)),
    readCompanyTalentRequestProjection({
      admin: args.admin,
      roleById,
      talentId,
      workspaceId: args.workspaceId,
    }),
    readHarperSharedInformation({
      admin: args.admin,
      talentId,
    }),
    fetchOrgProcessClosureNotifications({
      admin: args.admin,
      roleIds: visibleRoleIds,
      talentId,
    }),
  ]);
  const { data: progressData, error: progressError } = progressResult;
  if (progressError) throw progressError;
  const visibleProgress = ((progressData ?? []) as ProgressRow[])
    .filter(
      (row) =>
        !row.recommendation_id ||
        visibleItemByRecommendationId.has(row.recommendation_id)
    )
    .slice(0, progressLimit);

  let profile: Record<string, unknown> | null = null;
  if (args.includeProfile) {
    const [experienceResult, educationResult, extrasResult] = await Promise.all(
      [
        (args.admin.from("talent_experiences" as any) as any)
          .select(
            "company_name, role, employment_type, company_location, start_date, end_date, description"
          )
          .eq("talent_id", talentId)
          .order("start_date", { ascending: false, nullsFirst: false })
          .limit(8),
        (args.admin.from("talent_educations" as any) as any)
          .select("school, degree, field, start_date, end_date, description")
          .eq("talent_id", talentId)
          .order("start_date", { ascending: false, nullsFirst: false })
          .limit(5),
        (args.admin.from("talent_extras" as any) as any)
          .select("content")
          .eq("talent_id", talentId)
          .maybeSingle(),
      ]
    );
    for (const result of [experienceResult, educationResult, extrasResult]) {
      if (result.error) throw result.error;
    }
    profile = {
      bio: clip(talent.bio, 2_000) || null,
      education: (
        (educationResult.data ?? []) as Array<Record<string, unknown>>
      ).map((item) => ({
        ...item,
        description: clip(item.description, 500) || null,
      })),
      experiences: (
        (experienceResult.data ?? []) as Array<Record<string, unknown>>
      ).map((item) => ({
        ...item,
        description: clip(item.description, 800) || null,
      })),
      extras: compactTalentExtras(extrasResult.data?.content),
      location: resolveTalentLocation(talent),
    };
  }

  const candidateName = talent.name ?? talent.email ?? talentId;
  return {
    candidate: {
      email: talent.email,
      headline: talent.headline,
      name: candidateName,
      talentId,
    },
    positions: recommendations.flatMap((row) => {
      const visibleItem = visibleItemByRecommendationId.get(row.id);
      if (!visibleItem) return [];
      return [
        {
          existingFeedback: row.feedback,
          feedbackReason: row.feedback_reason,
          fitReasons: stringList(row.fit_reasons),
          fitSummary: clip(row.fit_summary, 700) || null,
          recommendationId: row.id,
          recommendedAt: row.recommended_at,
          roleId: row.role_id,
          roleName: roleById.get(row.role_id)?.name ?? null,
          candidateAccepted:
            ["like", "positive"].includes(text(row.feedback).toLowerCase()) ||
            ["accepted", "closed"].includes(
              text(row.saved_stage).toLowerCase()
            ),
          processClosureNotification:
            visibleItem.stage === "process_stopped"
              ? (processClosureNotifications.get(row.role_id) ?? {
                  deliveredAt: null,
                  sentChannel: null,
                  status: "not_sent" as const,
                  stoppedAt: null,
                })
              : null,
          stage: visibleItem.stage,
          stageLabel: getBoardStageLabel(board, visibleItem),
          talentMemo: clip(row.talent_memo, 700) || null,
          tradeoffs: compactJson(row.tradeoffs, 1_000),
          updatedAt: row.updated_at,
        },
      ];
    }),
    profile,
    profileIncluded: Boolean(args.includeProfile),
    responseGuide: buildReadTalentResponseGuide({
      name: candidateName,
      talentId,
    }),
    harperSharedInformation,
    recentProgress: visibleProgress.map((row) => ({
      at: row.created_at,
      kind: humanizeOrgProgressKind(row.kind),
      metadata: compactProgressMetadata(row.metadata),
      recommendationId: row.recommendation_id,
      roleId: row.role_id,
      roleName: roleById.get(row.role_id)?.name ?? null,
      text: clip(row.text, 700) || null,
    })),
    requestHistory: requestProjection.requestHistory,
    resumeAvailability: requestProjection.resumeAvailability,
  };
}

export async function readOrgAgentTalents(args: {
  admin: OrgAgentAdminClient;
  audience?: OrgAgentReadAudience;
  includeProfile?: boolean;
  progressLimit?: number;
  roleId?: string | null;
  talentIds: string[];
  user: User;
  workspaceId: string;
}) {
  const talentIds = unique(args.talentIds);
  if (talentIds.length === 0) {
    throw new OrgHttpError(400, "talentIds is required");
  }
  if (talentIds.length > 10) {
    throw new OrgHttpError(400, "talentIds must contain at most 10 items");
  }

  const byTalentId = new Map<
    string,
    Awaited<ReturnType<typeof readOrgAgentTalent>>
  >();
  const notFoundTalentIds = new Set<string>();
  // Bound concurrency because each candidate read intentionally performs
  // several visibility-scoped reads.
  for (let index = 0; index < talentIds.length; index += 3) {
    const chunk = talentIds.slice(index, index + 3);
    const chunkResults = await Promise.all(
      chunk.map(async (talentId) => {
        try {
          return {
            result: await readOrgAgentTalent({ ...args, talentId }),
            talentId,
          };
        } catch (error) {
          if (
            error instanceof OrgHttpError &&
            error.status === 404 &&
            /Talent not found/.test(error.message)
          ) {
            return { result: null, talentId };
          }
          throw error;
        }
      })
    );
    for (const item of chunkResults) {
      if (item.result) byTalentId.set(item.talentId, item.result);
      else notFoundTalentIds.add(item.talentId);
    }
  }

  const items = talentIds.flatMap((talentId) => {
    const result = byTalentId.get(talentId);
    return result ? [result] : [];
  });
  return {
    items,
    notFoundTalentIds: talentIds.filter((talentId) =>
      notFoundTalentIds.has(talentId)
    ),
    requestedCount: talentIds.length,
    returnedCount: items.length,
  };
}

function validateStage(value: string) {
  if (!value) return null;
  if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(value)) {
    throw new OrgHttpError(400, "stage is invalid");
  }
  return value;
}

function fitRoleLongTextResult(result: Record<string, any>) {
  // Leave room for field markers and the compact base role frame inside the
  // 24k serialized read_role ceiling.
  let remaining = 20_000;
  const fields = result.fieldCompleteness as Record<
    string,
    { complete: boolean; included: boolean; truncated: boolean }
  >;
  const roleCriteria = Array.isArray(result.role?.criteria)
    ? result.role.criteria
    : [];
  if (fields.role_criteria?.included) {
    result.role.criteria = roleCriteria.map((item: unknown) => {
      const source =
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : {};
      const name = String(source.name ?? "");
      const criteria = String(source.criteria ?? "");
      const reservedForName = Math.min(name.length, remaining);
      remaining -= reservedForName;
      const available = Math.max(0, remaining);
      const clippedCriteria =
        criteria.length <= available
          ? criteria
          : available > 0
            ? `${criteria.slice(0, Math.max(0, available - 1))}…`
            : null;
      remaining = Math.max(0, remaining - criteria.length);
      if (clippedCriteria !== criteria) {
        fields.role_criteria.complete = false;
        fields.role_criteria.truncated = true;
      }
      return { criteria: clippedCriteria, name };
    });
  }
  const targets = [
    {
      field: fields.role_request,
      get: () => result.role.request,
      set: (value: string | null) => {
        result.role.request = value;
      },
    },
    {
      field: fields.role_memory,
      get: () => result.memory?.content,
      set: (value: string | null) => {
        if (result.memory) result.memory.content = value;
      },
    },
    {
      field: fields.role_description,
      get: () => result.role.description,
      set: (value: string | null) => {
        result.role.description = value;
      },
    },
  ];
  for (const target of targets) {
    if (!target.field?.included) continue;
    const content = String(target.get() ?? "");
    if (content.length <= remaining) {
      remaining -= content.length;
      continue;
    }
    target.set(
      remaining > 0 ? `${content.slice(0, Math.max(0, remaining - 1))}…` : null
    );
    target.field.complete = false;
    target.field.truncated = true;
    remaining = 0;
  }
}

function fitRolePipelineRows(result: Record<string, any>) {
  const longTextLength = [
    result.role?.request,
    result.memory?.content,
    result.role?.description,
  ].reduce((sum, value) => sum + String(value ?? "").length, 0);
  let remaining = Math.max(0, 20_000 - longTextLength);
  const people = Array.isArray(result.people?.items) ? result.people.items : [];
  const selectedPeople: unknown[] = [];
  for (const item of people) {
    const length = serializedValueLength(item);
    if (length > remaining) break;
    remaining -= length;
    selectedPeople.push(item);
  }
  if (selectedPeople.length < people.length) {
    result.people.items = selectedPeople;
    result.people.hasMore = true;
  }
  const updates = Array.isArray(result.recentUpdates)
    ? result.recentUpdates
    : [];
  const selectedUpdates: unknown[] = [];
  for (const item of updates) {
    const length = serializedValueLength(item);
    if (length > remaining) break;
    remaining -= length;
    selectedUpdates.push(item);
  }
  result.recentUpdates = selectedUpdates;
}

export async function readOrgAgentRole(args: {
  admin: OrgAgentAdminClient;
  audience?: OrgAgentReadAudience;
  exactTitle?: string | null;
  include?: OrgAgentRoleInclude[];
  peopleLimit?: number;
  peopleOffset?: number;
  recentUpdateLimit?: number;
  roleId?: string | null;
  stage?: string | null;
  user: User;
  workspaceId: string;
}): Promise<any> {
  const include = new Set<OrgAgentRoleInclude>(args.include ?? []);
  let roleId = text(args.roleId);
  if (!roleId) {
    const exactTitle = text(args.exactTitle).toLocaleLowerCase();
    if (!exactTitle) {
      throw new OrgHttpError(400, "roleId or exactTitle is required");
    }
    const roles = await fetchOrgAgentRoles(args);
    const matches = roles.filter(
      (role) => text(role.name).toLocaleLowerCase() === exactTitle
    );
    if (matches.length !== 1) {
      return {
        candidates: matches.slice(0, 10).map((role) => ({
          name: role.name,
          roleId: role.roleId,
        })),
        matchStatus: matches.length === 0 ? "not_found" : "ambiguous",
      };
    }
    roleId = matches[0]!.roleId;
  }
  const role = await assertRoleInWorkspace({
    admin: args.admin,
    includeCriteria: include.has("criteria"),
    includeMemory: include.has("memory"),
    roleId,
    workspaceId: args.workspaceId,
  });
  const peopleLimit = integer(args.peopleLimit, 10, 1, 20);
  const peopleOffset = integer(args.peopleOffset, 0, 0, 200);
  const recentUpdateLimit = integer(args.recentUpdateLimit, 10, 0, 20);
  const stage = validateStage(text(args.stage));
  const baseRole = {
    employmentTypes: role.employmentTypes.map(humanizeOrgEmploymentType),
    externalJdUrl: role.externalJdUrl,
    locationText: role.locationText,
    name: role.name,
    roleId: role.roleId,
    salaryRange: role.salaryRange,
    status: humanizeOrgRoleStatus(role.status),
    updatedAt: role.updatedAt,
    workMode: humanizeOrgWorkMode(role.workMode),
  };
  const result: Record<string, unknown> = {
    fieldCompleteness: {
      role_criteria: {
        complete: include.has("criteria"),
        included: include.has("criteria"),
        truncated: false,
      },
      role_description: {
        complete: include.has("description"),
        included: include.has("description"),
        truncated: false,
      },
      role_memory: {
        complete: include.has("memory"),
        included: include.has("memory"),
        truncated: false,
      },
      role_request: {
        complete: include.has("criteria"),
        included: include.has("criteria"),
        truncated: false,
      },
    },
    included: [...include],
    role: {
      ...baseRole,
      ...(include.has("criteria") ? { criteria: role.criteria } : {}),
      ...(include.has("criteria") ? { request: role.request } : {}),
      ...(include.has("description") ? { description: role.description } : {}),
    },
    ...(include.has("memory")
      ? { memory: { content: role.memory, exists: role.hasMemory } }
      : {}),
  };

  fitRoleLongTextResult(result as Record<string, any>);

  if (!include.has("pipeline")) return result;

  const snapshot = await fetchOrgAgentPipelineSnapshot({
    admin: args.admin,
    audience: args.audience,
    recentLimit: 20,
    roleId: role.roleId,
    roles: [
      {
        ...role,
        hasMemory: role.hasMemory,
      },
    ],
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const allItems = [...snapshot._visibleItems].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
  const filteredItems = stage
    ? allItems.filter((item) => item.stage === stage)
    : allItems;
  const peopleItems = filteredItems.slice(
    peopleOffset,
    peopleOffset + peopleLimit
  );
  const visibleRecommendationIds = new Set(
    allItems.map((item) => item.recommendationId)
  );
  const visibleTalentIds = new Set(allItems.map((item) => item.talentId));
  const progressResult =
    recentUpdateLimit > 0
      ? await (args.admin.from("talent_progress" as any) as any)
          .select(
            "created_at, kind, recommendation_id, role_id, talent_id, text, metadata"
          )
          .eq("role_id", role.roleId)
          .order("created_at", { ascending: false })
          .limit(Math.max(recentUpdateLimit * 5, 50))
      : { data: [], error: null };
  if (progressResult.error) throw progressResult.error;
  const visibleProgress = ((progressResult.data ?? []) as ProgressRow[])
    .filter((row) =>
      row.recommendation_id
        ? visibleRecommendationIds.has(row.recommendation_id)
        : visibleTalentIds.has(row.talent_id)
    )
    .slice(0, recentUpdateLimit);
  const updateTalentById = await fetchTalentsById({
    admin: args.admin,
    talentIds: visibleProgress.map((row) => row.talent_id),
  });
  const bucketCounts = snapshot.countsByRoleId.get(role.roleId) ?? {
    active: 0,
    complete: false,
    ended: 0,
    waiting: 0,
  };
  const pipelineResult = {
    ...result,
    availableStages: snapshot.availableStages.map((item) => ({
      kind: item.id.startsWith("custom:") ? "custom" : "built_in",
      label: item.label,
      roleId: item.roleId,
      sortOrder: item.sortOrder,
      stageId: item.id,
    })),
    countsComplete: bucketCounts.complete,
    people: {
      hasMore: peopleOffset + peopleItems.length < filteredItems.length,
      items: peopleItems.map((item) => ({
        currentStageId: item.stage,
        currentStageLabel: humanizeOrgStage(
          item.stage,
          snapshot.availableStages.find(
            (stage) =>
              stage.id === item.stage &&
              (!stage.roleId || stage.roleId === item.roleId)
          )?.label
        ),
        email: item.talent.email,
        fitSummary: clip(item.fitSummary, 500) || null,
        headline: item.talent.headline,
        name: item.talent.name ?? item.talent.email ?? item.talentId,
        recommendedAt: item.recommendedAt,
        stage: humanizeOrgStage(
          item.stage,
          snapshot.availableStages.find(
            (stage) =>
              stage.id === item.stage &&
              (!stage.roleId || stage.roleId === item.roleId)
          )?.label
        ),
        talentId: item.talentId,
        updatedAt: item.updatedAt,
      })),
      limit: peopleLimit,
      offset: peopleOffset,
      selectedStage: stage
        ? humanizeOrgStage(
            stage,
            snapshot.availableStages.find((item) => item.id === stage)?.label
          )
        : null,
      total: filteredItems.length,
    },
    recentUpdates: visibleProgress.map((row) => ({
      at: row.created_at,
      candidateName:
        updateTalentById.get(row.talent_id)?.name ??
        updateTalentById.get(row.talent_id)?.email ??
        row.talent_id,
      kind: humanizeOrgProgressKind(row.kind),
      metadata: compactProgressMetadata(row.metadata),
      talentId: row.talent_id,
      text: clip(row.text, 700) || null,
    })),
    stageCounts: [
      { count: bucketCounts.waiting, stage: "연결 대기" },
      { count: bucketCounts.active, stage: "진행 중" },
      { count: bucketCounts.ended, stage: "프로세스 종료" },
    ],
  };
  fitRolePipelineRows(pipelineResult);
  return pipelineResult;
}

const COMPANY_DETAIL_LONG_KEYS = new Set(["workspace_request"]);

function normalizeMoreDataKinds(values: OrgAgentMoreDataKind[]) {
  const requested = new Set(values);
  return (["members", "company_details", "workspace_memory"] as const).filter(
    (kind) => requested.has(kind)
  );
}

function excerptCompanyDetail(args: {
  full: boolean;
  key: string;
  value: unknown;
}) {
  const value = text(args.value);
  const maxLength = args.full ? 12_000 : 800;
  const truncated = value.length > maxLength;
  return {
    state: {
      complete: !truncated,
      oversized: args.full && truncated,
      truncated,
    } satisfies OrgAgentMoreDataFieldState,
    value: truncated ? `${value.slice(0, maxLength - 1)}…` : value || null,
  };
}

async function fetchOrgAgentMembers(args: {
  admin: OrgAgentAdminClient;
  workspaceId: string;
}) {
  const { data: membershipData, error: membershipError } = await (
    args.admin.from("company_user_workspace" as any) as any
  )
    .select("company_user_id, authority")
    .eq("company_workspace_id", args.workspaceId);
  if (membershipError) throw membershipError;
  const memberships = (membershipData ?? []) as Array<{
    authority: string;
    company_user_id: string;
  }>;
  const userIds = unique(memberships.map((row) => row.company_user_id));
  const userById = new Map<
    string,
    { email: string | null; name: string | null }
  >();
  if (userIds.length > 0) {
    const { data, error } = await (
      args.admin.from("company_users" as any) as any
    )
      .select("user_id, name, email")
      .in("user_id", userIds);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{
      email: string | null;
      name: string | null;
      user_id: string;
    }>) {
      if (!hasOrgWorkspaceAccessBypass(row.email)) {
        userById.set(row.user_id, { email: row.email, name: row.name });
      }
    }
  }
  const order: Record<string, number> = { admin: 1, owner: 0, viewer: 2 };
  const allItems = memberships
    .flatMap((membership) => {
      const user = userById.get(membership.company_user_id);
      return user
        ? [
            {
              email: user.email,
              name: user.name,
              rawRole: membership.authority,
              role: humanizeOrgMembershipRole(membership.authority),
            },
          ]
        : [];
    })
    .sort(
      (left, right) =>
        (order[text(left.rawRole).toLowerCase()] ?? 3) -
          (order[text(right.rawRole).toLowerCase()] ?? 3) ||
        text(left.name).localeCompare(text(right.name), "ko") ||
        text(left.email).localeCompare(text(right.email))
    );
  const items = allItems.slice(0, 100).map(({ rawRole: _, ...item }) => item);
  return {
    complete: items.length === allItems.length,
    items,
    returnedCount: items.length,
    totalCount: allItems.length,
  };
}

async function fetchOrgAgentCompanyDetails(args: {
  admin: OrgAgentAdminClient;
  fullTextKeys: string[];
  workspaceId: string;
}) {
  const { data: workspace, error: workspaceError } = await (
    args.admin.from("company_workspace" as any) as any
  )
    .select(
      "company_workspace_id, company_db_id, company_name, request, homepage_url, career_url, linkedin_url"
    )
    .eq("company_workspace_id", args.workspaceId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace) throw new OrgHttpError(404, "Workspace not found");
  const [companyDataResult, companyDbResult] = await Promise.all([
    (args.admin.from("company_data" as any) as any)
      .select("total_funding_raised, last_funding_stage")
      .eq("company_workspace_id", args.workspaceId)
      .maybeSingle(),
    workspace.company_db_id
      ? (args.admin.from("company_db" as any) as any)
          .select(
            "funding_url, location, founded_year, employee_count_range, related_links"
          )
          .eq("id", workspace.company_db_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (companyDataResult.error) throw companyDataResult.error;
  if (companyDbResult.error) throw companyDbResult.error;
  const companyData = companyDataResult.data ?? {};
  const companyDb = companyDbResult.data ?? {};
  const employeeRange =
    companyDb.employee_count_range &&
    typeof companyDb.employee_count_range === "object" &&
    !Array.isArray(companyDb.employee_count_range)
      ? (companyDb.employee_count_range as Record<string, unknown>)
      : {};
  const rawValues: Record<string, unknown> = {
    company_name: workspace.company_name,
    employee_count_end: employeeRange.end,
    employee_count_start: employeeRange.start,
    founded_year: companyDb.founded_year,
    homepage_url: workspace.homepage_url,
    last_funding_stage: companyData.last_funding_stage,
    linkedin_url: workspace.linkedin_url,
    location: companyDb.location,
    related_links: unique([
      workspace.career_url,
      companyDb.funding_url,
      ...stringList(companyDb.related_links, 30),
    ]).slice(0, 12),
    total_funding_raised: companyData.total_funding_raised,
    workspace_request: workspace.request,
  };
  const fullTextKeys = new Set(args.fullTextKeys);
  const values: Record<string, unknown> = {};
  const fields: Record<string, OrgAgentMoreDataFieldState> = {};
  for (const [key, value] of Object.entries(rawValues)) {
    if (COMPANY_DETAIL_LONG_KEYS.has(key)) {
      const bounded = excerptCompanyDetail({
        full: fullTextKeys.has(key),
        key,
        value,
      });
      values[key] = bounded.value;
      fields[key] = bounded.state;
    } else {
      values[key] = value ?? null;
      fields[key] = { complete: true, oversized: false, truncated: false };
    }
  }
  return {
    complete: Object.values(fields).every((field) => field.complete),
    fields,
    values,
  };
}

export async function fetchOrgAgentWorkspaceMemory(args: {
  admin: OrgAgentAdminClient;
  workspaceId: string;
}) {
  const { data, error } = await (
    args.admin.from("company_memories" as any) as any
  )
    .select("content")
    .eq("company_workspace_id", args.workspaceId)
    .is("role_id", null)
    .maybeSingle();
  if (error) throw error;
  const content = text(data?.content) || null;
  const truncated = Boolean(content && content.length > 12_000);
  return {
    complete: !truncated,
    content: truncated ? `${content!.slice(0, 11_999)}…` : content,
    exists: Boolean(content),
    truncated,
  };
}

export async function fetchOrgAgentWorkspaceAvailability(args: {
  admin: OrgAgentAdminClient;
  workspace: {
    careerUrl?: string | null;
    companyDbId?: number | null;
    homepageUrl?: string | null;
    linkedinUrl?: string | null;
    request: string | null;
    workspaceId: string;
  };
}) {
  const [memory, companyDataResult] = await Promise.all([
    fetchOrgAgentWorkspaceMemory({
      admin: args.admin,
      workspaceId: args.workspace.workspaceId,
    }),
    (args.admin.from("company_data" as any) as any)
      .select("company_workspace_id")
      .eq("company_workspace_id", args.workspace.workspaceId)
      .maybeSingle(),
  ]);
  if (companyDataResult.error) throw companyDataResult.error;
  return {
    companyDetailsAvailable: Boolean(
      text(args.workspace.request) ||
      text(args.workspace.homepageUrl) ||
      text(args.workspace.linkedinUrl) ||
      text(args.workspace.careerUrl) ||
      args.workspace.companyDbId ||
      companyDataResult.data
    ),
    workspaceMemoryAvailable: memory.exists,
  };
}

function serializedValueLength(value: unknown) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") return value.length;
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value).length;
  }
}

function fitOrgAgentMoreDataContent(args: {
  fullTextKeys: string[];
  result: OrgAgentMoreDataResult;
}) {
  const actual: Record<OrgAgentMoreDataKind, number> = {
    company_details: args.result.companyDetails
      ? Object.values(args.result.companyDetails.values).reduce<number>(
          (sum, value) => sum + serializedValueLength(value),
          0
        )
      : 0,
    members: args.result.members
      ? args.result.members.items.reduce(
          (sum, item) =>
            sum +
            serializedValueLength(item.name) +
            serializedValueLength(item.email) +
            serializedValueLength(item.role),
          0
        )
      : 0,
    workspace_memory: serializedValueLength(
      args.result.workspaceMemory?.content
    ),
  };
  const minimum: Record<OrgAgentMoreDataKind, number> = {
    company_details: 4_000,
    members: 2_000,
    workspace_memory: 4_000,
  };
  const targets: Record<OrgAgentMoreDataKind, number> = {
    company_details: 0,
    members: 0,
    workspace_memory: 0,
  };
  for (const kind of args.result.requestedKinds) {
    targets[kind] = Math.min(actual[kind], minimum[kind]);
  }
  // The fixed schema adds less than 2k of field names, completeness flags,
  // and TSV framing. Keeping actual values at 12k therefore preserves a full
  // 12k memory read while staying under the 14k transport ceiling.
  let remaining =
    12_000 - Object.values(targets).reduce((sum, value) => sum + value, 0);
  for (const kind of [
    "company_details",
    "workspace_memory",
    "members",
  ] as const) {
    if (!args.result.requestedKinds.includes(kind) || remaining <= 0) continue;
    const extra = Math.min(actual[kind] - targets[kind], remaining);
    targets[kind] += extra;
    remaining -= extra;
  }

  if (args.result.members) {
    let used = 0;
    const items = args.result.members.items.filter((item) => {
      const length =
        serializedValueLength(item.name) +
        serializedValueLength(item.email) +
        serializedValueLength(item.role);
      if (used + length > targets.members) return false;
      used += length;
      return true;
    });
    args.result.members.items = items;
    args.result.members.returnedCount = items.length;
    args.result.members.complete =
      items.length === args.result.members.totalCount;
  }

  if (args.result.companyDetails) {
    const fullTextKeys = new Set(args.fullTextKeys);
    const keys = Object.keys(args.result.companyDetails.values).sort((a, b) => {
      const aLong = COMPANY_DETAIL_LONG_KEYS.has(a);
      const bLong = COMPANY_DETAIL_LONG_KEYS.has(b);
      if (aLong !== bLong) return aLong ? 1 : -1;
      const aFull = fullTextKeys.has(a);
      const bFull = fullTextKeys.has(b);
      if (aFull !== bFull) return aFull ? -1 : 1;
      return a.localeCompare(b);
    });
    let used = 0;
    for (const key of keys) {
      const value = args.result.companyDetails.values[key];
      const length = serializedValueLength(value);
      const available = Math.max(0, targets.company_details - used);
      if (length <= available) {
        used += length;
        continue;
      }
      if (typeof value === "string" && available > 0) {
        args.result.companyDetails.values[key] = `${value.slice(
          0,
          Math.max(0, available - 1)
        )}…`;
        used += available;
      } else {
        args.result.companyDetails.values[key] = null;
      }
      const state = args.result.companyDetails.fields[key];
      if (state) {
        state.complete = false;
        state.truncated = true;
      }
    }
    args.result.companyDetails.complete = Object.values(
      args.result.companyDetails.fields
    ).every((field) => field.complete);
  }

  if (args.result.workspaceMemory?.content) {
    const value = args.result.workspaceMemory.content;
    if (value.length > targets.workspace_memory) {
      args.result.workspaceMemory.content =
        targets.workspace_memory > 0
          ? `${value.slice(0, Math.max(0, targets.workspace_memory - 1))}…`
          : null;
      args.result.workspaceMemory.complete = false;
      args.result.workspaceMemory.truncated = true;
    }
  }
}

export async function getOrgAgentMoreData(args: {
  admin: OrgAgentAdminClient;
  fullTextKeys?: string[];
  kinds: OrgAgentMoreDataKind[];
  workspaceId: string;
}): Promise<OrgAgentMoreDataResult> {
  const requestedKinds = normalizeMoreDataKinds(args.kinds);
  if (requestedKinds.length === 0) {
    throw new OrgHttpError(400, "At least one data kind is required");
  }
  const invalidFullTextKey = (args.fullTextKeys ?? []).find(
    (key) => !COMPANY_DETAIL_LONG_KEYS.has(text(key))
  );
  if (invalidFullTextKey) {
    throw new OrgHttpError(
      400,
      `Unsupported full text key: ${invalidFullTextKey}`
    );
  }
  if (
    (args.fullTextKeys?.length ?? 0) > 0 &&
    !requestedKinds.includes("company_details")
  ) {
    throw new OrgHttpError(
      400,
      "fullTextKeys requires the company_details kind"
    );
  }
  const [members, companyDetails, workspaceMemory] = await Promise.all([
    requestedKinds.includes("members")
      ? fetchOrgAgentMembers(args)
      : Promise.resolve(undefined),
    requestedKinds.includes("company_details")
      ? fetchOrgAgentCompanyDetails({
          ...args,
          fullTextKeys: unique(args.fullTextKeys ?? []),
        })
      : Promise.resolve(undefined),
    requestedKinds.includes("workspace_memory")
      ? fetchOrgAgentWorkspaceMemory(args)
      : Promise.resolve(undefined),
  ]);
  const result: OrgAgentMoreDataResult = {
    ...(companyDetails ? { companyDetails } : {}),
    ...(members ? { members } : {}),
    requestedKinds,
    ...(workspaceMemory ? { workspaceMemory } : {}),
  };
  fitOrgAgentMoreDataContent({
    fullTextKeys: args.fullTextKeys ?? [],
    result,
  });
  return result;
}
