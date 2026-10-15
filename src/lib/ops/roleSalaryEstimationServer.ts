import TurndownService from "turndown";
import { InternalApiError } from "@/lib/internalApi";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { flattenRpcRows } from "@/lib/talentOnboarding/jobPostingRecommendations";
import { directUsageCost } from "@/lib/externalRecommendationsV2/usage";
import {
  buildSalaryDecisionRequest,
  decodeSalaryEstimate,
  salaryMidpointError,
  salaryRunSchema,
  salarySearchSchema,
  SALARY_PAGE_SIZE,
  MAX_SALARY_ROLES,
  type PublishedSalary,
  type SalaryModelRole,
  type SalaryRoleOption,
  type SalaryRunResult,
  type SalarySearchResult,
} from "./roleSalaryEstimation";

const eligible = `cr.source_type = 'external'
  AND cr.country_code IN ('KR','US')
  AND lower(coalesce(cr.information->>'testOnly','false')) <> 'true'
  AND coalesce(cr.source_provider,'') <> 'user_submitted'
  AND coalesce(cr.is_expired,false) = false
  AND (cr.expires_at IS NULL OR cr.expires_at > now())
  AND cr.status NOT IN ('ended','expired','closed','inactive','archived')`;
const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
const fields = `cr.role_id::text AS id, cr.name AS title, cw.company_name AS company,
  cr.country_code AS country, cr.location_text AS location,
  cr.salary_min, cr.salary_max, cr.salary_currency, cr.salary_period, cr.salary_is_predicted`;

export type SalaryRoleRow = {
  id: string;
  title: string;
  company: string;
  country: string | null;
  location: string | null;
  salary_min: number | string | null;
  salary_max: number | string | null;
  salary_currency: string | null;
  salary_period: string | null;
  salary_is_predicted?: boolean;
  company_workspace_id?: string;
  description?: string | null;
  description_summary?: string | null;
  employment_type?: string | null;
  company_context?: Record<string, unknown> | null;
};
function number(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function option(row: SalaryRoleRow): SalaryRoleOption {
  const salary: PublishedSalary = {
    min: number(row.salary_min),
    max: number(row.salary_max),
    currency: row.salary_currency,
    period: row.salary_period,
  };
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    country: row.country as "KR" | "US",
    location: row.location,
    salary:
      row.salary_is_predicted || (salary.min === null && salary.max === null)
        ? null
        : salary,
  };
}
export function buildSalaryRoleSearchSql(input: unknown) {
  const query = salarySearchSchema.parse(input);
  const pattern = quote(`%${query.q.replace(/[\\%_]/g, "\\$&")}%`);
  const country = `cr.country_code = ${quote(query.country)}`;
  // Separate indexed role-name and workspace lookups, then paginate IDs before
  // loading the display fields. No capped intermediate company-ID selection.
  const byId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      query.q
    )
      ? `UNION SELECT cr.role_id, cr.updated_at FROM public.company_roles cr
       WHERE ${eligible} AND ${country} AND cr.role_id = ${quote(query.q)}::uuid`
      : "";
  return `WITH candidates AS MATERIALIZED (
    SELECT cr.role_id, cr.updated_at FROM public.company_roles cr
    WHERE ${eligible} AND ${country} AND coalesce(cr.name,'') ILIKE ${pattern} ESCAPE '\\'
    UNION
    SELECT cr.role_id, cr.updated_at FROM public.company_workspace cw
    JOIN public.company_roles cr ON cr.company_workspace_id = cw.company_workspace_id
    WHERE ${eligible} AND ${country} AND cw.company_name ILIKE ${pattern} ESCAPE '\\'
    ${byId}
  ), page AS MATERIALIZED (
    SELECT * FROM candidates ORDER BY updated_at DESC, role_id
    LIMIT ${SALARY_PAGE_SIZE + 1} OFFSET ${query.offset}
  ) SELECT ${fields} FROM page
    JOIN public.company_roles cr ON cr.role_id = page.role_id
    JOIN public.company_workspace cw ON cw.company_workspace_id = cr.company_workspace_id
    ORDER BY cr.updated_at DESC, cr.role_id`;
}
async function readRows(sql: string) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "search_external_roles_v2",
    { p_sql: sql }
  );
  if (error) throw new Error(error.message);
  return flattenRpcRows(data) as SalaryRoleRow[];
}
export async function searchSalaryRoles(
  input: unknown
): Promise<SalarySearchResult> {
  const parsed = salarySearchSchema.safeParse(input);
  if (!parsed.success)
    throw new InternalApiError(400, "검색 조건을 확인해 주세요.");
  if (!parsed.data.q) return { items: [], hasMore: false };
  const rows = await readRows(buildSalaryRoleSearchSql(parsed.data));
  return {
    items: rows.slice(0, SALARY_PAGE_SIZE).map(option),
    hasMore: rows.length > SALARY_PAGE_SIZE,
  };
}

