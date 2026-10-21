import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  getSupabaseAdmin,
} from "@/lib/server/candidateAccess";
import {
  assertOrgWorkspacePermission,
  assertOrgRoleAccess,
  OrgHttpError,
  fetchOrgTalentDetail,
} from "@/lib/org/server";
import { ensureOrgRoleCreationConversation } from "@/lib/org/agent/store";
import { generateCandidateContactDraft } from "@/lib/companyTalentRequests/copy";
import type { CandidateRoleMoveInput } from "@/lib/org/candidateRoleMove";

export const maxDuration = 180;

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json()) as CandidateRoleMoveInput;
    const fields = [
      "workspaceId",
      "talentId",
      "sourceRoleId",
      "targetRoleId",
      "recommendationId",
      "expectedStage",
      "targetStageId",
      "requestId",
    ] as const;
    if (
      !body ||
      fields.some((key) => typeof body[key] !== "string" || !body[key].trim())
    ) {
      throw new OrgHttpError(400, "Missing candidate move fields");
    }
    if (body.method !== "direct" && body.method !== "ask_candidate")
      throw new OrgHttpError(400, "Invalid move method");
    if (
      body.method === "direct" &&
      body.expectedStage !== "company_intro" &&
      body.confirmedDirectly !== true
    ) {
      return NextResponse.json({ status: "direct_confirmation_required" });
    }
    const admin = getSupabaseAdmin();
    await assertOrgWorkspacePermission({
      admin,
      user,
      workspaceId: body.workspaceId,
      permission: "manage_candidates",
    });
    await assertOrgRoleAccess({
      admin,
      user,
      workspaceId: body.workspaceId,
      roleId: body.sourceRoleId,
    });
    await assertOrgRoleAccess({
      admin,
      user,
      workspaceId: body.workspaceId,
      roleId: body.targetRoleId,
    });
    const { conversation } = await ensureOrgRoleCreationConversation({
      user,
      workspaceId: body.workspaceId,
      roleId: body.sourceRoleId,
      allowCompletedRole: true,
    });
    let copy: { subject: string; body: string; requestContext: string } | null =
      null;
    if (body.method === "ask_candidate") {
      // A lost HTTP response must not trigger another composition or contact.
      const { data: previous, error: previousError } = await (
        admin.from("company_messages") as any
      )
        .select("metadata")
        .eq("company_workspace_id", body.workspaceId)
        .eq("company_user_id", user.id)
        .contains("metadata", {
          roleMoveRequestKey: `org-web-role-move:${user.id}:${body.requestId}`,
          targetRoleId: body.targetRoleId,
          talentId: body.talentId,
        })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previousError) throw previousError;
      if (previous?.metadata?.roleMoveResult)
        return NextResponse.json(previous.metadata.roleMoveResult);
      const detail = await fetchOrgTalentDetail({
        recommendationId: body.recommendationId,
        roleId: body.sourceRoleId,
        talentId: body.talentId,
        user,
        workspaceId: body.workspaceId,
      });
      if (
        detail.recommendation.stage !== body.expectedStage ||
        ["company_intro", "intro_requested"].includes(
          detail.recommendation.stage
        )
      ) {
        return NextResponse.json({ status: "state_changed" });
      }
      const [target, setting] = await Promise.all([
        admin
          .from("company_roles")
          .select("name,description,status")
          .eq("role_id", body.targetRoleId)
          .eq("company_workspace_id", body.workspaceId)
          .single(),
        admin
          .from("talent_setting")
          .select("setting_locale,preferred_locale")
          .eq("user_id", body.talentId)
          .single(),
      ]);
      if (target.error) throw target.error;
      if (setting.error) throw setting.error;
      copy = await generateCandidateContactDraft({
        candidateName: detail.talent.name ?? "",
        companyName: detail.workspace.companyName,
        roleName: detail.role.name,
        locale: setting.data.setting_locale ?? setting.data.preferred_locale,
        profileUrl: null,
        recentConversation: "",
        requestId: body.requestId,
        requestContext: `The company asks whether the candidate agrees to change from ${detail.role.name} to ${target.data.name}. If the candidate accepts, the company has authorized the Role change without another approval.`,
        verifiedContext: JSON.stringify({
          currentRole: detail.role.name,
          proposedRole: target.data.name,
          proposedRoleDescription: target.data.description,
        }),
        currentInstruction:
          "Ask the candidate whether they would like to proceed with the proposed Role instead. Explain the proposed Role using the supplied facts, and that agreeing will move their process to that Role. Keep the question concise and do not imply that they have already accepted or that an interview is being scheduled.",
        deliveryIntent: "direct_reply",
      });
    }
    const { data, error } = await (admin.rpc as any)(
      "move_org_candidate_role_web_v1",
      {
        p_method: body.method,
        p_confirmed_directly: body.confirmedDirectly === true,
        p_subject: copy?.subject ?? null,
        p_body: copy?.body ?? null,
        p_context: copy?.requestContext ?? null,
        p_workspace_id: body.workspaceId,
        p_talent_id: body.talentId,
        p_source_role_id: body.sourceRoleId,
        p_target_role_id: body.targetRoleId,
        p_recommendation_id: body.recommendationId,
        p_expected_stage: body.expectedStage,
        p_target_stage: body.targetStageId,
        p_request_id: body.requestId,
        p_actor_id: user.id,
        p_conversation_id: conversation.id,
      }
    );
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof OrgHttpError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    if (error instanceof Error && error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[org/candidate-role]", error);
    return NextResponse.json(
      { error: "Could not move candidate" },
      { status: 500 }
    );
  }
}
