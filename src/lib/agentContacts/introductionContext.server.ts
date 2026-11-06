import type { Query } from "@/lib/career/matching/internalScoring/database";
import type { AgentIntroductionContext } from "./introductionContext";

/** Call only after authorizing these exact correspondence roots for the reader. */
export async function readIntroductionContexts(query: Query, rootIds: string[], options: { companyAudience?: boolean } = {}) {
  if (!rootIds.length) return [];
  const rows = await query(
    `SELECT root.id,root.talent_id,root.role_id,root.recommendation_id,root.created_at::text,
      material.profile_snapshot#>>'{talentUser,name}' AS candidate_name,
      rec.opportunity_type,rec.evidence @> '[{"source":"candidate_request"}]'::jsonb AS candidate_initiated_opportunity,
      intro.id AS company_intro_id,intro.requested_at::text,intro.candidate_sent_at::text
    FROM public.agent_contact_messages root
    JOIN public.talent_opportunity_recommendation rec ON rec.id=root.recommendation_id
      AND rec.talent_id=root.talent_id AND rec.role_id=root.role_id
    LEFT JOIN public.talent_role_materials material ON material.id=root.material_id
      AND material.talent_id=root.talent_id AND material.role_id=root.role_id
    LEFT JOIN LATERAL (
      SELECT id,requested_at,candidate_sent_at FROM public.company_intro_candidates
      WHERE recommendation_id=root.recommendation_id AND talent_id=root.talent_id AND role_id=root.role_id
        AND company_workspace_id=root.company_workspace_id
        AND requested_at IS NOT NULL AND requested_at<=root.created_at
      ORDER BY requested_at,id LIMIT 1
    ) intro ON true
    WHERE root.id=ANY($1::uuid[]) AND root.id=root.root_id AND root.direction='to_company'`,
    [[...new Set(rootIds)]],
  );
  return rows.map((row): AgentIntroductionContext => ({
    rootId: row.id, talentId: row.talent_id, roleId: row.role_id,
    recommendationId: row.recommendation_id, candidateName: row.candidate_name ?? null,
    ...(options.companyAudience && row.candidate_initiated_opportunity === true ? { candidateInitiatedOpportunity: true as const } : {}),
    origin: row.opportunity_type === "intro_request" && row.company_intro_id
      ? { kind: "company_intro", requestedAt: row.requested_at, companyIntroId: row.company_intro_id, candidateSentAt: row.candidate_sent_at }
      : row.opportunity_type === "internal_recommendation"
        ? { kind: "candidate_request", requestedAt: row.created_at }
        : null,
  }));
}
