import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { isTestOnlyInternalRole } from "@/lib/internalRoleSafety";
import { isInternalRoleCandidateDecisionAvailable } from "@/lib/career/internalOpportunityDecision";

export type PriorityReviewProgressState = "requested" | "reviewing" | "reviewed" | "delayed";

const PRIORITY_REVIEW_INBOX_LIFETIME_MS = 28 * 24 * 60 * 60 * 1000;

export function isPriorityReviewInboxArchived(
  requestedAt: unknown,
  decision: unknown = null,
  now = Date.now()
) {
  // 후보자에게 먼저 추천하기로 선정된 건은 4주가 지나도 대기 목록에 유지한다.
  if (decision != null && decision !== "company_first" && decision !== "no_action") {
    return false;
  }
  const requestedAtMs = typeof requestedAt === "string" ? Date.parse(requestedAt) : NaN;
  return Number.isFinite(requestedAtMs) && now - requestedAtMs >= PRIORITY_REVIEW_INBOX_LIFETIME_MS;
}

export function priorityReviewProgressState(status: unknown): PriorityReviewProgressState {
  if (status === "running") return "reviewing";
  if (status === "completed" || status === "succeeded") return "reviewed";
  if (status === "failed" || status === "partial") return "delayed";
  return "requested";
}

export async function readPriorityReviewProgress(admin:TalentAdminClient,userId:string) {
  const {data,error}=await (admin.from("talent_progress" as any) as any)
    .select("id,created_at,role_id,role:company_roles!inner(name,status,is_expired,expires_at,information,company:company_workspace(company_name))")
    .eq("talent_id",userId).eq("kind","candidate_requested_connection")
    .is("metadata->>withdrawnAt",null).order("created_at",{ascending:true});
  if(error) throw error;
  const rows=(data ?? []) as any[];
  const now = Date.now();
  const visibleRows = rows.filter(row =>
    isInternalRoleCandidateDecisionAvailable(row.role?.status) &&
    !row.role?.is_expired &&
    (!row.role?.expires_at || Date.parse(row.role.expires_at) > now) &&
    !isTestOnlyInternalRole({source_type:"internal",information:row.role?.information}));
  if(!visibleRows.length) return [];
  const {data:recs,error:recError}=await (admin.from("talent_opportunity_recommendation" as any) as any)
    .select("role_id").eq("talent_id",userId).in("role_id",visibleRows.map(row=>row.role_id));
  if(recError) throw recError;
  const presented=new Set((recs ?? []).map((row:any)=>row.role_id));
  const {data:reviews,error:reviewError}=await (admin.from("talent_opportunity_matching_review" as any) as any)
    .select("priority_request_id,reviewed_at,decision").eq("talent_id",userId)
    .in("priority_request_id",visibleRows.map(row=>String(row.id)))
    .is("closed_at",null).order("reviewed_at",{ascending:false});
  if(reviewError) throw reviewError;
  const reviewedRequests=new Set((reviews ?? []).map((review:any)=>String(review.priority_request_id)));
  const latestReviews = new Map<string, any>();
  for (const review of reviews ?? []) {
    const requestId = String(review.priority_request_id);
    if (!latestReviews.has(requestId)) latestReviews.set(requestId, review);
  }
  return visibleRows.filter(row=>!presented.has(row.role_id) &&
      !isPriorityReviewInboxArchived(row.created_at, latestReviews.get(String(row.id))?.decision, now))
    .map(row=>({id:String(row.id),roleId:String(row.role_id),requestedAt:String(row.created_at),
      companyName:String(row.role?.company?.company_name ?? ""),roleTitle:String(row.role?.name ?? ""),
      reviewState:(reviewedRequests.has(String(row.id)) ? "reviewed" : "requested") as PriorityReviewProgressState}));
}
