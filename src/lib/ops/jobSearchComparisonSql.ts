import {
  countriesSchema,
  type CountryWeight,
} from "../externalRecommendationsV2/countries";
import { buildCountrySelectionCtes } from "../externalRecommendationsV2/countrySelectionSql";
import type { ComparisonToggles } from "./jobSearchComparison";
import { indexedTitleCandidatesSql } from "../externalRecommendationsV2/indexedTitleSearch";

export type ComparisonFixture = {
  id: string;
  capturedAt: string;
  failure: string;
  countries: string[];
  countryWeights?: CountryWeight[];
  remoteMode?: "any" | "only" | "exclude";
  remoteOnlyCountries?: string[];
  candidateLimit: number;
  resultLimit: number;
  vector: number[];
  originalSql: string;
  sourceSha256: string;
  filters: Record<
    | "postingRecency"
    | "excludeIntern"
    | "excludeParttime"
    | "excludeContract"
    | "remote"
    | "eligibility",
    string[]
  >;
  scores: Record<"fts" | "salary" | "seniority" | "postingRecency", string>;
};

// Only trusted, server-side capture fragments enter this builder. The browser
// supplies a case identifier and booleans, never SQL or query expressions.
export function buildJobSearchComparisonPlan(
  fixture: ComparisonFixture,
  options: ComparisonToggles
) {
  if (fixture.vector.length !== 1536 || !fixture.vector.every(Number.isFinite))
    throw new Error("Invalid captured embedding");
  if (
    !Number.isInteger(fixture.candidateLimit) ||
    fixture.candidateLimit < 1 ||
    fixture.candidateLimit > 3000 ||
    !Number.isInteger(fixture.resultLimit) ||
    fixture.resultLimit < 1 ||
    fixture.resultLimit > fixture.candidateLimit
  )
    throw new Error("Invalid captured search limits");
  if (options.countries && !fixture.countries.length)
    throw new Error("Invalid captured countries");
  const countries = options.countries
    ? countriesSchema.parse(
        fixture.countryWeights ??
          fixture.countries.map((countryCode) => ({
            countryCode,
            weight: 1,
            remoteOnly: false,
          }))
      )
    : undefined;
  if (options.remote && fixture.filters.remote.length && !fixture.remoteMode)
    throw new Error("Rebuild fixture metadata for indexed remote filters");
  const nearestSql = indexedTitleCandidatesSql({
    vector: fixture.vector,
    countries: options.countries ? fixture.countries : [],
    countryWeights: countries,
    excludeParttime:
      options.excludeParttime && fixture.filters.excludeParttime.length > 0,
    excludeContract:
      options.excludeContract && fixture.filters.excludeContract.length > 0,
    remoteMode: options.remote ? fixture.remoteMode : "any",
    remoteOnlyCountries: options.remote ? fixture.remoteOnlyCountries : [],
    excludeIntern:
      options.excludeIntern && fixture.filters.excludeIntern.length > 0,
    candidateLimit: fixture.candidateLimit,
  });
  // Time-dependent availability cannot be a permanent index predicate. Other
  // optional filters also stay after this bounded pool to avoid an index for
  // every filter combination. Never refill after these filters.
  const where = [
    "(cr.expires_at IS NULL OR cr.expires_at > now())",
    ...Object.entries(fixture.filters).flatMap(([key, clauses]) =>
      ![
        "excludeIntern",
        "excludeParttime",
        "excludeContract",
        "remote",
      ].includes(key) && options[key as keyof typeof fixture.filters]
        ? clauses
        : []
    ),
  ];
  const columns = [
    ...(options.postingRecency ? ["cr.posted_at"] : []),
    ...(options.seniority ? ["cr.seniority_level"] : []),
    ...(options.fts ? ["cr.opportunity_search_tsv"] : []),
    ...(options.salary
      ? [
          "cr.salary_min",
          "cr.salary_max",
          "cr.salary_currency",
          "cr.salary_period",
        ]
      : []),
  ];
  const joins = options.eligibility
    ? "JOIN public.company_workspace cw ON cw.company_workspace_id=cr.company_workspace_id LEFT JOIN public.company_db cd ON cd.id=cw.company_db_id"
    : "";
  const score = (key: keyof ComparisonFixture["scores"], neutral = "0") =>
    options[key] ? fixture.scores[key] : neutral;
  // Country-specific remote requirements without the country toggle also need
  // separate graphs. Captured fixtures with this combination require explicit
  // country scope; do not silently apply the condition after ANN.
  if (
    options.remote &&
    !options.countries &&
    fixture.remoteMode === "any" &&
    fixture.remoteOnlyCountries?.length
  )
    throw new Error(
      "Enable countries to compare country-specific remote conditions"
    );
  const resultsSql = `WITH candidates AS MATERIALIZED (
 ${nearestSql}
), candidate_details AS MATERIALIZED (
 SELECT cr.role_id,cr.company_workspace_id,cr.country_code,cr.name AS role_name,n.distance${columns.length ? `,${columns.join(",")}` : ""}
 FROM candidates n JOIN public.company_roles cr ON cr.role_id=n.role_id ${joins}
 WHERE ${where.join(" AND ")}
), signals AS MATERIALIZED (
 SELECT cr.role_id, cr.company_workspace_id, cr.country_code, cr.role_name, cr.distance,
 ${score("fts")} AS lexical_score, ${score("salary", "0.5::numeric")} AS salary_utility,
 ${score("seniority")} AS entry_preference_score, ${score("postingRecency")} AS recency_score
 FROM candidate_details cr
), scored AS (
 SELECT *, lexical_score/(1+lexical_score) + 0.35*(2*salary_utility-1) + entry_preference_score + recency_score AS search_rank FROM signals
), ${
    options.companyCap
      ? `company_ranked AS (
 SELECT *, row_number() OVER (PARTITION BY company_workspace_id ORDER BY search_rank DESC,distance,role_id) AS company_rank FROM scored
), eligible AS (SELECT * FROM company_ranked WHERE company_rank <= 3)`
      : "eligible AS (SELECT * FROM scored)"
  }, company_capped AS (SELECT *,NULL::timestamptz AS posted_at FROM eligible),
${
  countries
    ? buildCountrySelectionCtes(countries, fixture.resultLimit)
    : `selected AS MATERIALIZED (
 SELECT * FROM company_capped ORDER BY search_rank DESC,distance,role_id LIMIT ${fixture.resultLimit}
)`
}
 SELECT (SELECT count(*) FROM candidates) AS candidate_count,
 (SELECT count(*) FROM candidate_details) AS filtered_count,
 coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.search_rank DESC,r.title_similarity DESC,r.role_id),'[]'::jsonb) AS rows
 FROM (SELECT s.role_id::text,s.role_name,cw.company_name,s.country_code,
 1-s.distance AS title_similarity,s.search_rank,s.lexical_score AS fts_score,s.salary_utility
 FROM selected s LEFT JOIN public.company_workspace cw ON cw.company_workspace_id=s.company_workspace_id) r`;
  return { nearestSql, resultsSql };
}

export function buildJobSearchComparisonSql(
  fixture: ComparisonFixture,
  options: ComparisonToggles
) {
  return buildJobSearchComparisonPlan(fixture, options).resultsSql;
}
