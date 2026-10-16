import { salarySatisfactionSql } from "./salary";
import { z } from "zod";
import { SEARCH_TITLE_NEIGHBOR_LIMIT, searchTitleText } from "./searchTitles";
import { countryQuotas, type V2SearchPlan } from "./countries";
import { recordDirectUsage } from "./usage";
import {
  buildBlockedCompanySql,
  buildEmploymentTypeSql,
  buildPostingRecencySql,
  ftsAnyQuerySql,
  ftsRankSql,
  previouslyRecommendedRoleExclusionSql,
  sqlLiteral,
  flattenRpcRows,
  type RawRoleRow,
} from "../talentOnboarding/jobPostingRecommendations";
import type { TalentAdminClient } from "../talentOnboarding/admin";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export class TitleEmbeddingHttpError extends Error {
  constructor(readonly status: number) {
    super(`Title embedding HTTP ${status}`);
  }
}
export async function embedTitles(titles: string[], signal?: AbortSignal) {
  if (!titles.length) return [];
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OpenAI embedding credential");
  const began = Date.now();
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: titles,
      dimensions: 1536,
    }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(45_000)])
      : AbortSignal.timeout(45_000),
  });
  const body = await response.json();
  if (!response.ok) throw new TitleEmbeddingHttpError(response.status);
  await recordDirectUsage(
    "embeddings",
    EMBEDDING_MODEL,
    body.usage,
    Date.now() - began
  );
  const rows = (body.data ?? []).sort((a: any, b: any) => a.index - b.index);
  if (rows.length !== titles.length) throw new Error("Missing title embedding");
  return rows.map((r: any) => {
    if (
      !Array.isArray(r.embedding) ||
      r.embedding.length !== 1536 ||
      !r.embedding.every(
        (n: unknown) => typeof n === "number" && Number.isFinite(n)
      )
    )
      throw new Error("Invalid title embedding");
    return r.embedding as number[];
  });
}
export function embedSearchTitles(titles: string[], signal?: AbortSignal) {
  return embedTitles([searchTitleText(titles)], signal);
}

export type TitleNeighbor = {
  title_key: string;
  title: string;
  distance: number;
};
export function titleNeighborsSql(rows: TitleNeighbor[]) {
  return `SELECT * FROM jsonb_to_recordset(${sqlLiteral(JSON.stringify(rows))}::jsonb) AS n(title_key text,title text,distance double precision)`;
}
// ANN and role expansion each have their own bounded read. Combining both can
// exceed the RPC timeout even when each stage finishes within its budget.
export async function fetchTitleNeighbors(
  admin: TalentAdminClient,
  vector: number[]
) {
  if (vector.length !== 1536 || !vector.every(Number.isFinite))
    throw new Error("Invalid vector");
  const distance = `(te.embedding::public.halfvec(1536)) OPERATOR(public.<=>) ${sqlLiteral(JSON.stringify(vector))}::public.halfvec(1536)`;
  const { data, error } = await admin.rpc(
    "search_external_roles_v2" as never,
    {
      // One JSON row avoids PostgREST's result-row cap truncating the 5,000 titles.
      p_sql: `SELECT coalesce(jsonb_agg(n),'[]'::jsonb) AS title_neighbors FROM (
      SELECT te.title_key,te.title,${distance} AS distance FROM public.external_role_title_embeddings te
      WHERE te.embedding IS NOT NULL AND te.live_role_count>0 ORDER BY ${distance} LIMIT ${SEARCH_TITLE_NEIGHBOR_LIMIT}) n`,
    } as never
  );
  if (error) throw new Error(`External title search: ${error.message}`);
  return z
    .array(
      z.object({
        title_key: z.string(),
        title: z.string(),
        distance: z.number().finite(),
      })
    )
    .parse(flattenRpcRows(data));
}

export function eligibilitySql(args: {
  userId: string;
  blockedCompanies: string[];
}) {
  return [
    "cr.source_type = 'external'",
    "COALESCE(cr.source_provider,'') <> 'user_submitted'",
    "COALESCE(cr.is_expired,false) = false",
    "(cr.expires_at IS NULL OR cr.expires_at > now())",
    "cr.status NOT IN ('expired','closed','inactive','archived','ended')",
    "cw.external_roles_enabled = true",
    "lower(coalesce(cr.information->>'testOnly','false')) <> 'true'",
    previouslyRecommendedRoleExclusionSql(args.userId),
    ...buildBlockedCompanySql(args.blockedCompanies),
  ]
    .filter(Boolean)
    .join(" AND ");
}
export const ROLE_SELECT = `cr.role_id::text, cr.company_workspace_id::text, cr.name AS role_name,
cr.description, cr.external_jd_url, cr.country_code, cr.location_text, cr.work_mode, cr.type, cr.posted_at,
cr.salary_min, cr.salary_max, cr.salary_currency, cr.salary_period, cr.salary_range, cr.seniority_level,
cr.summary, cr.salary_is_predicted,
cw.company_name,cw.company_description, cd.name AS company_db_name, cd.description AS company_db_description,
cd.short_description AS company_db_short_description,cd.location AS company_db_location,
cd.founded_year AS company_db_founded_year,cd.employee_count_range AS company_db_employee_count_range`;
export const ROLE_JOINS = `JOIN public.company_workspace cw ON cw.company_workspace_id=cr.company_workspace_id
LEFT JOIN public.company_db cd ON cd.id=cw.company_db_id`;
const LIST_SELECT = `cr.role_id::text,cr.name AS role_name,cw.company_name,cr.external_jd_url,cr.location_text,
cr.salary_min,cr.salary_max,cr.salary_currency,cr.salary_period,cr.salary_range,cr.salary_is_predicted`;

