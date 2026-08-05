import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  type CompanyEventInsertClient,
  writeCompanyEvent,
} from "@/lib/org/companyEvents";

export const OPS_COMPANIES_PAGE_SIZE = 100;

export type OpsCompaniesQualityLabel = 0 | 1 | 2;

export type OpsCompanyWorkspaceScoreRecord = {
  companyName: string;
  companyWorkspaceId: string;
  currentRoleCount: number;
  humanQualityLabel: OpsCompaniesQualityLabel | null;
  llmQualityLabel: OpsCompaniesQualityLabel | null;
  logoUrl: string | null;
  testScore: number;
  updatedAt: string;
};

export type OpsCompaniesPageResponse = {
  items: OpsCompanyWorkspaceScoreRecord[];
  limit: number;
  nextOffset: number | null;
  offset: number;
  query: string;
  totalCount: number | null;
};

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

type CompanyWorkspaceScoreRow = {
  company_db?: { logo?: string | null } | { logo?: string | null }[] | null;
  company_name?: string | null;
  company_workspace_id?: string | null;
  logo_url?: string | null;
  test_score?: number | string | null;
  updated_at?: string | null;
};

type CompanyWorkspaceQualityLabelRow = {
  company_workspace_id?: string | null;
  human_quality_label?: number | string | null;
  llm_quality_label?: number | string | null;
};

function coerceArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function getFirstRecord<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function ensureNonEmptyString(value: unknown, fieldName: string) {
  const nextValue = String(value ?? "").trim();
  if (!nextValue) {
    throw new Error(`${fieldName} is required`);
  }
  return nextValue;
}