const turndown = new TurndownService();
turndown.remove(["script", "style"]);
// Input blinding, not a classifier or a rewrite of model judgments. Monetary
// expressions in the role text are hidden; separate company/funding facts remain.
export function blindSalaryText(value: string) {
  const text = /<\/?[a-z][^>]*>/i.test(value)
    ? turndown.turndown(value)
    : value;
  const amount = String.raw`\d[\d,]*(?:\.\d+)?`;
  const currency = String.raw`(?:[$₩€£]|\b(?:USD|KRW|EUR|GBP)\b)`;
  const unit = String.raw`(?:[kKmMbB]\b|(?:억|만)?\s*원|(?:만|천)?\s*달러|\b(?:USD|KRW|EUR|GBP)\b)`;
  const separator = String.raw`(?:[-–—~〜]|\bto\b|\bthrough\b)`;
  return text
    .replace(
      new RegExp(
        String.raw`(?:${currency}\s*${amount}\s*(?:${unit})?\s*${separator}\s*(?:${currency}\s*)?${amount}\s*(?:${unit})?|${amount}\s*(?:${unit})?\s*${separator}\s*(?:${currency}\s*)?${amount}\s*${unit})`,
        "gi"
      ),
      "[금액 숨김]"
    )
    .replace(
      new RegExp(
        String.raw`(?:${currency}\s*${amount}(?:\s*${unit})?|${amount}\s*${unit})`,
        "gi"
      ),
      "[금액 숨김]"
    )
    .replace(
      new RegExp(
        String.raw`((?:연봉|급여|base salary|annual salary|salary range|salary band)\s*[:：]?\s*)${amount}(?:\s*${separator}\s*${amount})?`,
        "gi"
      ),
      "$1[금액 숨김]"
    );
}

export function buildSalaryModelRole(row: SalaryRoleRow): SalaryModelRole {
  return {
    case_id: row.id,
    company_name: row.company,
    title: blindSalaryText(row.title),
    country: row.country,
    currency: row.country === "KR" ? "KRW" : "USD",
    location: row.location,
    employment_type: row.employment_type ?? null,
    company_context: Object.fromEntries(
      Object.entries(row.company_context ?? {}).map(([k, v]) => [
        k,
        typeof v === "string" ? v.slice(0, 2500) : v,
      ])
    ),
    jd: blindSalaryText(row.description || row.description_summary || "").slice(
      0,
      9000
    ),
  };
}

