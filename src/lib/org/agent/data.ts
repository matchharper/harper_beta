import type { User } from "@supabase/supabase-js";
import {
  fetchOrgBoard,
  OrgHttpError,
  type OrgBoardItem,
  type OrgRole,
} from "@/lib/org/server";
import { fetchRoleForOrgAgent } from "@/lib/org/agent/store";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export type OrgAgentAdminClient = ReturnType<typeof getSupabaseAdmin>;

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
  resume_text?: string | null;
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
    ? "user_id, name, email, headline, bio, current_location, location, resume_text"
    : "user_id, name, email, headline, current_location, location";
  const { data, error } = await (args.admin.from("talent_users" as any) as any)
    .select(fields)
    .in("user_id", talentIds);
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
      "role_id, company_workspace_id, name, external_jd_url, description, request, status, type, location_text, work_mode, created_at, updated_at"
    )
    .eq("company_workspace_id", args.workspaceId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (
    (data ?? []) as Array<{
      company_workspace_id: string;
      created_at: string;
      description: string | null;
      external_jd_url: string | null;
      location_text: string | null;
      name: string;
      request: string | null;
      role_id: string;
      status: string | null;
      type: string[] | null;
      updated_at: string;
      work_mode: string | null;
    }>
  ).map(
    (row): OrgRole => ({
      createdAt: row.created_at,
      description: row.description ?? null,
      employmentTypes: Array.isArray(row.type) ? row.type : [],
      externalJdUrl: row.external_jd_url ?? null,
      locationText: row.location_text ?? null,
      name: row.name,
      request: row.request ?? null,
      roleId: row.role_id,
      status: row.status ?? null,
      updatedAt: row.updated_at,
      workMode: row.work_mode ?? null,
      workspaceId: row.company_workspace_id,
    })
  );
}

async function assertRoleInWorkspace(args: {
  admin: OrgAgentAdminClient;
  roleId: string;
  workspaceId: string;
}) {
  const roleId = text(args.roleId);
  if (!roleId) throw new OrgHttpError(400, "roleId is required");
  return fetchRoleForOrgAgent({
    admin: args.admin,
    roleId,
    workspaceId: args.workspaceId,
  });
}

function compactBoardItem(item: OrgBoardItem) {
  return {
    candidate: {
      email: item.talent.email,
      headline: item.talent.headline,
      name: item.talent.name ?? item.talent.email ?? item.talentId,
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
  roleId?: string | null;
  user: User;
  workspaceId: string;
}) {
  return fetchOrgBoard({
    includeInternalStages: true,
    includeProfileLabels: false,
    roleId: args.roleId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
}

export async function fetchRecentOrgAgentRecommendations(args: {
  admin: OrgAgentAdminClient;
  limit?: number;
  user: User;
  workspaceId: string;
}) {
  const limit = integer(args.limit, 20, 1, 40);
  const board = await fetchVisibleOrgAgentBoard(args);
  return board.items
    .sort((left, right) =>
      right.recommendedAt.localeCompare(left.recommendedAt)
    )
    .slice(0, limit)
    .map(compactBoardItem);
}

export async function getOrgAgentTalents(args: {
  admin: OrgAgentAdminClient;
  limit?: number;
  offset?: number;
  query?: string | null;
  roleId?: string | null;
  user: User;
  workspaceId: string;
}) {
  const queryText = text(args.query);
  const queryLower = queryText.toLocaleLowerCase();
  const limit = integer(args.limit, 10, 1, 20);
  const offset = integer(args.offset, 0, 0, 200);
  const board = await fetchVisibleOrgAgentBoard({
    roleId: text(args.roleId) || null,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const rows = board.items
    .filter((item) => {
      if (!queryLower) return true;
      return [
        item.talent.name,
        item.talent.email,
        item.talent.headline,
        item.talentId,
        item.roleName,
        item.roleId,
      ]
        .map((value) => text(value).toLocaleLowerCase())
        .some((value) => value.includes(queryLower));
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const page = rows.slice(offset, offset + limit);
  return {
    hasMore: rows.length > offset + limit,
    items: page.map(compactBoardItem),
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
    if (record[key] !== undefined) compact[key] = record[key];
  }
  return Object.keys(compact).length > 0 ? compact : null;
}

export async function readOrgAgentTalent(args: {
  admin: OrgAgentAdminClient;
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
  const [roles, board] = await Promise.all([
    fetchOrgAgentRoles(args),
    fetchVisibleOrgAgentBoard({
      roleId: exactRoleId || null,
      user: args.user,
      workspaceId: args.workspaceId,
    }),
  ]);
  const roleById = new Map(roles.map((role) => [role.roleId, role]));
  if (exactRoleId && !roleById.has(exactRoleId)) {
    throw new OrgHttpError(404, "Role not found");
  }
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
  const { data: progressData, error: progressError } = await (
    args.admin.from("talent_progress" as any) as any
  )
    .select(
      "created_at, kind, recommendation_id, role_id, talent_id, text, metadata"
    )
    .eq("talent_id", talentId)
    .in("role_id", visibleRoleIds)
    .order("created_at", { ascending: false })
    .limit(Math.max(progressLimit * 5, 50));
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
            "company_name, role, employment_type, company_location, start_date, end_date, description, memo"
          )
          .eq("talent_id", talentId)
          .order("start_date", { ascending: false, nullsFirst: false })
          .limit(8),
        (args.admin.from("talent_educations" as any) as any)
          .select(
            "school, degree, field, start_date, end_date, description, memo"
          )
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
        memo: clip(item.memo, 300) || null,
      })),
      experiences: (
        (experienceResult.data ?? []) as Array<Record<string, unknown>>
      ).map((item) => ({
        ...item,
        description: clip(item.description, 800) || null,
        memo: clip(item.memo, 400) || null,
      })),
      extras: compactJson(extrasResult.data?.content, 2_000),
      location: talent.current_location ?? talent.location ?? null,
      resumeExcerpt: clip(talent.resume_text, 4_000) || null,
    };
  }

  return {
    candidate: {
      email: talent.email,
      headline: talent.headline,
      name: talent.name ?? talent.email ?? talentId,
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
          stage: visibleItem.stage,
          talentMemo: clip(row.talent_memo, 700) || null,
          tradeoffs: compactJson(row.tradeoffs, 1_000),
          updatedAt: row.updated_at,
        },
      ];
    }),
    profile,
    profileIncluded: Boolean(args.includeProfile),
    recentProgress: visibleProgress.map((row) => ({
      at: row.created_at,
      kind: row.kind,
      metadata: compactProgressMetadata(row.metadata),
      recommendationId: row.recommendation_id,
      roleId: row.role_id,
      roleName: roleById.get(row.role_id)?.name ?? null,
      text: clip(row.text, 700) || null,
    })),
  };
}

