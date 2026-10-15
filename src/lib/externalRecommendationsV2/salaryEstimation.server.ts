import type { TalentAdminClient } from "../talentOnboarding/admin";
import {
  flattenRpcRows,
  sqlLiteral,
} from "../talentOnboarding/jobPostingRecommendations";
import {
  buildSalaryModelRole,
  requestSalaryEstimates,
  type SalaryRoleRow,
} from "../ops/roleSalaryEstimationServer";
import {
  decodeSalaryEstimate,
  type SalaryMethod,
} from "../ops/roleSalaryEstimation";
import prompts from "../ops/roleSalaryEstimation.prompts.json";
import fx from "./salaryFx.json";
import { chunks, mapConcurrent } from "./contract";

export const SALARY_ESTIMATION_VERSION = "salary-decisions-production-v2";
const krwAnchors = [20, 30, 40, 50, 65, 80, 100, 130, 180, 260].map(
  (n) => n * 1e6
);
const usAnchors = [30, 50, 75, 100, 130, 160, 200, 260, 380, 550].map(
  (n) => n * 1e3
);
const globalAnchors = [5, 10, 20, 35, 60, 100, 160, 250, 400, 650].map(
  (n) => n * 1e3
);
export type SalaryFillRow = SalaryRoleRow & {
  source_hash: string;
  company_workspace_id: string;
};
export const SALARY_FILL_SELECT = `cr.role_id::text AS id,cr.name AS title,cw.company_name AS company,
 cr.company_workspace_id::text,cr.country_code AS country,cr.location_text AS location,
 cr.salary_min,cr.salary_max,cr.salary_currency,cr.salary_period,cr.salary_is_predicted,
 cr.description,cr.description_summary,cr.type AS employment_type,
 md5(jsonb_build_array(cr.name,cr.description,cr.company_workspace_id,cr.location_text,cr.country_code,cr.type)::text) AS source_hash,
 jsonb_strip_nulls(jsonb_build_object('company_description',cw.company_description,
 'short_description',cd.short_description,'founded_year',cd.founded_year,
 'employee_count_range',cd.employee_count_range,'last_funding_stage',dat.last_funding_stage,
 'total_funding_raised',dat.total_funding_raised)) AS company_context`;
export const SALARY_FILL_JOINS = `JOIN public.company_workspace cw ON cw.company_workspace_id=cr.company_workspace_id
 LEFT JOIN public.company_db cd ON cd.id=cw.company_db_id
 LEFT JOIN public.company_data dat ON dat.company_workspace_id=cr.company_workspace_id`;
export const MISSING_SALARY_SQL = `cr.source_type='external' AND cr.salary_min IS NULL AND cr.salary_max IS NULL
 AND nullif(btrim(cr.salary_range),'') IS NULL AND lower(coalesce(cr.information->>'testOnly','false'))<>'true'`;

