import { InternalApiError } from "@/lib/internalApi";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { embedTitles } from "@/lib/externalRecommendationsV2/retrieval";
import { flattenRpcRows } from "@/lib/talentOnboarding/jobPostingRecommendations";
import {
  jobTitleSimilarityCandidateLimitSchema,
  jobTitleSimilarityLimitSchema,
  jobTitleSimilarityRequestSchema,
  jobTitleSimilaritySourceSchema,
  type JobTitleSimilaritySource,
  type JobTitleSimilarityResult,
} from "./jobTitleSimilarity";

export function buildJobTitleSimilaritySql(
  vector: number[],
  limit?: number,
  candidateLimit?: number,
  source?: JobTitleSimilaritySource,
  rerank = true
) {
  jobTitleSimilaritySourceSchema.parse(source);
  const resultLimit = jobTitleSimilarityLimitSchema.parse(limit);
  const roleCandidateLimit =
    jobTitleSimilarityCandidateLimitSchema.parse(candidateLimit);
  if (vector.length !== 1536 || !vector.every(Number.isFinite))
    throw new Error("Invalid title embedding");

  const queryVector = `'${JSON.stringify(vector)}'`;
  const eligibleRoles = `r.source_type = 'external'
      AND coalesce(r.is_expired, false) = false
      AND (r.expires_at IS NULL OR r.expires_at > now())
      AND r.status NOT IN ('ended', 'expired', 'closed', 'inactive', 'archived')
      AND coalesce(r.source_provider, '') <> 'user_submitted'
      AND lower(coalesce(r.information->>'testOnly', 'false')) <> 'true'`;
  const distance = `r.title_embedding::public.halfvec(1536) OPERATOR(public.<=>) ${queryVector}::public.halfvec(1536)`;
  const candidates = `SELECT r.role_id, r.name AS role_name, r.company_workspace_id, ${rerank ? "r.title_embedding" : `${distance} AS distance`}
    FROM public.company_roles r
    WHERE r.title_embedding IS NOT NULL
      AND r.title_embedding_text = r.name
      AND ${eligibleRoles}
      AND (SELECT at FROM search_started) IS NOT NULL
    ORDER BY ${distance}
    LIMIT ${roleCandidateLimit}`;
  const scoredRoles = `SELECT role_id, role_name, company_workspace_id,
      1 - (${rerank ? `title_embedding OPERATOR(public.<=>) ${queryVector}::public.vector(1536)` : "distance"}) AS similarity
    FROM nearest_roles
    WHERE (SELECT at FROM search_finished) IS NOT NULL`;
  // Aggregate barriers consume each stage before recording its completion.
  // Scalar dependencies preserve timing order without changing the distance ordering.
  return `WITH search_started AS MATERIALIZED (
    SELECT clock_timestamp() AS at
  ), nearest_roles AS MATERIALIZED (
    ${candidates}
  ), search_finished AS MATERIALIZED (
    SELECT count(*) AS role_count, clock_timestamp() AS at FROM nearest_roles
  ), scored_roles AS MATERIALIZED (
    ${scoredRoles}
  ), ranked AS MATERIALIZED (
    SELECT role_id, role_name, company_workspace_id, similarity
    FROM scored_roles
    ORDER BY similarity DESC, role_id
    LIMIT ${resultLimit}
  ), result_rows AS MATERIALIZED (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'role_id', r.role_id::text,
      'role_name', r.role_name,
      'company_name', cw.company_name,
      'similarity', r.similarity
    ) ORDER BY r.similarity DESC, r.role_id), '[]'::jsonb) AS rows
    FROM ranked r
    LEFT JOIN public.company_workspace cw
      ON cw.company_workspace_id = r.company_workspace_id
  ), results_finished AS MATERIALIZED (
    SELECT rows, clock_timestamp() AS at FROM result_rows
    WHERE (SELECT at FROM search_finished) IS NOT NULL
  )
  SELECT result.rows, jsonb_build_object(
    'candidateSearchMs', extract(epoch FROM (searched.at - started.at)) * 1000,
    'rerankAndFetchMs', extract(epoch FROM (result.at - searched.at)) * 1000
  ) AS timings
  FROM search_started started
  CROSS JOIN search_finished searched
  CROSS JOIN results_finished result`;
}

export async function searchJobTitleSimilarity(
  input: unknown
): Promise<JobTitleSimilarityResult> {
  const parsed = jobTitleSimilarityRequestSchema.safeParse(input);
  if (!parsed.success)
    throw new InternalApiError(400, parsed.error.issues[0].message);

  const [vector] = await embedTitles([parsed.data.text]);
  // This RPC applies HNSW planner/scan settings before planning p_sql;
  // it adds no filters. The title search keeps only its eligibility checks.
  const { data, error } = await getSupabaseAdmin().rpc(
    "search_external_roles_filter_first",
    {
      p_sql: buildJobTitleSimilaritySql(
        vector,
        parsed.data.limit,
        parsed.data.candidateLimit,
        parsed.data.source,
        parsed.data.rerank
      ),
    }
  );
  if (error) throw new Error(error.message);
  const [result] = flattenRpcRows(data) as JobTitleSimilarityResult[];
  if (!result) throw new Error("검색 결과를 받지 못했습니다.");
  return { ...result, rerank: parsed.data.rerank };
}
