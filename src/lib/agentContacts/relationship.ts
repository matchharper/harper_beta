import type { Query } from "@/lib/career/matching/internalScoring/database";
import { getVisibleOrgStage } from "@/lib/org/visibleStage";

export async function readAgentContactRelationship(
  q: Query,
  recommendationId: string
) {
  const [rec] = await q(
    "select * from talent_opportunity_recommendation where id=$1::uuid for share",
    [recommendationId]
  );
  if (
    !rec ||
    rec.saved_stage === "closed" ||
    !["like", "positive"].includes(rec.feedback)
  )
    throw new Error("Candidate consent is no longer active");
  const tags = await q(
    "select tag from talent_opportunity_tag where talent_id=$1::uuid and opportunity_id=$2::uuid order by updated_at desc,id desc",
    [rec.talent_id, rec.role_id]
  );
  const stages = await q(
    "select id from ops_matching_role_stages where role_id=$1::uuid",
    [rec.role_id]
  );
  const connected = await q(
    "select id from talent_progress where recommendation_id=$1::uuid and kind='org_stage_change' and metadata @> '{\"stage\":\"connected\"}'::jsonb limit 1",
    [rec.id]
  );
  const state = getVisibleOrgStage({
    connectedByOrgAction: !!connected.length,
    customStageByTagKey: new Map(
      stages.map((s) => [`내부단계:${s.id}`, `custom:${s.id}` as const])
    ),
    feedback: rec.feedback,
    includeInternalAccepted: false,
    isInternalRecommendation: true,
    savedStage: rec.saved_stage,
    tags: tags as { tag: string }[],
  });
  return { rec, stage: state?.stage };
}