export async function runSalaryEstimation(
  input: unknown,
  signal?: AbortSignal
): Promise<SalaryRunResult> {
  const parsed = salaryRunSchema.safeParse(input);
  if (
    !parsed.success ||
    new Set(parsed.success ? parsed.data.roleIds : []).size !==
      (parsed.success ? parsed.data.roleIds.length : 0)
  )
    throw new InternalApiError(
      400,
      `역할 1–${MAX_SALARY_ROLES}개를 선택하세요.`
    );
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key)
    throw new InternalApiError(503, "연봉 추정 연결이 설정되지 않았습니다.");
  const { roleIds, method } = parsed.data;
  const began = performance.now();
  const rows =
    await readRows(`SELECT ${fields}, cr.description, cr.description_summary,
    cr.type AS employment_type,
    jsonb_strip_nulls(jsonb_build_object('company_description',cw.company_description,
      'short_description',cd.short_description,'founded_year',cd.founded_year,
      'employee_count_range',cd.employee_count_range,'last_funding_stage',dat.last_funding_stage,
      'total_funding_raised',dat.total_funding_raised)) AS company_context
    FROM public.company_roles cr
    JOIN public.company_workspace cw ON cw.company_workspace_id = cr.company_workspace_id
    LEFT JOIN public.company_db cd ON cd.id = cw.company_db_id
    LEFT JOIN public.company_data dat ON dat.company_workspace_id = cr.company_workspace_id
    WHERE ${eligible} AND cr.role_id IN (${roleIds.map(quote).join(",")})`);
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (roleIds.some((id) => !byId.has(id)))
    throw new InternalApiError(
      400,
      "선택한 역할이 마감됐거나 조회할 수 없습니다. 다시 선택하세요."
    );
  const ordered = roleIds.map((id) => byId.get(id)!);
  const { productionSalaryRequest, SALARY_ESTIMATION_VERSION } =
    await import("../externalRecommendationsV2/salaryEstimation.server");
  const { roles, contract } = productionSalaryRequest(ordered, method);
  const { request, raw, inputTokens } = await requestSalaryEstimates(
    roles,
    method,
    signal,
    contract
  );
  return {
    method,
    model: request.model,
    promptVersion: SALARY_ESTIMATION_VERSION,
    durationMs: performance.now() - began,
    inputTokens,
    costUsd: directUsageCost("openai_decisions", raw.usage).usd,
    input: request.input,
    rows: ordered.map((row, index) => {
      const item = option(row);
      try {
        const estimate = decodeSalaryEstimate(
          raw,
          index,
          roles[index].currency,
          contract.anchors[roles[index].currency]
        );
        return {
          ...item,
          estimate,
          midpointErrorPct: salaryMidpointError(estimate, item.salary),
          error: null,
        };
      } catch {
        return {
          ...item,
          estimate: null,
          midpointErrorPct: null,
          error: "추정 응답이 올바르지 않습니다.",
        };
      }
    }),
  };
}

export async function requestSalaryEstimates(
  roles: SalaryModelRole[],
  method: Parameters<typeof buildSalaryDecisionRequest>[1],
  signal?: AbortSignal,
  contract?: Parameters<typeof buildSalaryDecisionRequest>[2],
  maxReserveUsd = 0.25
) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("Missing salary estimator credential");
  const request = buildSalaryDecisionRequest(roles, method, contract);
  const body = JSON.stringify(request);
  // Bound one paid call by payload size. Never retry a potentially billed call.
  const reserve = directUsageCost("openai_decisions", {
    input_tokens: (Buffer.byteLength(body) + 8192) * 10,
  }).usd;
  if (reserve === null || reserve > maxReserveUsd)
    throw new InternalApiError(
      400,
      "입력이 너무 큽니다. 역할을 줄여 다시 실행하세요."
    );
  const timeout = AbortSignal.timeout(40_000);
  const response = await fetch("https://api.openai.com/v1/decisions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new InternalApiError(
      502,
      `연봉 추정 요청에 실패했습니다 (${response.status}).`
    );
  }
  const raw = await response.json();
  const inputTokens =
    Number.isSafeInteger(raw?.usage?.input_tokens) &&
    raw.usage.input_tokens >= 0
      ? raw.usage.input_tokens
      : null;
  return {
    request,
    raw,
    inputTokens,
    costUsd: directUsageCost("openai_decisions", raw.usage).usd,
  };
}
