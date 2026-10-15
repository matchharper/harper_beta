import { recordOrgAction } from "@/lib/org/actionLogs";
import { NextRequest, NextResponse } from "next/server";
import { assertOrgWorkspacePermission, OrgHttpError } from "@/lib/org/server";
import { getSupabaseAdmin, requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { fetchOrgTeams } from "@/lib/org/teamAccess";

function identifier(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value))
    throw new OrgHttpError(400, "선택한 대상을 확인해 주세요.");
  return value;
}
function identifiers(value: unknown) {
  if (!Array.isArray(value) || value.length > 1000) throw new OrgHttpError(400, "선택한 대상을 확인해 주세요.");
  return [...new Set(value.map(identifier))];
}
function failure(error: unknown) {
  if (error instanceof OrgHttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const code = (error as { message?: string })?.message;
  if ((error as { code?: string })?.code === "23505") return NextResponse.json({ error: "같은 이름의 팀이 이미 있어요. 다른 이름을 입력해 주세요." }, { status: 409 });
  const messages: Record<string, string> = {
    org_team_owner_required: "Owner만 팀과 접근 범위를 관리할 수 있습니다.",
    org_team_not_found: "팀을 찾을 수 없습니다.",
    org_team_invalid_member: "선택한 팀원을 확인해 주세요.",
    org_team_invalid_role: "선택한 Role을 확인해 주세요.",
    org_team_has_roles: "배정된 Role을 다른 팀 또는 미배정으로 옮긴 뒤 팀을 삭제해 주세요.",
    org_team_owner_all_access: "Owner는 Organization 전체에 접근합니다.",
    org_team_invalid_scope: "접근 범위를 확인해 주세요.",
  };
  if (code && messages[code]) return NextResponse.json({ error: messages[code] }, { status: code === "org_team_owner_required" ? 403 : 409 });
  console.error("[org/teams]", error);
  return NextResponse.json({ error: "팀 설정을 저장하지 못했습니다." }, { status: 500 });
}

async function mutate(req: NextRequest, action: "create" | "update" | "delete") {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json();
    const workspaceId = identifier(body.workspaceId);
    const admin = getSupabaseAdmin();
    await assertOrgWorkspacePermission({ admin, user, workspaceId, permission: "manage_members" });
    if (action === "update" && body.userId !== undefined) {
      if (body.accessScope !== "organization" && body.accessScope !== "team") throw new OrgHttpError(400, "접근 범위를 확인해 주세요.");
      const { error } = await (admin.rpc as any)("set_company_member_teams_v2", {
        p_workspace: workspaceId, p_actor: user.id, p_user: identifier(body.userId),
        p_scope: body.accessScope, p_teams: identifiers(body.teamIds),
      });
      if (error) throw error;
      await recordOrgAction({ admin, actorUserId: user.id, type: "org_member_access_saved",
        metadata: { workspaceId, targetUserId: body.userId, after: body.accessScope,
          teamIds: identifiers(body.teamIds) } });
      return NextResponse.json({ ok: true });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (action !== "delete" && (!name || name.length > 100)) throw new OrgHttpError(400, "팀 이름을 100자 이내로 입력해 주세요.");
    const { data, error } = await (admin.rpc as any)("manage_company_team_v1", {
      p_workspace: workspaceId, p_actor: user.id, p_action: action,
      p_team: action === "create" ? null : identifier(body.teamId), p_name: name,
      p_members: action === "delete" ? [] : identifiers(body.userIds),
      p_roles: action === "delete" ? [] : identifiers(body.roleIds),
    });
    if (error) throw error;
    await recordOrgAction({ admin, actorUserId: user.id,
      type: action === "create" ? "org_team_created" : action === "delete" ? "org_team_deleted" : "org_team_saved",
      metadata: { workspaceId, resourceId: action === "create" ? String(data) : body.teamId,
        targetLabel: name || "팀", memberIds: action === "delete" ? [] : identifiers(body.userIds),
        roleIds: action === "delete" ? [] : identifiers(body.roleIds) } });
    return NextResponse.json({ ok: true, teamId: data, teams: await fetchOrgTeams(admin, workspaceId) });
  } catch (error) { return failure(error); }
}
export const POST = (req: NextRequest) => mutate(req, "create");
export const PATCH = (req: NextRequest) => mutate(req, "update");
export const DELETE = (req: NextRequest) => mutate(req, "delete");