export function salaryCompanyBatches(rows: SalaryFillRow[], size = 10) {
  if (!Number.isInteger(size) || size < 1 || size > 10)
    throw new Error("Invalid salary batch size");
  // Company adjacency keeps all requests at ten roles, including small companies.
  return chunks(
    [...rows].sort(
      (a, b) =>
        a.company_workspace_id.localeCompare(b.company_workspace_id) ||
        a.id.localeCompare(b.id)
    ),
    size
  );
}
export function productionSalaryRequest(
  rows: SalaryRoleRow[],
  method: SalaryMethod = "mapping"
) {
  const roles = rows.map(buildSalaryModelRole);
  const global = rows.some((r) => r.country !== "KR" && r.country !== "US");
  const anchors = { KRW: krwAnchors, USD: global ? globalAnchors : usAnchors };
  const prompt =
    prompts.basePrompt
      .replace("requested native\ncurrency", "requested\ncurrency")
      .replace(
        "Keep work country and currency\nas supplied; do not convert currencies or assume a foreign HQ pays US rates abroad.",
        "Keep the actual work country as supplied. For non-US countries requested in USD, express local annual base pay in USD using the supplied FX rates. Do not transfer US pay because of a foreign HQ. An unknown country must be inferred from the supplied location and employer context, with uncertainty in probabilities."
      ) +
    "\n" +
    prompts.methodPrompts[method] +
    "\nThe numeric mapping above is a starting prior for technical/product roles, not a pay floor. Support, operations, internships, regional services and nontechnical roles can pay less. Executive roles can pay more. Outside Korea/US use your knowledge of the actual local hiring market and responsibility level; do not copy US or Korean bands.\nSalary FX (KRW per unit, " +
    fx.asOf +
    "): " +
    JSON.stringify(fx.krwPerUnit);
  return { roles, contract: { anchors, prompt } };
}
export async function estimateSalaryBatch(
  rows: SalaryFillRow[],
  signal?: AbortSignal
) {
  if (rows.length > 10)
    throw new Error("Salary persistence batches are limited to ten roles");
  const { roles, contract } = productionSalaryRequest(rows);
  const began = performance.now();
  const result = await requestSalaryEstimates(
    roles,
    "mapping",
    signal,
    contract,
    1
  );
  const invalid: string[] = [];
  const values = rows.flatMap((row, i) => {
    try {
      const estimate = decodeSalaryEstimate(
        result.raw,
        i,
        roles[i].currency,
        contract.anchors[roles[i].currency]
      );
      const rate = roles[i].currency === "KRW" ? 1 : fx.krwPerUnit.USD;
      return [
        {
          roleId: row.id,
          sourceHash: row.source_hash,
          min: Math.round(estimate.min * rate),
          max: Math.round(estimate.max * rate),
        },
      ];
    } catch {
      invalid.push(row.id);
      return [];
    }
  });
  return {
    ...result,
    values,
    invalid,
    durationMs: performance.now() - began,
    version: SALARY_ESTIMATION_VERSION,
  };
}
export async function saveSalaryBatch(
  admin: TalentAdminClient,
  values: Awaited<ReturnType<typeof estimateSalaryBatch>>["values"]
) {
  if (!values.length) return [];
  const { data, error } = await admin.rpc(
    "save_external_role_salary_predictions" as never,
    { p_rows: values } as never
  );
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    role_id: string;
    salary_min: number;
    salary_max: number;
  }>;
}
export async function fillExternalRoleSalaries(
  admin: TalentAdminClient,
  roleIds: string[],
  signal?: AbortSignal
) {
  const metrics = {
    requested: roleIds.length,
    estimated: 0,
    saved: 0,
    failed: 0,
    calls: 0,
    costUsd: 0,
    unknownCostCalls: 0,
  };
  if (!roleIds.length) return metrics;
  const { data, error } = await admin.rpc(
    "search_external_roles_v2" as never,
    {
      p_sql: `SELECT ${SALARY_FILL_SELECT}
    FROM public.company_roles cr ${SALARY_FILL_JOINS} WHERE ${MISSING_SALARY_SQL}
    AND cr.role_id IN (${roleIds.map(sqlLiteral).join(",")})`,
    } as never
  );
  if (error) {
    console.warn("[external salary] capture failed", error.message);
    metrics.failed = roleIds.length;
    return metrics;
  }
  const rows = flattenRpcRows(data) as SalaryFillRow[];
  await mapConcurrent(salaryCompanyBatches(rows), 4, async (batch) => {
    signal?.throwIfAborted();
    metrics.calls++;
    try {
      const result = await estimateSalaryBatch(batch, signal);
      metrics.estimated += result.values.length;
      metrics.failed += result.invalid.length;
      if (result.costUsd == null) metrics.unknownCostCalls++;
      else metrics.costUsd += result.costUsd;
      metrics.saved += (await saveSalaryBatch(admin, result.values)).length;
    } catch (error) {
      signal?.throwIfAborted();
      metrics.failed += batch.length;
      metrics.unknownCostCalls++;
      console.warn(
        "[external salary] batch failed",
        error instanceof Error ? error.message : String(error)
      );
    }
  });
  return metrics;
}
