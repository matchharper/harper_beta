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
import type { CandidateRoleMoveInput } from "@/lib/org/candidateRoleMove";
import {
  agentContactDatabase,
  companyAgentContactMember,
  sendAgentContact,
} from "@/lib/agentContacts/store";

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
    // The question is sent as a company member (agentContacts/store.ts). An
    // internal full-access user without that membership could store the
    // approval but never send it, so they stop here before anything is stored.
    if (
      body.method === "ask_candidate" &&
      !(await companyAgentContactMember(
        agentContactDatabase().query,
        body.workspaceId,
        user.id,
        body.sourceRoleId
      ))
    )
      return NextResponse.json({ status: "company_member_required" });
    const sendRoleMoveQuestion = async (
      result: Record<string, any>,
      ask: { body: string }
    ) => {
      if (result?.status !== "requested" || !result.sourceMessageId) return result;
      const sent = await sendAgentContact({
        source: {
          kind: "company",
          workspaceId: body.workspaceId,
          userId: user.id,
          messageId: Number(result.sourceMessageId),
        },
        operationKey: `org-web-role-move:${user.id}:${body.requestId}`,
        recommendationId: String(result.recommendationId ?? body.recommendationId),
        roleId: body.sourceRoleId,
        talentId: body.talentId,
        message: ask.body,
      });
      return { ...result, agentMessageId: sent.message.id };
    };
    const { conversation } = await ensureOrgRoleCreationConversation({
      user,
      workspaceId: body.workspaceId,
      roleId: body.sourceRoleId,
      allowCompletedRole: true,
    });
    // Asking goes to the candidate's agent (agent_contact_messages). The DB
    // function records the company's request and returns its message, the
    // source of the question; the candidate's Harper writes to the candidate.
    // An agreement moves nothing: the company's Harper tells the team, and a
    // team member confirms the move.
    let question: { body: string } | null =
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
      if (
        previous?.metadata?.roleMoveResult &&
        !previous.metadata.roleMoveResult.sourceMessageId
      )
        return NextResponse.json(previous.metadata.roleMoveResult);
      const detail = await fetchOrgTalentDetail({
        recommendationId: body.recommendationId,
        roleId: body.sourceRoleId,
        talentId: body.talentId,
        user,
        workspaceId: body.workspaceId,
      });
      if (
        !previous?.metadata?.roleMoveResult &&
        (detail.recommendation.stage !== body.expectedStage ||
          ["company_intro", "intro_requested"].includes(
            detail.recommendation.stage
          ))
      ) {
        return NextResponse.json({ status: "state_changed" });
      }
      const target = await admin
        .from("company_roles")
        .select("name,description,status")
        .eq("role_id", body.targetRoleId)
        .eq("company_workspace_id", body.workspaceId)
        .single();
      if (target.error) throw target.error;
      question = {
        body: [
          `회사가 이 후보자의 ${detail.role.name} 역할 진행을 ${target.data.name} 역할로 옮겨 이어가자고 제안합니다. 후보자가 제안한 역할로 옮겨 진행하기를 원하는지 확인해 주세요. 후보자가 동의하면 회사 팀이 확인한 뒤 역할을 옮기고, 거절하거나 답이 분명하지 않으면 지금 역할의 진행은 그대로입니다. 면접 일정이 잡혔거나 이미 동의했다고 말하지 마세요.`,
          `제안하는 역할: ${target.data.name}`,
          String(target.data.description ?? "").trim(),
        ]
          .filter(Boolean)
          .join("\n\n"),
      };
      if (previous?.metadata?.roleMoveResult)
        return NextResponse.json(
          await sendRoleMoveQuestion(previous.metadata.roleMoveResult, question)
        );
    }
    const { data, error } = await (admin.rpc as any)(
      "move_org_candidate_role_web_v1",
      {
        p_method: body.method === "ask_candidate" ? "ask_candidate_agent" : body.method,
        p_confirmed_directly: body.confirmedDirectly === true,
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
    return NextResponse.json(
      question ? await sendRoleMoveQuestion(data, question) : data
    );
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