function validateStage(value: string) {
  if (!value) return null;
  if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(value)) {
    throw new OrgHttpError(400, "stage is invalid");
  }
  return value;
}

export async function readOrgAgentRole(args: {
  admin: OrgAgentAdminClient;
  includeDescription?: boolean;
  peopleLimit?: number;
  peopleOffset?: number;
  recentUpdateLimit?: number;
  roleId: string;
  stage?: string | null;
  user: User;
  workspaceId: string;
}) {
  const [role, board] = await Promise.all([
    assertRoleInWorkspace(args),
    fetchVisibleOrgAgentBoard({
      roleId: args.roleId,
      user: args.user,
      workspaceId: args.workspaceId,
    }),
  ]);
  const peopleLimit = integer(args.peopleLimit, 10, 1, 20);
  const peopleOffset = integer(args.peopleOffset, 0, 0, 200);
  const recentUpdateLimit = integer(args.recentUpdateLimit, 10, 0, 20);
  const stage = validateStage(text(args.stage));
  const allItems = [...board.items].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
  const filteredItems = stage
    ? allItems.filter((item) => item.stage === stage)
    : allItems;
  const totalPeople = filteredItems.length;
  const peopleItems = filteredItems.slice(
    peopleOffset,
    peopleOffset + peopleLimit
  );
  const countByStage = new Map<string, number>();
  for (const item of allItems) {
    countByStage.set(item.stage, (countByStage.get(item.stage) ?? 0) + 1);
  }
  const stageCounts = board.stages.map((item) => ({
    count: countByStage.get(item.id) ?? 0,
    stage: item.id,
  }));
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

  return {
    availableStages: board.stages.map((item) => ({
      id: item.id,
      label: item.label,
    })),
    people: {
      hasMore: peopleOffset + peopleItems.length < totalPeople,
      items: peopleItems.map((item) => ({
        email: item.talent.email,
        fitSummary: clip(item.fitSummary, 500) || null,
        headline: item.talent.headline,
        name: item.talent.name ?? item.talent.email ?? item.talentId,
        recommendationId: item.recommendationId,
        recommendedAt: item.recommendedAt,
        stage: item.stage,
        talentId: item.talentId,
        updatedAt: item.updatedAt,
      })),
      limit: peopleLimit,
      offset: peopleOffset,
      selectedStage: stage,
      total: totalPeople,
    },
    recentUpdates: visibleProgress.map((row) => ({
      at: row.created_at,
      candidateName:
        updateTalentById.get(row.talent_id)?.name ??
        updateTalentById.get(row.talent_id)?.email ??
        row.talent_id,
      kind: row.kind,
      metadata: compactProgressMetadata(row.metadata),
      recommendationId: row.recommendation_id,
      talentId: row.talent_id,
      text: clip(row.text, 700) || null,
    })),
    role: {
      ...role,
      description: args.includeDescription === false ? null : role.description,
    },
    stageCounts,
  };
}
