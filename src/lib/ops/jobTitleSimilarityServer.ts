import { InternalApiError } from "@/lib/internalApi";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  EMBEDDING_MODEL,
  embedTitles,
} from "@/lib/externalRecommendationsV2/retrieval";
import { flattenRpcRows } from "@/lib/talentOnboarding/jobPostingRecommendations";
import {
  jobTitleSimilarityRequestSchema,
  type JobTitleSimilarityRow,
} from "./jobTitleSimilarity";

export function buildJobTitleSimilaritySql(vector: number[]) {
  if (vector.length !== 1536 || !vector.every(Number.isFinite))
    throw new Error("Invalid title embedding");

  // The dictionary is the current title embedding source; the role column is legacy.
  // Reuse the live-title ANN index, then score its neighbors in full precision.
  const queryVector = `'${JSON.stringify(vector)}'`;
  return `WITH nearest_titles AS MATERIALIZED (
    SELECT te.title_key, te.title, te.embedding
    FROM public.external_role_title_embeddings te
    WHERE te.embedding IS NOT NULL
      AND te.live_role_count > 0
      AND te.model = '${EMBEDDING_MODEL}'
    ORDER BY te.embedding::public.halfvec(1536) OPERATOR(public.<=>) ${queryVector}::public.halfvec(1536)
    LIMIT 1000
  ), scored_titles AS MATERIALIZED (
    SELECT title_key, title,
      1 - (embedding OPERATOR(public.<=>) ${queryVector}::public.vector(1536)) AS similarity
    FROM nearest_titles
  ), ranked AS MATERIALIZED (
    SELECT cr.role_id, cr.name AS role_name, cr.company_workspace_id, nt.similarity
    FROM scored_titles nt
    JOIN LATERAL (
      SELECT r.role_id, r.name, r.company_workspace_id
      FROM public.company_roles r
      WHERE r.source_type = 'external'
        AND md5(r.name) = nt.title_key AND r.name = nt.title
        AND coalesce(r.is_expired, false) = false
        AND (r.expires_at IS NULL OR r.expires_at > now())
        AND r.status NOT IN ('ended', 'expired', 'closed', 'inactive', 'archived')
        AND coalesce(r.source_provider, '') <> 'user_submitted'
        AND lower(coalesce(r.information->>'testOnly', 'false')) <> 'true'
      OFFSET 0
    ) cr ON true
    ORDER BY similarity DESC, cr.role_id
    LIMIT 20
  )
  SELECT r.role_id::text, r.role_name, cw.company_name, r.similarity
  FROM ranked r
  LEFT JOIN public.company_workspace cw
    ON cw.company_workspace_id = r.company_workspace_id
  ORDER BY r.similarity DESC, r.role_id`;
}

export async function searchJobTitleSimilarity(
  input: unknown
): Promise<JobTitleSimilarityRow[]> {
  const parsed = jobTitleSimilarityRequestSchema.safeParse(input);
  if (!parsed.success)
    throw new InternalApiError(400, parsed.error.issues[0].message);

  const [vector] = await embedTitles([parsed.data.text]);
  const { data, error } = await getSupabaseAdmin().rpc(
    "search_external_roles_v2",
    { p_sql: buildJobTitleSimilaritySql(vector) }
  );
  if (error) throw new Error(error.message);
  return flattenRpcRows(data) as JobTitleSimilarityRow[];
}
