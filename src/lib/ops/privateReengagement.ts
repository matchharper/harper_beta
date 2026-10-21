import "server-only";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { scheduleCompanyTalentContact } from "@/lib/companyTalentRequests/server";

/** Internal authorization is checked by the route. Uses the ordinary candidate transport. */
export async function sendOpsReengagement(args: {
  requestId: string;
  roleId: string;
  talentId: string;
  actorEmail: string;
  subject: string;
  body: string;
}) {
  const admin = getSupabaseAdmin() as any;
  const { data: request, error } = await admin.rpc("prepare_ops_candidate_contact_v1", {
    p_id: args.requestId,
    p_role_id: args.roleId,
    p_talent_id: args.talentId,
    p_actor: args.actorEmail,
    p_subject: args.subject,
    p_body: args.body,
  });
  if (error) throw error;
  if (request.status !== "draft") return request;
  return scheduleCompanyTalentContact({
    admin,
    deliveryMode: "immediate",
    expectedRevision: 1,
    requestId: request.requestId,
    roleId: args.roleId,
    talentId: args.talentId,
    workspaceId: request.workspaceId,
  });
}
