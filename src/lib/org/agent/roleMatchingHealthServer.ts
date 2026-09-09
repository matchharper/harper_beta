import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  buildOrgRoleMatchingHealthToolResult,
  getRoleMatchingHealthContextTalentIds,
  type OrgRoleMatchingHealthToolResult,
  type RoleMatchingHealthFitRow,
  type RoleMatchingHealthRecommendationRow,
  type RoleMatchingHealthTalentContext,
} from "@/lib/org/agent/roleMatchingHealth";

type OrgAgentAdminClient = ReturnType<typeof getSupabaseAdmin>;

const FIT_FIELDS =
  "id, talent_id, label, score, reason, recommend, role_fit, candidate_fit, company_fit, human_label, human_reason, reevaluation_criteria, last_evaluated_at, created_at";
const RECOMMENDATION_FIELDS =
  "id, talent_id, kind, opportunity_type, fit_summary, fit_reasons, feedback, feedback_at, feedback_reason, saved_stage, recommended_at, viewed_at, created_at, updated_at";
const PAGE_SIZE = 1_000;
const DEFAULT_MAX_ROWS = 25_000;

export class OrgRoleMatchingHealthError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "OrgRoleMatchingHealthError";
  }
}

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function fetchPagedRows<T>(args: {
  fetchPage: (from: number, to: number) => Promise<{
    data: T[] | null;
    error: unknown;
  }>;
  maxRows: number;
}) {
  const rows: T[] = [];
  while (rows.length <= args.maxRows) {
    const from = rows.length;
    const to = Math.min(from + PAGE_SIZE - 1, args.maxRows);
    const result = await args.fetchPage(from, to);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    rows.push(...page);
    if (rows.length > args.maxRows) {
      throw new OrgRoleMatchingHealthError(
        422,
        `Role matching-health source exceeds the safe row limit (${args.maxRows})`
      );
    }
    if (page.length < to - from + 1) break;
  }
  return rows;
}

async function fetchTalentContexts(args: {
  admin: OrgAgentAdminClient;
  talentIds: string[];
}): Promise<RoleMatchingHealthTalentContext[]> {
  if (args.talentIds.length === 0) return [];
  const results = await Promise.all(
    chunks(args.talentIds, 200).flatMap((talentIds) => [
      (args.admin.from("talent_users" as any) as any)
        .select("user_id, headline")
        .in("user_id", talentIds),
      (args.admin.from("talent_experiences" as any) as any)
        .select("id, talent_id, company_name, role, start_date, end_date")
        .in("talent_id", talentIds)
        .order("start_date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false }),
    ])
  );
  for (const result of results) {
    if (result.error) throw result.error;
  }

  const profiles = results
    .filter((_, index) => index % 2 === 0)
    .flatMap((result) => result.data ?? []) as Array<{
    headline: string | null;
    user_id: string;
  }>;
  const experiences = results
    .filter((_, index) => index % 2 === 1)
    .flatMap((result) => result.data ?? []) as Array<{
    company_name: string | null;
    end_date: string | null;
    role: string | null;
    talent_id: string;
  }>;
  const profileByTalentId = new Map(
    profiles.map((profile) => [profile.user_id, profile])
  );
  const recentExperienceByTalentId = new Map<
    string,
    (typeof experiences)[number]
  >();
  for (const experience of experiences) {
    if (!recentExperienceByTalentId.has(experience.talent_id)) {
      recentExperienceByTalentId.set(experience.talent_id, experience);
    }
  }

  return args.talentIds.map((talentId) => {
    const profile = profileByTalentId.get(talentId);
    const experience = recentExperienceByTalentId.get(talentId);
    return {
      headline: text(profile?.headline) || null,
      recentCompany: text(experience?.company_name) || null,
      recentRole: text(experience?.role) || null,
      talentId,
    };
  });
}

/** Reads one internal Role and returns the text passed to the company-side LLM. */
export async function getOrgRoleMatchingHealthToolResult(args: {
  admin: OrgAgentAdminClient;
  maxRows?: number;
  roleId: string;
  workspaceId: string;
}): Promise<OrgRoleMatchingHealthToolResult> {
  const roleId = text(args.roleId);
  const workspaceId = text(args.workspaceId);
  if (!roleId || !workspaceId) {
    throw new OrgRoleMatchingHealthError(
      400,
      "workspaceId and roleId are required"
    );
  }

  const { data: role, error: roleError } = await (
    args.admin.from("company_roles" as any) as any
  )
    .select(
      "role_id, company_workspace_id, name, source_type, status, is_expired, expires_at, location_text, work_mode, type, salary_range, salary_min, salary_max, salary_currency, salary_period, updated_at"
    )
    .eq("company_workspace_id", workspaceId)
    .eq("role_id", roleId)
    .eq("source_type", "internal")
    .maybeSingle();
  if (roleError) throw roleError;
  if (!role) throw new OrgRoleMatchingHealthError(404, "Role not found");

  const { data: internalRole, error: internalRoleError } = await (
    args.admin.from("company_internal_roles" as any) as any
  )
    .select("is_auto")
    .eq("role_id", roleId)
    .maybeSingle();
  if (internalRoleError) throw internalRoleError;

  const maxRows = Math.max(
    PAGE_SIZE,
    Math.min(50_000, args.maxRows ?? DEFAULT_MAX_ROWS)
  );
  const [fitRows, recommendationRows] = await Promise.all([
    fetchPagedRows<RoleMatchingHealthFitRow>({
      maxRows,
      fetchPage: async (from, to) => {
        const result = await (
          args.admin.from("talent_opportunity_fit" as any) as any
        )
          .select(FIT_FIELDS)
          .eq("opportunity_id", roleId)
          .order("last_evaluated_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to);
        return {
          data: (result.data ?? []) as RoleMatchingHealthFitRow[],
          error: result.error,
        };
      },
    }),
    fetchPagedRows<RoleMatchingHealthRecommendationRow>({
      maxRows,
      fetchPage: async (from, to) => {
        const result = await (
          args.admin.from("talent_opportunity_recommendation" as any) as any
        )
          .select(RECOMMENDATION_FIELDS)
          .eq("role_id", roleId)
          .order("recommended_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to);
        return {
          data: (result.data ?? []) as RoleMatchingHealthRecommendationRow[],
          error: result.error,
        };
      },
    }),
  ]);

  const contextTalentIds = getRoleMatchingHealthContextTalentIds({
    fits: fitRows,
    recommendations: recommendationRows,
  });
  const candidateContexts = await fetchTalentContexts({
    admin: args.admin,
    talentIds: contextTalentIds,
  });

  return buildOrgRoleMatchingHealthToolResult({
    candidateContexts,
    fits: fitRows,
    generatedAt: new Date().toISOString(),
    recommendations: recommendationRows,
    role: {
      automaticMatchingEnabled:
        typeof internalRole?.is_auto === "boolean" ? internalRole.is_auto : null,
      employmentTypes: Array.isArray(role.type)
        ? role.type.map(text).filter(Boolean)
        : [],
      expiresAt: text(role.expires_at) || null,
      isExpired: role.is_expired === true,
      location: text(role.location_text) || null,
      name: text(role.name),
      salaryCurrency: text(role.salary_currency) || null,
      salaryMax:
        typeof role.salary_max === "number" ? role.salary_max : null,
      salaryMin:
        typeof role.salary_min === "number" ? role.salary_min : null,
      salaryPeriod: text(role.salary_period) || null,
      salaryRange: text(role.salary_range) || null,
      status: text(role.status),
      updatedAt: text(role.updated_at),
      workMode: text(role.work_mode) || null,
    },
  });
}
