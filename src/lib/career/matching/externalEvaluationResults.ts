import { z } from "zod";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { sqlLiteral } from "@/lib/talentOnboarding/jobPostingRecommendations";
import { executeSql } from "@/lib/externalRecommendationsV2/retrieval";
import { FIT_RANKING_WEIGHTS, LEGACY_FIT_RANKING_WEIGHTS, type Fit, type LegacyFit } from "@/lib/externalRecommendationsV2/contract";
import {
  eligibilitySql,
  expiredExternalRoleSql,
} from "@/lib/externalRecommendationsV2/roleSql";

export const EXTERNAL_EVALUATION_PAGE_SIZE = 30;

type EvaluationScope =
  | { runId: string; matchingId?: string }
  | { runId?: string; matchingId: string };

export type ExternalEvaluationResult = {
  id: string;
  role_id: string;
  is_recommended: boolean;
  ranking_score?: number | null;
  assessment: { fit: Fit | LegacyFit; [key: string]: unknown };
  evaluated_at: string;
  input_fingerprint: string;
  estimated_base_salary?: string | null;
  role: {
    name: string;
    summary?: unknown;
    company_workspace_id: string;
    company_workspace: { company_name: string } | null;
  } | null;
};

const uuidSql = (id: string) =>
  `${sqlLiteral(z.string().uuid().parse(id))}::uuid`;

const rankingScoreSql = `CASE WHEN e.assessment->'fit' ? 'roleFit' THEN
          ${LEGACY_FIT_RANKING_WEIGHTS.mutualFit} * (e.assessment#>>'{fit,mutualFit}')::numeric
          + ${LEGACY_FIT_RANKING_WEIGHTS.candidateInterest} * (e.assessment#>>'{fit,candidateInterest}')::numeric
          + ${LEGACY_FIT_RANKING_WEIGHTS.companyInterest} * (e.assessment#>>'{fit,companyInterest}')::numeric
          + ${LEGACY_FIT_RANKING_WEIGHTS.roleFit} * (e.assessment#>>'{fit,roleFit}')::numeric
        ELSE ${FIT_RANKING_WEIGHTS.mutualFit} * (e.assessment#>>'{fit,mutualFit}')::numeric
          + ${FIT_RANKING_WEIGHTS.candidateInterest} * (e.assessment#>>'{fit,candidateInterest}')::numeric
          + ${FIT_RANKING_WEIGHTS.companyInterest} * (e.assessment#>>'{fit,companyInterest}')::numeric
        END`;

/** Resolve only the evaluation that was used to publish each recommendation. */
export async function readRecommendationRankingScores(args: {
  admin: TalentAdminClient;
  userId: string;
  recommendations: { id: string; roleId: string; evaluationId: unknown }[];
}) {
  const uuid = z.string().uuid();
  const references = args.recommendations.flatMap(({ id, roleId, evaluationId }) => {
    const parsed = uuid.safeParse(evaluationId);
    return parsed.success
      ? [{ id, role_id: roleId, evaluation_id: parsed.data }]
      : [];
  });
  if (!references.length) return new Map<string, number | null>();
  const [result] = await executeSql<{
    scores: { id: string; score: number | null }[];
  }>(
    args.admin,
    `SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', ref.id, 'score', ${rankingScoreSql}
    )), '[]'::jsonb) AS scores
    FROM jsonb_to_recordset(${sqlLiteral(JSON.stringify(references))}::jsonb)
      AS ref(id uuid, role_id uuid, evaluation_id uuid)
    JOIN public.talent_external_evaluations e ON e.id = ref.evaluation_id
      AND e.role_id = ref.role_id AND e.talent_id = ${uuidSql(args.userId)}`,
    1
  );
  return new Map(result?.scores.map(({ id, score }) => [id, score]));
}

/** Resolve a run's actual references inside the DB, including evaluations reused
 * from older runs. Evaluation IDs never become a PostgREST filter URL. */
