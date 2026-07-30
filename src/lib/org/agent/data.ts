import type { OrgRole } from "@/lib/org/server";
import { OrgHttpError } from "@/lib/org/server";
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

type StageCountRow = {
  processed_stage: string | null;
  saved_stage: string | null;
};

const RECOMMENDATION_FIELDS =
  "id, talent_id, role_id, fit_summary, fit_reasons, feedback, feedback_at, feedback_reason, processed_stage, saved_stage, talent_memo, tradeoffs, rank, recommended_at, created_at, updated_at";
const COMPACT_RECOMMENDATION_FIELDS =
  "id, talent_id, role_id, fit_summary, processed_stage, saved_stage, recommended_at, updated_at";

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

function stageOf(row: RecommendationRow) {
  return row.processed_stage || row.saved_stage || "recommended";
}

async function fetchRoleStageCounts(args: {
  admin: OrgAgentAdminClient;
  roleId: string;
  total: number;
}) {
  const pageSize = 1_000;
  const counts = new Map<string, number>();
  let offset = 0;

  while (offset < args.total) {
    const { data, error } = await (
      args.admin.from("talent_opportunity_recommendation" as any) as any
    )
      .select("processed_stage, saved_stage")
      .eq("role_id", args.roleId)
      .range(offset, Math.min(offset + pageSize, args.total) - 1);
    if (error) throw error;

    const rows = (data ?? []) as StageCountRow[];
    for (const row of rows) {
      const stage = row.processed_stage || row.saved_stage || "recommended";
      counts.set(stage, (counts.get(stage) ?? 0) + 1);
    }
    if (rows.length === 0) break;
    offset += rows.length;
  }

  return Array.from(counts, ([stage, count]) => ({ count, stage })).sort(
    (left, right) =>
      right.count - left.count || left.stage.localeCompare(right.stage)
  );
}

function compactJson(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return null;
  const serialized =
    typeof value === "string" ? value : JSON.stringify(value, null, 0);
  return clip(serialized, maxLength) || null;
}

