import { z } from "zod";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { sqlLiteral } from "@/lib/talentOnboarding/jobPostingRecommendations";
import { executeSql } from "@/lib/externalRecommendationsV2/retrieval";
import type { Fit } from "@/lib/externalRecommendationsV2/contract";
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
  assessment: { fit: Fit; [key: string]: unknown };
  evaluated_at: string;
  input_fingerprint: string;
  role: {
    name: string;
    company_workspace_id: string;
    company_workspace: { company_name: string } | null;
  } | null;
};

const uuidSql = (id: string) =>
  `${sqlLiteral(z.string().uuid().parse(id))}::uuid`;

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
        0.30 * (e.assessment#>>'{fit,mutualFit}')::numeric
          + 0.50 * (e.assessment#>>'{fit,candidateInterest}')::numeric
          + 0.10 * (e.assessment#>>'{fit,companyInterest}')::numeric
          + 0.10 * (e.assessment#>>'{fit,roleFit}')::numeric AS ranking_score,
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
      SELECT id, expired, previously_recommended, row_number() OVER (
        ORDER BY ranking_score DESC NULLS LAST, id
      ) AS position FROM scoped
      ${args.recommendationCandidates ? "WHERE role_revision=1" : ""}
    ), boundary AS (
      SELECT count(*) FILTER (WHERE ${visible}) AS total,
        coalesce(max(position) FILTER (WHERE id = ${cursor}), 0) AS position,
        (${cursor} IS NULL OR count(*) FILTER (WHERE id = ${cursor}) = 1) AS cursor_valid
      FROM ranked
    ), page AS MATERIALIZED (
      SELECT ranked.id, ranked.position, ranked.previously_recommended FROM ranked CROSS JOIN boundary
      WHERE ${visible} AND ranked.position > boundary.position
      ORDER BY ranked.position LIMIT ${limit ?? "ALL"}
    )
    SELECT coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'role_id', e.role_id, 'assessment', e.assessment,
        'is_recommended', page.previously_recommended,
        'evaluated_at', e.evaluated_at, 'input_fingerprint', e.input_fingerprint,
        'role', CASE WHEN role.role_id IS NULL THEN NULL ELSE jsonb_build_object(
          'name', role.name, 'company_workspace_id', role.company_workspace_id,
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
