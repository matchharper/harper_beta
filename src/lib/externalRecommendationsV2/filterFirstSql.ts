import { eligibilitySql, ROLE_JOINS, ROLE_SELECT } from "./roleSql";
import { salarySatisfactionSql } from "./salary";
import {
  buildEmploymentTypeSql,
  buildPostingRecencySql,
  entryPreferenceRankSql,
  ftsRankSql,
  sqlLiteral,
} from "@/lib/talentOnboarding/jobPostingRecommendations";
import { countriesSchema, type V2SearchPlan } from "./countries";
import { buildCountrySelectionCtes } from "./countrySelectionSql";
import {
  SEARCH_CANDIDATE_LIMIT,
  SEARCH_COMPANY_ROLE_LIMIT,
  SEARCH_RESULT_LIMIT,
  SEARCH_SALARY_WEIGHT,
} from "./searchDefaults";

export function buildFilterFirstRoleSql(args: {
  plan: V2SearchPlan;
  targetSalaryKrw?: number | null;
  asOf?: string | null;
  excludeRoleIds?: string[];
  template?: boolean;
  listOnly?: boolean;
  diagnostics?: boolean;
  vector: number[];
  userId: string;
  blockedCompanies: string[];
  candidateLimit?: number;
  salaryWeight?: number;
  limit?: number;
}) {
  const plan = args.plan;
  const recency = buildPostingRecencySql(plan);
  const targetSalaryKrw = args.targetSalaryKrw;
  const candidateLimit = args.candidateLimit ?? SEARCH_CANDIDATE_LIMIT;
  const limit = args.limit ?? SEARCH_RESULT_LIMIT;
  const salaryWeight = args.salaryWeight ?? SEARCH_SALARY_WEIGHT;
  const countryRows = countriesSchema.parse(plan.countries);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > SEARCH_RESULT_LIMIT ||
    limit > candidateLimit
  )
    throw new Error("Invalid result limit");
  if (
    !plan.includeRemote &&
    (plan.remoteOnly || countryRows.some((c) => c.remoteOnly))
  )
    throw new Error("Conflicting remote search conditions");
  const remote = "lower(coalesce(cr.work_mode,''))='remote'";
  if (args.vector.length !== 1536 || !args.vector.every(Number.isFinite))
    throw new Error("Invalid vector");
  if (
    !Number.isInteger(candidateLimit) ||
    candidateLimit < 500 ||
    candidateLimit > 20000
  )
    throw new Error("Invalid N");
  if (!Number.isFinite(salaryWeight) || salaryWeight < 0 || salaryWeight > 1)
    throw new Error("Invalid salary weight");
  const countries = (remoteOnly: boolean) =>
    countryRows
      .filter((country) => country.remoteOnly === remoteOnly)
      .map((country) => sqlLiteral(country.countryCode));
  const allModes = countries(false);
  const remoteCountries = countries(true);
  const geography = [
    ...(allModes.length ? [`cr.country_code IN (${allModes.join(",")})`] : []),
    ...(remoteCountries.length
      ? [`(cr.country_code IN (${remoteCountries.join(",")}) AND ${remote})`]
      : []),
  ].join(" OR ");
  const where = [
    eligibilitySql(args),
    ...(geography ? [`(${geography})`] : []),
    ...(args.excludeRoleIds?.length
      ? [
          `cr.role_id NOT IN (${args.excludeRoleIds.map((id) => `${sqlLiteral(id)}::uuid`).join(",")})`,
        ]
      : []),
    ...buildEmploymentTypeSql(plan),
    ...(plan.remoteOnly
      ? [remote]
      : plan.includeRemote
        ? []
        : [`NOT (${remote})`]),
    ...recency.where,
  ].join(" AND ");
  const vectorSql = args.template
    ? ":title_embedding_1"
    : sqlLiteral(JSON.stringify(args.vector));
  const distance = `(cr.title_embedding::public.halfvec(1536)) OPERATOR(public.<=>) ${vectorSql}::public.halfvec(1536)`;
  const lexical = ftsRankSql(
    plan.ftsKeywords,
    "cr.opportunity_search_tsv"
  ).replaceAll("ts_rank_cd(", "ts_rank(");
  // Match the halfvec HNSW expression and order by distance alone, so the
  // planner can use ANN. Static eligibility is also in the partial index.
  // The dedicated RPC sets ANN/planner options BEFORE planning this statement.
  // set_config in a CTE would run too late to influence the access path.
  // Iterative scans seek more neighbors when dynamic WHERE filters discard
  // rows; they stop at N or the scan budget. This is approximate retrieval.
  // Carry rerank inputs from the same heap visit, but evaluate FTS/pay only
  // after the limit. This avoids N extra random primary-key/heap lookups.
  const joins = args.blockedCompanies.length
    ? ROLE_JOINS
    : "JOIN public.company_workspace cw ON cw.company_workspace_id=cr.company_workspace_id";
  // Each country has its own ordered ANN stream. Merge them before the shared
  // candidate limit: country weights apply only to final selection. At most N
  // rows per disjoint country are sufficient to supply the global top N.
  // Keeping these as ordered subqueries (not materialized CTEs) lets Merge
  // Append stop reading a country as soon as the global limit is satisfied.
  const countryScans = countryRows
    .map((c) => c.countryCode)
    .map(
      (country) => `SELECT cr.role_id, cr.company_workspace_id, cr.country_code, ${distance} AS distance,
 cr.name AS role_name, cr.seniority_level, cr.posted_at, cr.opportunity_search_tsv,
 cr.salary_min, cr.salary_max, cr.salary_currency, cr.salary_period
 FROM public.company_roles cr ${joins}
 WHERE ${where} AND cr.country_code=${sqlLiteral(country)}
   AND cr.title_embedding IS NOT NULL AND cr.title_embedding_text=cr.name
   AND (SELECT at FROM started) IS NOT NULL
 ORDER BY distance LIMIT ${candidateLimit}`
    );
  const nearest =
    countryScans.length === 1
      ? countryScans[0]
      : `SELECT * FROM (
 ${countryScans.map((sql) => `(${sql})`).join("\n UNION ALL\n ")}
 ) country_matches ORDER BY distance LIMIT ${candidateLimit}`;
  const ctes = `WITH started AS MATERIALIZED (
 SELECT clock_timestamp() AS at
),
nearest AS MATERIALIZED (
 ${nearest}
), vector_finished AS MATERIALIZED (
 SELECT count(*) AS candidates, clock_timestamp() AS at FROM nearest
), signals AS MATERIALIZED (
 SELECT cr.role_id, cr.company_workspace_id, cr.country_code, cr.posted_at, cr.distance, ${lexical} AS lexical_score,
 (${salarySatisfactionSql(targetSalaryKrw)}) AS salary_utility,
 ${entryPreferenceRankSql(plan.isPreferEntry, "cr.role_name", "cr.seniority_level")} AS entry_preference_score,
 ${recency.rankSql.replaceAll("tc.posted_at", "cr.posted_at")} AS recency_score
 FROM nearest cr
 WHERE (SELECT at FROM vector_finished) IS NOT NULL
), scored AS (
 SELECT *, (lexical_score / (1 + lexical_score)) + ${salaryWeight} * (2 * salary_utility - 1) + entry_preference_score + recency_score AS search_rank
 FROM signals
), company_ranked AS (
 SELECT *, row_number() OVER (
   PARTITION BY company_workspace_id
   ORDER BY search_rank DESC, distance, posted_at DESC NULLS LAST, role_id
 ) AS company_rank
 FROM scored
), company_capped AS (
 SELECT * FROM company_ranked WHERE company_rank <= ${SEARCH_COMPANY_ROLE_LIMIT}
), ${buildCountrySelectionCtes(countryRows, limit)}`;
  const projection = args.listOnly
    ? `cr.role_id::text,cr.name AS role_name,cw.company_name,cr.external_jd_url,cr.location_text,
 cr.salary_min,cr.salary_max,cr.salary_currency,cr.salary_period,cr.salary_range,cr.salary_is_predicted`
    : ROLE_SELECT;
  const selectedRows = `SELECT ${projection},s.search_rank,1-s.distance AS title_similarity,s.lexical_score AS fts_score,s.salary_utility
 FROM selected s JOIN public.company_roles cr ON cr.role_id=s.role_id
 ${args.listOnly ? "JOIN public.company_workspace cw ON cw.company_workspace_id=cr.company_workspace_id" : ROLE_JOINS}
 ORDER BY s.search_rank DESC,s.distance,cr.posted_at DESC NULLS LAST,cr.role_id LIMIT ${limit}`;
  if (!args.diagnostics) return `${ctes}\n${selectedRows}`;
  return `${ctes}, results AS MATERIALIZED (
 SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) AS rows FROM (${selectedRows}) r
), finished AS MATERIALIZED (
 SELECT rows, clock_timestamp() AS at FROM results WHERE (SELECT at FROM vector_finished) IS NOT NULL
)
SELECT r.rows, jsonb_build_object('candidates',v.candidates) AS counts,
 jsonb_build_object('candidateSearchMs',extract(epoch FROM(v.at-b.at))*1000,
 'rerankMs',extract(epoch FROM(r.at-v.at))*1000) AS timings
 FROM started b CROSS JOIN vector_finished v CROSS JOIN finished r`;
}
