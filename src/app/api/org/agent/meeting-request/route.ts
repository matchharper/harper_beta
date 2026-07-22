import { NextRequest, NextResponse } from "next/server";
import {
  fetchRoleForOrgAgent,
  fetchWorkspaceForOrgAgent,
  updateOrgAgentAssistantMessageMetadata,
} from "@/lib/org/agent/store";
import type {
  OrgAgentMeetingRequestBody,
  OrgAgentMessageMetadata,
} from "@/lib/org/agent/types";
import { notifyOrgAgentMeetingRequestedSlack } from "@/lib/org/slack";
import { assertOrgRoleAccess, OrgHttpError } from "@/lib/org/server";
import { getSupabaseAdmin, requireAuthenticatedUser } from "@/lib/server/candidateAccess";

function toErrorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/agent/meeting-request]", error);
  return NextResponse.json(
    { error: "Failed to request meeting" },
    { status: 500 }
  );
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function getUserName(user: Awaited<ReturnType<typeof requireAuthenticatedUser>>) {
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  return (
    normalizeText(metadata?.name) ||
    normalizeText(metadata?.full_name) ||
    normalizeText(user.email) ||
    user.id
  );
}

function safeMetadata(value: unknown): OrgAgentMessageMetadata {
  return value && typeof value === "object"
    ? (value as OrgAgentMessageMetadata)
    : {};
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as OrgAgentMeetingRequestBody;
    const workspaceId = normalizeText(body.workspaceId);
    const roleId = normalizeText(body.roleId);
    if (!workspaceId || !roleId) {
      throw new OrgHttpError(400, "Missing required fields");
    }

    const admin = getSupabaseAdmin();
    await assertOrgRoleAccess({ admin, roleId, user, workspaceId });

    let metadata: OrgAgentMessageMetadata | null = null;
    let actionTopic = "";
    let actionReason: string | null = null;

    if (body.messageId && body.actionId) {
      const { data: message, error } = await (
        admin.from("company_messages" as any) as any
      )
        .select("id, company_workspace_id, role_id, role, metadata")
        .eq("id", body.messageId)
        .eq("company_workspace_id", workspaceId)
        .eq("role_id", roleId)
        .maybeSingle();

      if (error) throw error;
      if (!message) throw new OrgHttpError(404, "Message not found");

      metadata = safeMetadata((message as { metadata: unknown }).metadata);
      const action = metadata.actions?.find((item) => item.id === body.actionId);
      if (!action || action.kind !== "schedule_meeting") {
        throw new OrgHttpError(404, "Meeting action not found");
      }
      actionTopic = normalizeText(action.payload.topic);
      actionReason = normalizeText(action.payload.reason) || null;
    }

    const topic =
      normalizeText(body.topic) ||
      actionTopic ||
      "Harper 팀과 직접 논의가 필요한 요청";
    const reason = normalizeText(body.reason) || actionReason;
    const [workspace, role] = await Promise.all([
      fetchWorkspaceForOrgAgent({ admin, workspaceId }),
      fetchRoleForOrgAgent({ admin, roleId, workspaceId }),
    ]);

    await notifyOrgAgentMeetingRequestedSlack({
      actor: {
        email: user.email ?? null,
        name: getUserName(user),
        userId: user.id,
      },
      reason,
      roleId,
      roleName: role.name,
      topic,
      workspace: {
        companyName: workspace.companyName,
        workspaceId,
      },
    });

    if (metadata && body.messageId && body.actionId) {
      const nextMetadata: OrgAgentMessageMetadata = {
        ...metadata,
        actions: metadata.actions?.map((action) =>
          action.id === body.actionId && action.kind === "schedule_meeting"
            ? { ...action, status: "sent" }
            : action
        ),
      };
      await updateOrgAgentAssistantMessageMetadata({
        actionId: body.actionId,
        messageId: body.messageId,
        metadata: nextMetadata,
        user,
        workspaceId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