export function buildHybridSql(args: {
  plan: V2SearchPlan;
  vectors: number[][];
  userId: string;
  blockedCompanies: string[];
  limit: 200 | 500;
  template?: boolean;
  targetSalaryKrw?: number | null;
  salaryWeight?: number;
  listOnly?: boolean;
  titleNeighbors?: TitleNeighbor[];
}) {
  if (args.vectors.length !== 1)
    throw new Error("Expected one combined search-title embedding");
  const salaryWeight = args.salaryWeight ?? 0.35;
  if (!Number.isFinite(salaryWeight) || salaryWeight < 0 || salaryWeight > 1)
    throw new Error("Invalid salary weight");
  const salaryUtility = salarySatisfactionSql(args.targetSalaryKrw);
  const quotas = countryQuotas(args.plan.countries, args.limit);
  const remote = "lower(coalesce(cr.work_mode,''))='remote'";
  if (
    !args.plan.includeRemote &&
    (args.plan.remoteOnly || quotas.some((c) => c.remoteOnly))
  )
    throw new Error("Conflicting remote search conditions");
  const geography = quotas
    .map(
      (c) =>
        `(cr.country_code=${sqlLiteral(c.countryCode)}${c.remoteOnly ? ` AND ${remote}` : ""})`
    )
    .join(" OR ");
  const recency = buildPostingRecencySql(args.plan);
  const where = [
    eligibilitySql(args),
    ...buildEmploymentTypeSql(args.plan),
    `(${geography})`,
    ...(args.plan.remoteOnly
      ? [remote]
      : args.plan.includeRemote
        ? []
        : [`NOT (${remote})`]),
    ...recency.where,
  ].join(" AND ");
  const vectorLists = args.vectors.map((v, i) => {
    if (v.length !== 1536 || !v.every(Number.isFinite))
      throw new Error("Invalid vector");
    if (args.titleNeighbors)
      return `nearest_${i} AS MATERIALIZED (${titleNeighborsSql(args.titleNeighbors)})`;
    // Keep full precision at rest; half precision ANN reduces the index's memory/IO.
    const distance = `(te.embedding::public.halfvec(1536)) OPERATOR(public.<=>) ${args.template ? `:title_embedding_${i + 1}` : sqlLiteral(JSON.stringify(v))}::public.halfvec(1536)`;
    // Bound ANN on the title dictionary before joining large company/role tables.
    // One combined query keeps the former maximum recall budget; the independent
    // lexical pool preserves another path after location/company filters.
    return `nearest_${i} AS MATERIALIZED (SELECT te.title_key,te.title,${distance} AS distance
      FROM public.external_role_title_embeddings te WHERE te.embedding IS NOT NULL AND te.live_role_count>0
      ORDER BY ${distance} LIMIT ${SEARCH_TITLE_NEIGHBOR_LIMIT})`;
  });
  // FTS is a complementary signal. Frequency ranking avoids the expensive
  // positional cover enumeration of ts_rank_cd for broad multi-alias queries.
  const lexicalRank = ftsRankSql(
    args.plan.ftsKeywords,
    "cr.opportunity_search_tsv"
  ).replaceAll("ts_rank_cd(", "ts_rank(");
  // Keep title ties together at the recall boundary. UUIDs break only final
  // display ties; they must never create different relevance for identical evidence.
  // Materialize scalar signals once, then join wide role/company data only for
  // the selected page. This avoids repeated salary calls in window/final sorts.
  return `WITH country_targets(country_code,quota) AS (VALUES ${quotas.map((c) => `(${sqlLiteral(c.countryCode)},${c.quota})`).join(",")}),
${vectorLists.join(",\n")},
nearest AS MATERIALIZED (SELECT title_key,title,min(distance) AS distance FROM (${args.vectors.map((_, i) => `SELECT * FROM nearest_${i}`).join(" UNION ALL ")}) neighbors GROUP BY title_key,title),
semantic_candidates AS MATERIALIZED (SELECT cr.role_id,cr.name,md5(cr.name) AS title_key
 FROM public.company_roles cr WHERE cr.source_type='external' AND (${geography})
 AND md5(cr.name)=ANY(ARRAY(SELECT title_key FROM nearest))),
semantic_matches AS MATERIALIZED (SELECT cr.role_id,cr.country_code,nt.distance, rank() over(partition by cr.country_code order by nt.distance) AS country_rank
 FROM semantic_candidates p JOIN nearest nt ON nt.title_key=p.title_key AND nt.title=p.name
 JOIN public.company_roles cr ON cr.role_id=p.role_id ${ROLE_JOINS}
 WHERE ${where}),
semantic_pool AS MATERIALIZED (SELECT role_id,country_code,distance FROM semantic_matches WHERE country_rank<=${args.limit * 6}),
pending_titles AS MATERIALIZED (SELECT title_key,title FROM public.external_role_title_embeddings WHERE embedding IS NULL AND live_role_count>0),
pending_matches AS MATERIALIZED (SELECT cr.role_id,cr.name,md5(cr.name) AS title_key
 FROM public.company_roles cr WHERE cr.source_type='external' AND (${geography})
 AND md5(cr.name)=ANY(ARRAY(SELECT title_key FROM pending_titles))
 AND cr.opportunity_search_tsv @@ ${ftsAnyQuerySql(args.plan.ftsKeywords)}),
unembedded_matches AS MATERIALIZED (SELECT cr.role_id,cr.country_code,row_number() over(partition by cr.country_code order by cr.posted_at DESC NULLS LAST,cr.role_id) AS country_rank
 FROM pending_matches p JOIN pending_titles te ON te.title_key=p.title_key AND te.title=p.name
 JOIN public.company_roles cr ON cr.role_id=p.role_id ${ROLE_JOINS}
 WHERE ${where}),
unembedded AS MATERIALIZED (SELECT role_id FROM unembedded_matches WHERE country_rank<=${args.limit * 6}),
search_pool AS MATERIALIZED (SELECT role_id FROM semantic_pool UNION SELECT role_id FROM unembedded),
role_signals AS MATERIALIZED (SELECT cr.role_id,cr.country_code,cr.posted_at,
 cr.opportunity_search_tsv @@ ${ftsAnyQuerySql(args.plan.ftsKeywords)} AS lexical_match,
 ${lexicalRank} AS lexical_score,(${salaryUtility}) AS salary_utility
 FROM search_pool p JOIN public.company_roles cr ON cr.role_id=p.role_id),
semantic AS (SELECT role_id,dense_rank() over(order by distance) AS rank FROM semantic_pool),
lexical AS (SELECT role_id,dense_rank() over(order by lexical_score DESC) AS rank FROM role_signals WHERE lexical_match),
fused AS (SELECT r.role_id,r.country_code,r.posted_at,r.salary_utility,
 coalesce(0.8/(60+s.rank),0)+coalesce(0.2/(60+l.rank),0) AS search_rank
 FROM role_signals r LEFT JOIN semantic s ON s.role_id=r.role_id LEFT JOIN lexical l ON l.role_id=r.role_id),
salary_ranked AS MATERIALIZED (SELECT role_id,country_code,posted_at,
 search_rank * (1-${salaryWeight}+2*${salaryWeight}*salary_utility) AS search_rank FROM fused),
allocated AS (SELECT f.*,t.quota,row_number() over(partition by f.country_code order by f.search_rank DESC,f.posted_at DESC NULLS LAST,f.role_id) AS country_rank
 FROM salary_ranked f JOIN country_targets t ON t.country_code=f.country_code),
selected AS MATERIALIZED (SELECT * FROM allocated
 ORDER BY (country_rank<=quota) DESC,search_rank DESC,posted_at DESC NULLS LAST,role_id LIMIT ${args.limit})
SELECT ${args.listOnly ? LIST_SELECT : ROLE_SELECT},f.search_rank FROM selected f JOIN public.company_roles cr ON cr.role_id=f.role_id ${ROLE_JOINS}
ORDER BY (f.country_rank<=f.quota) DESC,f.search_rank DESC,cr.posted_at DESC NULLS LAST,cr.role_id LIMIT ${args.limit}`;
}
export async function executeSql<T = RawRoleRow>(
  admin: TalentAdminClient,
  sql: string,
  limit = 500
): Promise<T[]> {
  const { data, error } = await admin.rpc(
    "set_timeout_and_execute_raw_sql" as never,
    { sql_query: sql, limit_num: limit, offset_num: 0, page_idx: 0 } as never
  );
  if (error) throw new Error(error.message);
  return flattenRpcRows(data) as T[];
}
export async function retrieveRoles(args: {
  admin: TalentAdminClient;
  plan: V2SearchPlan;
  userId: string;
  blockedCompanies: string[];
  limit: 200 | 500;
  vectors?: number[][];
  targetSalaryKrw?: number | null;
  listOnly?: boolean;
  signal?: AbortSignal;
}) {
  const vectors =
    args.vectors ??
    (await embedSearchTitles(args.plan.roleTitles, args.signal));
  if (vectors.length !== 1)
    throw new Error("Expected one combined search-title embedding");
  args.signal?.throwIfAborted();
  const titleNeighbors = await fetchTitleNeighbors(args.admin, vectors[0]);
  args.signal?.throwIfAborted();
  const sql = buildHybridSql({ ...args, vectors, titleNeighbors });
  const { data, error } = await args.admin.rpc(
    "search_external_roles_v2" as never,
    { p_sql: sql } as never
  );
  if (error) throw new Error(error.message);
  return { rows: flattenRpcRows(data) as RawRoleRow[], sql };
}