function sanitizeSearchText(value: string) {
  return value
    .replace(/[%(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQualityLabel(
  value: unknown
): OpsCompaniesQualityLabel | null {
  if (value === 0 || value === 1 || value === 2) return value;
  if (value === null || value === undefined) return null;

  const normalizedValue = typeof value === "string" ? value.trim() : value;
  if (normalizedValue === "") return null;

  const numeric = Number(normalizedValue);
  return numeric === 0 || numeric === 1 || numeric === 2
    ? (numeric as OpsCompaniesQualityLabel)
    : null;
}

function normalizeTestScore(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function fetchQualityLabelsByWorkspaceId(
  admin: AdminClient,
  workspaceIds: string[]
) {
  const labelsByWorkspaceId = new Map<
    string,
    CompanyWorkspaceQualityLabelRow
  >();
  const uniqueWorkspaceIds = Array.from(new Set(workspaceIds.filter(Boolean)));
  if (uniqueWorkspaceIds.length === 0) return labelsByWorkspaceId;

  const { data, error } = await (
    admin.from("company_workspace_quality_label" as any) as any
  )
    .select("company_workspace_id, human_quality_label, llm_quality_label")
    .in("company_workspace_id", uniqueWorkspaceIds);

  if (error) {
    throw new Error(error.message ?? "Failed to load company quality labels");
  }

  for (const row of coerceArray<CompanyWorkspaceQualityLabelRow>(data)) {
    const workspaceId = String(row.company_workspace_id ?? "").trim();
    if (!workspaceId) continue;
    labelsByWorkspaceId.set(workspaceId, row);
  }

  return labelsByWorkspaceId;
}

async function fetchCurrentRoleCountByWorkspaceId(
  admin: AdminClient,
  workspaceIds: string[]
) {
  const counts = new Map<string, number>();
  const uniqueWorkspaceIds = Array.from(new Set(workspaceIds.filter(Boolean)));
  if (uniqueWorkspaceIds.length === 0) return counts;

  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await (admin.from("company_roles" as any) as any)
      .select("company_workspace_id")
      .in("company_workspace_id", uniqueWorkspaceIds)
      .in("status", ["active", "top_priority"])
      .not("is_expired", "is", true)
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(error.message ?? "Failed to load role counts");
    }

    const rows = coerceArray<{ company_workspace_id?: string | null }>(data);
    for (const row of rows) {
      const workspaceId = String(row.company_workspace_id ?? "").trim();
      if (!workspaceId) continue;
      counts.set(workspaceId, (counts.get(workspaceId) ?? 0) + 1);
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return counts;
}

export async function fetchOpsCompaniesPage(
  args: {
    limit?: number;
    offset?: number;
    query?: string | null;
  } = {}
): Promise<OpsCompaniesPageResponse> {
  const admin = getSupabaseAdmin();
  const limit = Math.max(
    1,
    Math.min(
      Number(args.limit ?? OPS_COMPANIES_PAGE_SIZE) || OPS_COMPANIES_PAGE_SIZE,
      250
    )
  );
  const offset = Math.max(0, Number(args.offset ?? 0) || 0);
  const query = sanitizeSearchText(String(args.query ?? ""));

  let workspaceQuery = (admin.from("company_workspace" as any) as any)
    .select(
      [
        "company_workspace_id",
        "company_name",
        "logo_url",
        "test_score",
        "updated_at",
        "company_db:company_db ( logo )",
      ].join(", "),
      { count: "exact" }
    )
    .not("test_score", "is", null)
    .order("test_score", { ascending: false, nullsFirst: false })
    .order("company_name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (query) {
    workspaceQuery = workspaceQuery.ilike("company_name", `%${query}%`);
  }

  const { data, error, count } = await workspaceQuery;

  if (error) {
    throw new Error(error.message ?? "Failed to load companies");
  }

  const workspaceRows = coerceArray<CompanyWorkspaceScoreRow>(data);
  const workspaceIds = workspaceRows
    .map((row) => String(row.company_workspace_id ?? "").trim())
    .filter(Boolean);
  const [qualityLabelsByWorkspaceId, currentRoleCountByWorkspaceId] =
    await Promise.all([
      fetchQualityLabelsByWorkspaceId(admin, workspaceIds),
      fetchCurrentRoleCountByWorkspaceId(admin, workspaceIds),
    ]);

  const totalCount = typeof count === "number" ? count : null;
  const nextOffset =
    totalCount === null
      ? workspaceRows.length === limit
        ? offset + limit
        : null
      : offset + workspaceRows.length < totalCount
        ? offset + limit
        : null;

  return {
    items: workspaceRows
      .map((row) => {
        const workspaceId = String(row.company_workspace_id ?? "").trim();
        const testScore = normalizeTestScore(row.test_score);
        if (!workspaceId || testScore === null) return null;

        const qualityLabel = qualityLabelsByWorkspaceId.get(workspaceId);
        const companyDb = getFirstRecord(row.company_db);

        return {
          companyName: String(row.company_name ?? "").trim() || "회사명 없음",
          companyWorkspaceId: workspaceId,
          currentRoleCount: currentRoleCountByWorkspaceId.get(workspaceId) ?? 0,
          humanQualityLabel: normalizeQualityLabel(
            qualityLabel?.human_quality_label
          ),
          llmQualityLabel: normalizeQualityLabel(
            qualityLabel?.llm_quality_label
          ),
          logoUrl: row.logo_url ?? companyDb?.logo ?? null,
          testScore,
          updatedAt: String(row.updated_at ?? ""),
        } satisfies OpsCompanyWorkspaceScoreRecord;
      })
      .filter((item): item is OpsCompanyWorkspaceScoreRecord => item !== null),
    limit,
    nextOffset,
    offset,
    query,
    totalCount,
  };
}

export async function updateOpsCompanyTestScore(args: {
  eventActorLabel: string;
  testScore: number;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  const workspaceId = ensureNonEmptyString(args.workspaceId, "workspaceId");
  const testScore = Number(args.testScore);

  if (!Number.isFinite(testScore)) {
    throw new Error("testScore must be a finite number");
  }

  const { data: before, error: beforeError } = await (
    admin.from("company_workspace" as any) as any
  )
    .select("test_score")
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();

  if (beforeError || !before) {
    throw new Error(beforeError?.message ?? "Company workspace not found");
  }

  const { data, error } = await (admin.from("company_workspace" as any) as any)
    .update({
      test_score: testScore,
      updated_at: new Date().toISOString(),
    })
    .eq("company_workspace_id", workspaceId)
    .select("company_workspace_id, test_score, updated_at")
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to update test_score");
  }

  await writeCompanyEvent({
    actorLabel: args.eventActorLabel,
    changes: [
      {
        after: data?.test_score,
        before: before.test_score,
        key: "test_score",
      },
    ],
    client: admin as unknown as CompanyEventInsertClient,
    source: "website",
    workspaceId,
  });

  return {
    testScore: normalizeTestScore(data?.test_score) ?? testScore,
    updatedAt: String(data?.updated_at ?? ""),
    workspaceId: String(data?.company_workspace_id ?? workspaceId),
  };
}
