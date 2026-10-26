import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { ensureOrgRoleCreationConversation } from "@/lib/org/agent/store";
import { dispatchOrgAgentWebActionJob } from "@/lib/org/agent/webActionTurn";

export const runtime="nodejs";
export const maxDuration=60;

export async function POST(request:NextRequest) {
  const expected=process.env.INTERNAL_WORKER_API_SECRET?.trim();
  const actual=request.headers.get("authorization")?.replace(/^Bearer /i,"")??"";
  if(!expected||Buffer.byteLength(expected)!==Buffer.byteLength(actual)||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))
    return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const body=await request.json();
    const workspaceId=String(body.workspaceId??""),roleId=String(body.roleId??""),slot=String(body.scheduledSlot??"");
    if(!/^[0-9a-f-]{36}$/i.test(workspaceId)||!/^[0-9a-f-]{36}$/i.test(roleId)||!Number.isFinite(Date.parse(slot)))
      return NextResponse.json({error:"Invalid Role-slot"},{status:400});
    const activationRunId=body.activationRunId == null ? null : String(body.activationRunId);
    if(activationRunId && !/^[0-9a-f-]{36}$/i.test(activationRunId))
      return NextResponse.json({error:"Invalid activation receipt"},{status:400});
    const admin:any=getSupabaseAdmin();
    const {data:actors,error}=await admin.from("company_user_workspace").select("company_user_id,authority,access_scope")
      .eq("company_workspace_id",workspaceId).in("authority",["owner","admin"]).order("created_at");
    if(error) throw error;
    // Resolve a current organization-scoped service actor; never invent a recipient.
    const actor=(actors??[]).find((row:any)=>row.authority==="owner")??
      (actors??[]).find((row:any)=>row.access_scope==="organization");
    if(!actor) throw new Error("No authorized scheduled execution actor");
    const auth=await admin.auth.admin.getUserById(actor.company_user_id);
    if(auth.error||!auth.data.user) throw auth.error??new Error("Scheduled actor missing");
    const scoped=await ensureOrgRoleCreationConversation({allowCompletedRole:true,roleId,workspaceId,user:auth.data.user});
    const receipt=await admin.rpc("enqueue_company_scheduled_matching_v1",{p_workspace:workspaceId,p_role:roleId,
      p_slot:slot,p_actor:actor.company_user_id,p_conversation:scoped.conversation.id,p_activation_run:activationRunId});
    if(receipt.error) throw receipt.error;
    if(receipt.data?.jobId) await dispatchOrgAgentWebActionJob({admin,jobId:receipt.data.jobId});
    return NextResponse.json(receipt.data);
  } catch(error) {
    console.error("[scheduled-matching:enqueue]",error);
    return NextResponse.json({error:"Scheduled matching enqueue failed"},{status:500});
  }
}
