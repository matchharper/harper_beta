import { z } from "zod";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { executeSql } from "@/lib/externalRecommendationsV2/retrieval";
import { eligibilitySql } from "@/lib/externalRecommendationsV2/roleSql";
import { sqlLiteral } from "@/lib/talentOnboarding/jobPostingRecommendations";

export type FollowCompany = {
  id: string;
  revision: number;
  name: string;
  website: string | null;
  researchName: string;
  researchWebsite: string | null;
  companyDbId: number | null;
  workspaceId: string | null;
  scope: string;
  instruction: string;
  followedAt: string;
};
export type FollowRole = {
  id: string;
  followIds: string[];
  source: "external" | "internal";
  name: string;
  company: string;
  postedAt: string | null;
  createdAt: string;
  recommendationId: string | null;
  evaluation: {
    id: string;
    evaluatedAt: string;
    assessment: Record<string, any>;
    runId: string | null;
    stage?: number;
  } | null;
};
export type FollowInventory = {
  companies: FollowCompany[];
  roles: FollowRole[];
};

/** Company scope is applied in SQL before evaluation or presentation limits.
 * Paid history is deliberately reused by talent/role, not profile fingerprints. */
export async function readFollowInventory(
  admin: TalentAdminClient,
  userId: string
): Promise<FollowInventory> {
  const owner = `${sqlLiteral(z.string().uuid().parse(userId))}::uuid`;
  const [result] = await executeSql<FollowInventory>(
    admin,
    `
    WITH follows AS MATERIALIZED (
      SELECT f.*,coalesce(w.company_name,c.name) name,coalesce(w.homepage_url,c.website_url) website,coalesce(c.name,w.company_name) research_name,coalesce(c.website_url,w.homepage_url) research_website
      FROM public.talent_company_follow f
      JOIN public.talent_users t ON t.user_id=f.talent_id AND t.deleted_at IS NULL
      LEFT JOIN public.company_db c ON c.id=f.company_db_id
      LEFT JOIN public.company_workspace w ON w.company_workspace_id=f.company_workspace_id
      JOIN public.talent_setting s ON s.user_id=f.talent_id
      WHERE f.talent_id=${owner} AND f.unfollowed_at IS NULL
        AND ((coalesce(s.get_external_recommendation,true) AND s.status IS DISTINCT FROM 'stopped') OR (coalesce(s.get_internal_recommendation,true) AND coalesce(s.profile_visibility,'')<>'dont_share'))
        AND NOT EXISTS(SELECT 1 FROM unnest(coalesce(s.blocked_companies,'{}'::text[])) b(name)
          WHERE lower(btrim(b.name)) IN (lower(btrim(c.name)),lower(btrim(w.company_name)),lower(btrim(w.published_name)),w.company_workspace_id::text))
    ), roles AS MATERIALIZED (
      SELECT cr.role_id,cr.source_type,cr.name,cr.posted_at,cr.created_at,cw.company_name,array_agg(f.id::text ORDER BY f.id) follow_ids
      FROM follows f JOIN public.company_workspace cw ON
        (f.scope='workspace' AND cw.company_workspace_id=f.company_workspace_id)
        OR (f.scope='company' AND cw.company_db_id=f.company_db_id)
      JOIN public.company_roles cr ON cr.company_workspace_id=cw.company_workspace_id
      JOIN public.talent_setting s ON s.user_id=${owner}
      WHERE coalesce(lower(btrim(cr.information->>'testOnly')),'') NOT IN ('true','1','yes','on')
        AND NOT EXISTS(SELECT 1 FROM unnest(coalesce(s.blocked_companies,'{}'::text[])) b(name)
          WHERE lower(btrim(b.name)) IN (lower(btrim(cw.company_name)),lower(btrim(cw.published_name)),cw.company_workspace_id::text))
        AND ((coalesce(s.get_external_recommendation,true) AND s.status IS DISTINCT FROM 'stopped' AND ${eligibilitySql({ userId, blockedCompanies: [], includePreviouslyRecommended: true })})
          OR (coalesce(s.get_internal_recommendation,true) AND coalesce(s.profile_visibility,'')<>'dont_share'
            AND cr.source_type='internal' AND cr.status='active' AND NOT coalesce(cr.is_expired,false)
            AND (cr.expires_at IS NULL OR cr.expires_at>now())
            AND public.role_matching_slot_type_v1(cr.role_id,now()) IN ('free','paid')))
      GROUP BY cr.role_id,cw.company_name
    )
    SELECT
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'revision',revision,'name',name,'website',website,
        'researchName',research_name,'researchWebsite',research_website,'companyDbId',company_db_id,'workspaceId',company_workspace_id,'scope',scope,'instruction',instruction,'followedAt',followed_at)
        ORDER BY id) FROM follows),'[]'::jsonb) companies,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.role_id,'followIds',r.follow_ids,'source',r.source_type,
        'name',r.name,'company',r.company_name,'postedAt',r.posted_at,'createdAt',r.created_at,
        'recommendationId',prior.id,'evaluation',coalesce(ext.item,int.item)) ORDER BY r.role_id)
        FROM roles r
        LEFT JOIN LATERAL (SELECT jsonb_build_object('id',e.id,'evaluatedAt',e.evaluated_at,'assessment',jsonb_build_object('fit',e.assessment->'fit'),'runId',e.run_id) item
          FROM public.talent_external_evaluations e WHERE r.source_type='external' AND e.talent_id=${owner} AND e.role_id=r.role_id
          ORDER BY e.evaluated_at DESC,e.id DESC LIMIT 1) ext ON true
        LEFT JOIN LATERAL (SELECT jsonb_build_object('id',e.id,'evaluatedAt',e.evaluated_at,'assessment',e.assessment,'stage',e.stage,'runId',e.discovery_run_id) item
          FROM public.company_role_candidate_evaluations e WHERE r.source_type='internal' AND e.talent_id=${owner} AND e.role_id=r.role_id
          ORDER BY e.stage DESC,e.evaluated_at DESC,e.id DESC LIMIT 1) int ON true
        LEFT JOIN LATERAL (SELECT p.id FROM public.talent_opportunity_recommendation p
          WHERE p.talent_id=${owner} AND p.role_id=r.role_id ORDER BY p.id DESC LIMIT 1) prior ON true
      ),'[]'::jsonb) roles`,
    1
  );
  if (!result) throw new Error("Followed-company inventory unavailable");
  return result;
}
