import {
  eligibilitySql,
  ROLE_JOINS,
} from "@/lib/externalRecommendationsV2/retrieval";
import { salarySatisfactionSql } from "@/lib/externalRecommendationsV2/salary";
import {
  buildEmploymentTypeSql,
  buildPostingRecencySql,
  ftsRankSql,
  sqlLiteral,
} from "@/lib/talentOnboarding/jobPostingRecommendations";
import type { PreviewQuery } from "./externalSearchPreview";

export function buildFilterFirstSql(args: {
  query: PreviewQuery;
  vector: number[];
  userId: string;
  blockedCompanies: string[];
  candidateLimit: number;
  salaryWeight: number;
}) {
  const { plan, targetSalaryKrw } = args.query;
  const remote = "lower(coalesce(cr.work_mode,''))='remote'";
  if (args.vector.length !== 1536 || !args.vector.every(Number.isFinite))
    throw new Error("Invalid vector");
  if (
    !Number.isInteger(args.candidateLimit) ||
    args.candidateLimit < 500 ||
    args.candidateLimit > 20000
  )
    throw new Error("Invalid N");
  if (
    !Number.isFinite(args.salaryWeight) ||
    args.salaryWeight < 0 ||
    args.salaryWeight > 1
  )
    throw new Error("Invalid salary weight");
  const geography = plan.countries
    .map(
      (c) =>
        `(cr.country_code=${sqlLiteral(c.countryCode)}${c.remoteOnly ? ` AND ${remote}` : ""})`
    )
    .join(" OR ");
  const where = [
    eligibilitySql(args),
    `(${geography})`,
    ...buildEmploymentTypeSql(plan),
    ...(plan.remoteOnly
      ? [remote]
      : plan.includeRemote
        ? []
        : [`NOT (${remote})`]),
    ...buildPostingRecencySql(plan).where,
  ].join(" AND ");
  const distance = `cr.title_embedding OPERATOR(public.<=>) ${sqlLiteral(JSON.stringify(args.vector))}::public.vector(1536)`;
  const lexical = ftsRankSql(
    plan.ftsKeywords,
    "cr.opportunity_search_tsv"
  ).replaceAll("ts_rank_cd(", "ts_rank(");
  // Deliberately exact over the materialized eligible set. A global ANN LIMIT
  // followed by a filter would test a different algorithm. Count barriers finish
  // each preceding stage before taking its timestamp (no EXPLAIN timing sums).
  return `WITH started AS MATERIALIZED (SELECT clock_timestamp() AS at),
filtered AS MATERIALIZED (
 SELECT cr.role_id, (cr.title_embedding IS NOT NULL AND cr.title_embedding_text=cr.name) AS has_embedding
 FROM public.company_roles cr ${ROLE_JOINS}
 WHERE ${where} AND (SELECT at FROM started) IS NOT NULL
), filter_finished AS MATERIALIZED (
 SELECT count(*) AS eligible, count(*) FILTER(WHERE has_embedding) AS embedded, clock_timestamp() AS at FROM filtered
), nearest AS MATERIALIZED (
 SELECT cr.role_id, ${distance} AS distance
 FROM filtered f JOIN public.company_roles cr ON cr.role_id=f.role_id
 WHERE f.has_embedding AND (SELECT at FROM filter_finished) IS NOT NULL
 ORDER BY distance, cr.role_id LIMIT ${args.candidateLimit}
), vector_finished AS MATERIALIZED (
 SELECT count(*) AS candidates, clock_timestamp() AS at FROM nearest
), signals AS MATERIALIZED (
 SELECT cr.role_id, cr.posted_at, n.distance, ${lexical} AS lexical_score,
 (${salarySatisfactionSql(targetSalaryKrw)}) AS salary_utility
 FROM nearest n JOIN public.company_roles cr ON cr.role_id=n.role_id
 WHERE (SELECT at FROM vector_finished) IS NOT NULL
), ranked AS MATERIALIZED (
 SELECT *, lexical_score * (1-${args.salaryWeight}+2*${args.salaryWeight}*salary_utility) AS search_rank
 FROM signals
), selected AS MATERIALIZED (
 SELECT * FROM ranked ORDER BY search_rank DESC, distance, posted_at DESC NULLS LAST, role_id LIMIT 500
), results AS MATERIALIZED (
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'role_id',cr.role_id::text,'role_name',cr.name,'company_name',cw.company_name,
 'external_jd_url',cr.external_jd_url,'location_text',cr.location_text,
 'salary_min',cr.salary_min,'salary_max',cr.salary_max,'salary_currency',cr.salary_currency,
 'salary_period',cr.salary_period,'salary_range',cr.salary_range,'salary_is_predicted',cr.salary_is_predicted,
 'search_rank',s.search_rank) ORDER BY s.search_rank DESC,s.distance,cr.posted_at DESC NULLS LAST,cr.role_id),'[]'::jsonb) AS rows
 FROM selected s JOIN public.company_roles cr ON cr.role_id=s.role_id ${ROLE_JOINS}
), finished AS MATERIALIZED (
 SELECT rows, clock_timestamp() AS at FROM results WHERE (SELECT at FROM vector_finished) IS NOT NULL
)
SELECT r.rows, jsonb_build_object('eligible',f.eligible,'embedded',f.embedded,'missingEmbedding',f.eligible-f.embedded,'candidates',v.candidates) AS counts,
 jsonb_build_object('filterMs',extract(epoch FROM(f.at-b.at))*1000,
 'vectorMs',extract(epoch FROM(v.at-f.at))*1000,'rerankMs',extract(epoch FROM(r.at-v.at))*1000) AS timings
 FROM started b CROSS JOIN filter_finished f CROSS JOIN vector_finished v CROSS JOIN finished r`;
}