function escapeIlike(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
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
      "role_id, company_workspace_id, name, external_jd_url, description, request, status, type, location_text, work_mode, updated_at"
    )
    .eq("company_workspace_id", args.workspaceId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (
    (data ?? []) as Array<{
      company_workspace_id: string;
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

function compactRecommendation(
  row: RecommendationRow,
  roleById: ReadonlyMap<string, OrgRole>,
  talentById: ReadonlyMap<string, TalentRow>
) {
  const talent = talentById.get(row.talent_id);
  const role = roleById.get(row.role_id);
  return {
    candidate: {
      email: talent?.email ?? null,
      headline: talent?.headline ?? null,
      name: talent?.name ?? talent?.email ?? row.talent_id,
      talentId: row.talent_id,
    },
    fitSummary: clip(row.fit_summary, 400) || null,
    recommendationId: row.id,
    recommendedAt: row.recommended_at,
    role: {
      name: role?.name ?? null,
      roleId: row.role_id,
    },
    stage: stageOf(row),
    updatedAt: row.updated_at,
  };
}

export async function fetchRecentOrgAgentRecommendations(args: {
  admin: OrgAgentAdminClient;
  limit?: number;
  workspaceId: string;
}) {
  const roles = await fetchOrgAgentRoles(args);
  const roleIds = roles.map((role) => role.roleId);
  if (roleIds.length === 0) return [];
  const limit = integer(args.limit, 20, 1, 40);
  const { data, error } = await (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(COMPACT_RECOMMENDATION_FIELDS)
    .in("role_id", roleIds)
    .order("recommended_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as RecommendationRow[];
  const talentById = await fetchTalentsById({
    admin: args.admin,
    talentIds: rows.map((row) => row.talent_id),
  });
  const roleById = new Map(roles.map((role) => [role.roleId, role]));
  return rows.map((row) => compactRecommendation(row, roleById, talentById));
}

async function searchTalentIds(args: {
  admin: OrgAgentAdminClient;
  query: string;
}) {
  if (!args.query) return [];
  const pattern = `%${escapeIlike(args.query)}%`;
  const baseFields = "user_id, name, email, headline";
  const queries = ["name", "email", "headline"].map((column) =>
    (args.admin.from("talent_users" as any) as any)
      .select(baseFields)
      .ilike(column, pattern)
      .limit(50)
  );
  const results = await Promise.all(queries);
  for (const result of results) {
    if (result.error) throw result.error;
  }
  return unique([
    ...(isUuid(args.query) ? [args.query] : []),
    ...results.flatMap((result) =>
      ((result.data ?? []) as TalentRow[]).map((row) => row.user_id)
    ),
  ]);
}

async function fetchRecommendationMatches(args: {
  admin: OrgAgentAdminClient;
  limit: number;
  roleIds: string[];
  talentIds?: string[];
}) {
  if (args.roleIds.length === 0) return [];
  let query = (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(COMPACT_RECOMMENDATION_FIELDS)
    .in("role_id", args.roleIds)
    .order("updated_at", { ascending: false });
  if (args.talentIds) {
    if (args.talentIds.length === 0) return [];
    query = query.in("talent_id", args.talentIds);
  }
  const { data, error } = await query.limit(args.limit);
  if (error) throw error;
  return (data ?? []) as RecommendationRow[];
}

export async function getOrgAgentTalents(args: {
  admin: OrgAgentAdminClient;
  limit?: number;
  offset?: number;
  query?: string | null;
  roleId?: string | null;
  workspaceId: string;
}) {
  const queryText = text(args.query);
  const queryLower = queryText.toLocaleLowerCase();
  const limit = integer(args.limit, 10, 1, 20);
  const offset = integer(args.offset, 0, 0, 200);
  const roles = await fetchOrgAgentRoles(args);
  const roleById = new Map(roles.map((role) => [role.roleId, role]));

  const exactRoleId = text(args.roleId);
  if (exactRoleId && !roleById.has(exactRoleId)) {
    throw new OrgHttpError(404, "Role not found");
  }
  const eligibleRoles = exactRoleId
    ? roles.filter((role) => role.roleId === exactRoleId)
    : roles;
  if (eligibleRoles.length === 0) {
    return { hasMore: false, items: [], limit, offset };
  }

  if (!queryText) {
    const rows = await fetchRecommendationMatches({
      admin: args.admin,
      limit: offset + limit + 1,
      roleIds: eligibleRoles.map((role) => role.roleId),
    });
    const page = rows.slice(offset, offset + limit);
    const talentById = await fetchTalentsById({
      admin: args.admin,
      talentIds: page.map((row) => row.talent_id),
    });
    return {
      hasMore: rows.length > offset + limit,
      items: page.map((row) =>
        compactRecommendation(row, roleById, talentById)
      ),
      limit,
      offset,
    };
  }

  const [talentIds, roleMatches] = await Promise.all([
    searchTalentIds({ admin: args.admin, query: queryText }),
    Promise.resolve(
      eligibleRoles.filter(
        (role) =>
          role.roleId === queryText ||
          role.name.toLocaleLowerCase().includes(queryLower)
      )
    ),
  ]);
  const fetchLimit = Math.min(offset + limit + 1, 221);
  const [candidateMatches, positionMatches] = await Promise.all([
    fetchRecommendationMatches({
      admin: args.admin,
      limit: fetchLimit,
      roleIds: eligibleRoles.map((role) => role.roleId),
      talentIds,
    }),
    fetchRecommendationMatches({
      admin: args.admin,
      limit: fetchLimit,
      roleIds: roleMatches.map((role) => role.roleId),
    }),
  ]);
  const rowById = new Map(
    [...candidateMatches, ...positionMatches].map((row) => [row.id, row])
  );
  const rows = Array.from(rowById.values()).sort(
    (left, right) =>
      (Date.parse(right.updated_at) || 0) - (Date.parse(left.updated_at) || 0)
  );
  const page = rows.slice(offset, offset + limit);
  const talentById = await fetchTalentsById({
    admin: args.admin,
    talentIds: page.map((row) => row.talent_id),
  });
  return {
    hasMore: rows.length > offset + limit,
    items: page.map((row) => compactRecommendation(row, roleById, talentById)),
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
  workspaceId: string;
}) {
  const talentId = text(args.talentId);
  if (!talentId) throw new OrgHttpError(400, "talentId is required");
  const roles = await fetchOrgAgentRoles(args);
  const roleById = new Map(roles.map((role) => [role.roleId, role]));
  const exactRoleId = text(args.roleId);
  if (exactRoleId && !roleById.has(exactRoleId)) {
    throw new OrgHttpError(404, "Role not found");
  }
  const roleIds = exactRoleId
    ? [exactRoleId]
    : roles.map((role) => role.roleId);
  if (roleIds.length === 0) throw new OrgHttpError(404, "Talent not found");

  const [{ data: recommendationData, error: recommendationError }, talentById] =
    await Promise.all([
      (args.admin.from("talent_opportunity_recommendation" as any) as any)
        .select(RECOMMENDATION_FIELDS)
        .eq("talent_id", talentId)
        .in("role_id", roleIds)
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
    .in("role_id", roleIds)
    .order("created_at", { ascending: false })
    .limit(progressLimit);
  if (progressError) throw progressError;

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
    positions: recommendations.map((row) => ({
      existingFeedback: row.feedback,
      feedbackReason: row.feedback_reason,
      fitReasons: stringList(row.fit_reasons),
      fitSummary: clip(row.fit_summary, 700) || null,
      recommendationId: row.id,
      recommendedAt: row.recommended_at,
      roleId: row.role_id,
      roleName: roleById.get(row.role_id)?.name ?? null,
      stage: stageOf(row),
      talentMemo: clip(row.talent_memo, 700) || null,
      tradeoffs: compactJson(row.tradeoffs, 1_000),
      updatedAt: row.updated_at,
    })),
    profile,
    profileIncluded: Boolean(args.includeProfile),
    recentProgress: ((progressData ?? []) as ProgressRow[]).map((row) => ({
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
  workspaceId: string;
}) {
  const role = await assertRoleInWorkspace(args);
  const peopleLimit = integer(args.peopleLimit, 10, 1, 20);
  const peopleOffset = integer(args.peopleOffset, 0, 0, 200);
  const recentUpdateLimit = integer(args.recentUpdateLimit, 10, 0, 20);
  const stage = validateStage(text(args.stage));

  let peopleQuery = (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(COMPACT_RECOMMENDATION_FIELDS, { count: "exact" })
    .eq("role_id", role.roleId)
    .order("updated_at", { ascending: false });
  if (stage === "recommended") {
    peopleQuery = peopleQuery
      .is("processed_stage", null)
      .is("saved_stage", null);
  } else if (stage) {
    peopleQuery = peopleQuery.or(
      `processed_stage.eq.${stage},saved_stage.eq.${stage}`
    );
  }
  const peopleResult = await peopleQuery.range(
    peopleOffset,
    peopleOffset + peopleLimit - 1
  );
  if (peopleResult.error) throw peopleResult.error;
  const peopleRows = (peopleResult.data ?? []) as RecommendationRow[];
  const totalPeople = Number(peopleResult.count ?? 0);

  const [talentById, stageCounts, stageResult, progressResult] =
    await Promise.all([
      fetchTalentsById({
        admin: args.admin,
        talentIds: peopleRows.map((row) => row.talent_id),
      }),
      fetchRoleStageCounts({
        admin: args.admin,
        roleId: role.roleId,
        total: totalPeople,
      }),
      (args.admin.from("ops_matching_role_stages" as any) as any)
        .select("id, label, sort_order")
        .eq("role_id", role.roleId)
        .order("sort_order", { ascending: true }),
      recentUpdateLimit > 0
        ? (args.admin.from("talent_progress" as any) as any)
            .select(
              "created_at, kind, recommendation_id, role_id, talent_id, text, metadata"
            )
            .eq("role_id", role.roleId)
            .order("created_at", { ascending: false })
            .limit(recentUpdateLimit)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (stageResult.error) throw stageResult.error;
  if (progressResult.error) throw progressResult.error;

  const updateTalentById = await fetchTalentsById({
    admin: args.admin,
    talentIds: ((progressResult.data ?? []) as ProgressRow[]).map(
      (row) => row.talent_id
    ),
  });

  return {
    availableStages: [
      { id: "pending_connection", label: "연결 대기" },
      { id: "connected", label: "연결됨" },
      ...(
        (stageResult.data ?? []) as Array<{
          id: string;
          label: string;
        }>
      ).map((row) => ({ id: `custom:${row.id}`, label: row.label })),
      { id: "final_offer", label: "최종 오퍼" },
      { id: "process_stopped", label: "프로세스 중단" },
    ],
    people: {
      hasMore: peopleOffset + peopleRows.length < totalPeople,
      items: peopleRows.map((row) => {
        const talent = talentById.get(row.talent_id);
        return {
          email: talent?.email ?? null,
          fitSummary: clip(row.fit_summary, 500) || null,
          headline: talent?.headline ?? null,
          name: talent?.name ?? talent?.email ?? row.talent_id,
          recommendationId: row.id,
          recommendedAt: row.recommended_at,
          stage: stageOf(row),
          talentId: row.talent_id,
          updatedAt: row.updated_at,
        };
      }),
      limit: peopleLimit,
      offset: peopleOffset,
      selectedStage: stage,
      total: totalPeople,
    },
    recentUpdates: ((progressResult.data ?? []) as ProgressRow[]).map(
      (row) => ({
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
      })
    ),
    role: {
      ...role,
      description: args.includeDescription === false ? null : role.description,
    },
    stageCounts,
  };
}
