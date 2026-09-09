import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  compileOpsDebugInternalMatching,
  normalizeInternalMatchingDateRange,
  type InternalMatchingProgressSourceRow,
  type InternalMatchingRecommendationSourceRow,
  type InternalMatchingTagSourceRow,
  type OpsDebugInternalMatchingResponse,
  type OpsDebugInternalMatchingRoleMode,
} from "@/lib/ops/internalMatchingAnalytics";

type UntypedAdminClient = ReturnType<typeof getTalentSupabaseAdmin> & {
  from: (table: string) => any;
};

type FetchRowsResult<T> = {
  limitReached: boolean;
  rows: T[];
};

type InternalRoleSource = {
  companyName: string;
  isAuto: boolean;
  roleId: string;
  roleName: string;
  testOnly: boolean;
};

const PAGE_SIZE = 1_000;
const ROLE_ID_CHUNK_SIZE = 75;
const MAX_RECOMMENDATION_SOURCE_ROWS = 50_000;
const MAX_RELATED_SOURCE_ROWS = 100_000;

function toUntypedAdmin(
  admin: ReturnType<typeof getTalentSupabaseAdmin>
): UntypedAdminClient {
  return admin as unknown as UntypedAdminClient;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getFirstRecord(value: unknown) {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isTrue(value: unknown) {
  return (
    value === true ||
    String(value ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function chunkValues<T>(values: T[], size = ROLE_ID_CHUNK_SIZE) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchPagedRows<T>(args: {
  buildQuery: (
    from: number,
    to: number
  ) => Promise<{
    data: T[] | null;
    error: { message?: string } | null;
  }>;
  maxRows: number;
}): Promise<FetchRowsResult<T>> {
  const rows: T[] = [];
  for (let offset = 0; offset <= args.maxRows; offset += PAGE_SIZE) {
    const remaining = args.maxRows + 1 - rows.length;
    const pageSize = Math.min(PAGE_SIZE, remaining);
    if (pageSize <= 0) break;
    const { data, error } = await args.buildQuery(
      offset,
      offset + pageSize - 1
    );
    if (error) throw new Error(error.message || "Failed to load source rows");
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return {
    limitReached: rows.length > args.maxRows,
    rows: rows.slice(0, args.maxRows),
  };
}

function parseRoleRow(value: unknown): InternalRoleSource | null {
  const role = asRecord(value);
  const workspace = getFirstRecord(role.workspace);
  const internalRole = getFirstRecord(role.company_internal_roles);
  const information = asRecord(role.information);
  const roleId = getString(role.role_id);
  if (!roleId) return null;
  return {
    companyName: getString(workspace.company_name) ?? "회사명 없음",
    isAuto: internalRole.is_auto === true,
    roleId,
    roleName: getString(role.name) ?? "Role 이름 없음",
    testOnly: isTrue(information.testOnly),
  };
}

function parseRecommendationRow(
  value: unknown,
  roleById: ReadonlyMap<string, InternalRoleSource>
): InternalMatchingRecommendationSourceRow | null {
  const row = asRecord(value);
  const exposureId = getString(row.id);
  const talentId = getString(row.talent_id);
  const roleId = getString(row.role_id);
  const recommendedAt =
    getString(row.recommended_at) ?? getString(row.created_at);
  if (!exposureId || !talentId || !roleId || !recommendedAt) return null;
  const role = roleById.get(roleId);
  if (!role) return null;

  return {
    clickedAt: getString(row.clicked_at),
    companyName: role.companyName,
    exposureId,
    feedback: getString(row.feedback),
    feedbackAt: getString(row.feedback_at),
    isAuto: role.isAuto,
    processedStage: getString(row.processed_stage),
    recommendedAt,
    roleId,
    roleName: role.roleName,
    talentId,
    testOnly: role.testOnly,
    updatedAt:
      getString(row.updated_at) ?? getString(row.created_at) ?? recommendedAt,
    viewedAt: getString(row.viewed_at),
  };
}

function parseTagRow(value: unknown): InternalMatchingTagSourceRow | null {
  const row = asRecord(value);
  const roleId = getString(row.opportunity_id);
  const talentId = getString(row.talent_id);
  const tag = getString(row.tag);
  const tagId = getString(row.id);
  if (!roleId || !talentId || !tag || !tagId) return null;
  return {
    createdAt: getString(row.created_at) ?? "",
    roleId,
    tag,
    tagId,
    talentId,
    updatedAt: getString(row.updated_at) ?? getString(row.created_at) ?? "",
  };
}

function parseProgressRow(
  value: unknown
): InternalMatchingProgressSourceRow | null {
  const row = asRecord(value);
  const roleId = getString(row.role_id);
  const talentId = getString(row.talent_id);
  if (!roleId || !talentId) return null;
  return {
    createdAt: getString(row.created_at) ?? "",
    metadata: asRecord(row.metadata),
    roleId,
    talentId,
  };
}

async function fetchRecommendationRows(args: {
  admin: UntypedAdminClient;
  endExclusiveIso: string | null;
  roleIds: string[];
}) {
  if (args.roleIds.length === 0) {
    return { limitReached: false, rows: [] } satisfies FetchRowsResult<unknown>;
  }
  return fetchPagedRows<unknown>({
    buildQuery: async (from, to) => {
      let query = args.admin
        .from("talent_opportunity_recommendation")
        .select(
          "id, talent_id, role_id, feedback, feedback_at, processed_stage, recommended_at, created_at, updated_at, viewed_at, clicked_at"
        )
        .in("role_id", args.roleIds);
      if (args.endExclusiveIso) {
        query = query.lt("recommended_at", args.endExclusiveIso);
      }
      return query
        .order("recommended_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
    },
    maxRows: MAX_RECOMMENDATION_SOURCE_ROWS,
  });
}

async function fetchInternalRoleRows(admin: UntypedAdminClient) {
  return fetchPagedRows<unknown>({
    buildQuery: async (from, to) =>
      await admin
        .from("company_roles")
        .select(
          "role_id, name, information, workspace:company_workspace(company_name), company_internal_roles(is_auto)"
        )
        .eq("source_type", "internal")
        .order("role_id", { ascending: true })
        .range(from, to),
    maxRows: 10_000,
  });
}

async function fetchTagRows(args: {
  admin: UntypedAdminClient;
  roleIds: string[];
}) {
  const rows: unknown[] = [];
  let limitReached = false;
  for (const roleIds of chunkValues(args.roleIds)) {
    const remaining = MAX_RELATED_SOURCE_ROWS - rows.length;
    if (remaining <= 0) {
      limitReached = true;
      break;
    }
    const result = await fetchPagedRows<unknown>({
      buildQuery: async (from, to) =>
        await args.admin
          .from("talent_opportunity_tag")
          .select("id, opportunity_id, talent_id, tag, created_at, updated_at")
          .in("opportunity_id", roleIds)
          .like("tag", "내부%")
          .order("updated_at", { ascending: false })
          .range(from, to),
      maxRows: remaining,
    });
    rows.push(...result.rows);
    limitReached ||= result.limitReached;
  }
  return { limitReached, rows };
}

async function fetchProgressRows(args: {
  admin: UntypedAdminClient;
  roleIds: string[];
}) {
  const rows: unknown[] = [];
  let limitReached = false;
  for (const roleIds of chunkValues(args.roleIds)) {
    const remaining = MAX_RELATED_SOURCE_ROWS - rows.length;
    if (remaining <= 0) {
      limitReached = true;
      break;
    }
    const result = await fetchPagedRows<unknown>({
      buildQuery: async (from, to) =>
        await args.admin
          .from("talent_progress")
          .select("role_id, talent_id, metadata, created_at")
          .eq("kind", "org_stage_change")
          .in("role_id", roleIds)
          .order("created_at", { ascending: false })
          .range(from, to),
      maxRows: remaining,
    });
    rows.push(...result.rows);
    limitReached ||= result.limitReached;
  }
  return { limitReached, rows };
}

export function parseOpsDebugInternalMatchingRoleMode(
  value: string | null | undefined
): OpsDebugInternalMatchingRoleMode {
  if (value === "auto" || value === "manual") return value;
  return "all";
}

export async function fetchOpsDebugInternalMatching(args: {
  from?: string | null;
  roleMode?: OpsDebugInternalMatchingRoleMode;
  to?: string | null;
}): Promise<OpsDebugInternalMatchingResponse> {
  const range = normalizeInternalMatchingDateRange({
    from: args.from,
    to: args.to,
  });
  const admin = toUntypedAdmin(getTalentSupabaseAdmin());
  const roleResult = await fetchInternalRoleRows(admin);
  const roles = roleResult.rows
    .map(parseRoleRow)
    .filter((role): role is InternalRoleSource => Boolean(role))
    .filter((role) => {
      if (role.testOnly) return false;
      if (args.roleMode === "auto") return role.isAuto;
      if (args.roleMode === "manual") return !role.isAuto;
      return true;
    });
  const roleById = new Map(roles.map((role) => [role.roleId, role]));
  const roleIds = roles.map((role) => role.roleId);
  const recommendationResult = await fetchRecommendationRows({
    admin,
    endExclusiveIso: range
      ? new Date(range.endExclusiveMs).toISOString()
      : null,
    roleIds,
  });
  const recommendations = recommendationResult.rows
    .map((row) => parseRecommendationRow(row, roleById))
    .filter(Boolean) as InternalMatchingRecommendationSourceRow[];
  const relatedRoleIds = unique(recommendations.map((row) => row.roleId));
  const pairKeys = new Set(
    recommendations.map((row) => `${row.talentId}:${row.roleId}`)
  );
  const [tagResult, progressResult] = await Promise.all([
    fetchTagRows({ admin, roleIds: relatedRoleIds }),
    fetchProgressRows({ admin, roleIds: relatedRoleIds }),
  ]);
  const tags = tagResult.rows
    .map(parseTagRow)
    .filter((row): row is InternalMatchingTagSourceRow =>
      Boolean(row && pairKeys.has(`${row.talentId}:${row.roleId}`))
    );
  const progress = progressResult.rows
    .map(parseProgressRow)
    .filter((row): row is InternalMatchingProgressSourceRow =>
      Boolean(row && pairKeys.has(`${row.talentId}:${row.roleId}`))
    );

  return compileOpsDebugInternalMatching({
    from: range?.from ?? null,
    progress,
    recommendations,
    roleMode: args.roleMode ?? "all",
    sourceLimitReached:
      roleResult.limitReached ||
      recommendationResult.limitReached ||
      tagResult.limitReached ||
      progressResult.limitReached,
    tags,
    to: range?.to ?? null,
  });
}