export async function readExternalEvaluationResults(
  args: EvaluationScope & {
    admin: TalentAdminClient;
    userId: string;
    cursor?: string;
    // null reads the complete set for the existing background follow consumer.
    limit?: number | null;
    excludePreviouslyRecommended?: boolean;
    includeRankingScore?: boolean;
    recommendationCandidates?: { blockedCompanies: string[] };
  }
) {
  const limit =
    args.limit === undefined ? EXTERNAL_EVALUATION_PAGE_SIZE : args.limit;
  if (limit !== null && (!Number.isSafeInteger(limit) || limit < 1))
    throw new Error("Evaluation page size must be a positive integer.");
  const owner = uuidSql(args.userId);
  const scope = [
    args.runId !== undefined ? `r.id = ${uuidSql(args.runId)}` : null,
    args.matchingId !== undefined
      ? `r.matching_id = ${uuidSql(args.matchingId)}`
      : null,
  ]
    .filter(Boolean)
    .join(" AND ");
  const cursor = args.cursor ? uuidSql(args.cursor) : "NULL::uuid";
  const visible = `NOT expired${args.excludePreviouslyRecommended ? " AND NOT previously_recommended" : ""}`;
  const [result] = await executeSql<{
    evaluations: ExternalEvaluationResult[];
    evaluationCount: number;
    remainingEvaluationCount: number;
    expiredRoleCount: number;
    cursorValid: boolean;
  }>(
    args.admin,
    `
    WITH referenced AS MATERIALIZED (
      SELECT DISTINCT linked.id
      FROM public.external_recommendation_runs r
      CROSS JOIN LATERAL unnest(r.evaluation_ids) AS linked(id)
      WHERE r.talent_id = ${owner} AND r.variant = 'career_agent' AND ${scope}
    ), scoped AS MATERIALIZED (
      SELECT e.id, e.role_id,
        -- Rank the model's candidate list; the Career agent still selects recommendations.
        ${rankingScoreSql} AS ranking_score,
        row_number() OVER (PARTITION BY e.role_id ORDER BY e.evaluated_at DESC,e.id DESC) AS role_revision,
        ${expiredExternalRoleSql("role")} AS expired,
        EXISTS (
          SELECT 1 FROM public.talent_opportunity_recommendation prior
          WHERE prior.talent_id = ${owner} AND prior.role_id = e.role_id
        ) AS previously_recommended
      FROM referenced ref
      JOIN public.talent_external_evaluation_index e ON e.id = ref.id
      JOIN public.company_roles role ON role.role_id = e.role_id
      ${args.recommendationCandidates ? "JOIN public.company_workspace cw ON cw.company_workspace_id=role.company_workspace_id LEFT JOIN public.company_db cd ON cd.id=cw.company_db_id" : ""}
      WHERE e.talent_id = ${owner}
      ${args.recommendationCandidates ? `AND ${eligibilitySql({ userId: args.userId, blockedCompanies: args.recommendationCandidates.blockedCompanies }).replaceAll("cr.", "role.")}` : ""}
    ), ranked AS MATERIALIZED (
      -- Keep filtered rows as cursor anchors when their availability changes between pages.
      SELECT id, expired, previously_recommended, ranking_score, row_number() OVER (
        ORDER BY ranking_score DESC NULLS LAST, id
      ) AS position FROM scoped
      ${args.recommendationCandidates ? "WHERE role_revision=1" : ""}
    ), boundary AS (
      SELECT count(*) FILTER (WHERE ${visible}) AS total,
        coalesce(max(position) FILTER (WHERE id = ${cursor}), 0) AS position,
        (${cursor} IS NULL OR count(*) FILTER (WHERE id = ${cursor}) = 1) AS cursor_valid
      FROM ranked
    ), page AS MATERIALIZED (
      SELECT ranked.id, ranked.position, ranked.previously_recommended, ranked.ranking_score FROM ranked CROSS JOIN boundary
      WHERE ${visible} AND ranked.position > boundary.position
      ORDER BY ranked.position LIMIT ${limit ?? "ALL"}
    )
    SELECT coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'role_id', e.role_id, 'assessment', e.assessment,
        'is_recommended', page.previously_recommended,
        ${args.includeRankingScore ? "'ranking_score', page.ranking_score," : ""}
        'evaluated_at', e.evaluated_at, 'input_fingerprint', e.input_fingerprint,
        'estimated_base_salary', e.input_snapshot#>>'{candidate,estimatedBaseSalary}',
        'role', CASE WHEN role.role_id IS NULL THEN NULL ELSE jsonb_build_object(
          'name', role.name, 'summary', role.summary, 'company_workspace_id', role.company_workspace_id,
          'company_workspace', CASE WHEN company.company_workspace_id IS NULL THEN NULL
            ELSE jsonb_build_object('company_name', company.company_name) END
        ) END
      ) ORDER BY page.position)
      FROM page JOIN public.talent_external_evaluations e ON e.id = page.id
      LEFT JOIN public.company_roles role ON role.role_id = e.role_id
      LEFT JOIN public.company_workspace company ON company.company_workspace_id = role.company_workspace_id
    ), '[]'::jsonb) AS evaluations,
      boundary.total AS "evaluationCount",
      (SELECT count(*) FROM ranked WHERE ${visible} AND position > boundary.position)
        - (SELECT count(*) FROM page) AS "remainingEvaluationCount",
      (SELECT count(DISTINCT role_id) FROM scoped WHERE expired${args.excludePreviouslyRecommended ? " AND NOT previously_recommended" : ""}) AS "expiredRoleCount",
      boundary.cursor_valid AS "cursorValid"
    FROM boundary
  `,
    1
  );
  if (!result)
    throw new Error("External evaluation results were not returned.");
  if (!result.cursorValid)
    throw new Error(
      "Evaluation cursor is not part of the requested search results."
    );
  return {
    evaluations: result.evaluations,
    evaluationCount: result.evaluationCount,
    remainingEvaluationCount: result.remainingEvaluationCount,
    expiredRoleCount: result.expiredRoleCount,
    evaluationCursor:
      result.remainingEvaluationCount > 0
        ? result.evaluations.at(-1)!.id
        : null,
  };
}
